"""WebSocket /ws/reuniao — reunião conversacional multi-agente."""
import asyncio

from fastapi import WebSocket, WebSocketDisconnect

from api.deps import _make_agent, _parse_mentions
from api.storage import _salvar_sessao_reuniao
from api.ws_helpers import _make_on_token


async def reuniao(ws: WebSocket):
    await ws.accept()
    historico: list[dict] = []
    reun_session_id: str | None = None
    reun_session_path = None
    reun_agentes_vistos: list[str] = []
    reun_respostas: dict[str, str] = {}
    reun_custos: dict[str, float] = {}
    reun_briefing: str = ""
    try:
        while True:
            data = await ws.receive_json()

            if data.get("type") == "reset":
                historico = []
                reun_session_id = None
                reun_session_path = None
                reun_agentes_vistos = []
                reun_respostas = {}
                reun_custos = {}
                reun_briefing = ""
                await ws.send_json({"type": "reset_ok"})
                continue

            agents: list[str] = data.get("agents", [])
            message: str = data.get("message", "").strip()
            if not message or not agents:
                continue

            # Use client-provided history if available (survives WS reconnections)
            historico_cliente = data.get("historico_anterior")
            if historico_cliente is not None:
                historico = list(historico_cliente)

            if not reun_briefing:
                reun_briefing = message

            manual: bool = data.get("manual", False)
            mentioned = _parse_mentions(message, agents)
            # manual=True → só responde se @mencionado; auto → todos respondem se sem menção
            respondentes = mentioned if (mentioned or manual) else agents

            historico_anterior = list(historico)
            historico.append({"role": "user", "content": message})

            loop = asyncio.get_running_loop()
            respostas_turno: list[dict] = []

            for name in respondentes:
                ag = _make_agent(name)
                if not ag:
                    continue

                await ws.send_json({"type": "agent_start", "agent": name})
                try:
                    snap_hist = list(historico_anterior)
                    snap_turno = list(respostas_turno)
                    snap_msg = message
                    on_tok = _make_on_token(ws, loop, name)
                    result = await loop.run_in_executor(
                        None,
                        lambda ag=ag, h=snap_hist, r=snap_turno, m=snap_msg, ot=on_tok:
                            ag.responder(m, h, r or None, on_token=ot),
                    )
                    text = result.get("output_humano", "")
                    cost = result.get("custo_total_usd", 0)
                    historico.append({"role": name, "content": text})
                    respostas_turno.append({"role": name, "content": text})
                    reun_respostas[name] = text
                    reun_custos[name] = reun_custos.get(name, 0) + cost
                    if name not in reun_agentes_vistos:
                        reun_agentes_vistos.append(name)
                    # tokens já enviados via on_token durante o stream — sem fake _stream()
                    await ws.send_json({"type": "agent_done", "agent": name, "cost": cost})
                except Exception as e:
                    await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})

            # Persiste / atualiza sessão de reunião no histórico
            if reun_respostas:
                reun_session_id, reun_session_path = _salvar_sessao_reuniao(
                    reun_session_id,
                    reun_session_path,
                    reun_briefing,
                    list(reun_agentes_vistos),
                    list(historico),
                    dict(reun_respostas),
                    dict(reun_custos),
                )

            await ws.send_json({"type": "turn_done"})

    except WebSocketDisconnect:
        pass
