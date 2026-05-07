"""WebSocket /ws/reuniao — reunião conversacional multi-agente."""
import asyncio
import re

from fastapi import WebSocket, WebSocketDisconnect

from api.deps import _make_agent, _parse_mentions
from api.storage import _salvar_sessao_reuniao
from api.ws_helpers import _make_on_token
from core.historico_index import adicionar_entrada

_LOOP_AVISO = (
    "[MODO LOOP ATIVO — aplique as instruções QUANDO EM MODO LOOP do seu system prompt.]"
)

_RE_ENTREGA = re.compile(r'\[ENTREGA FINAL\]', re.IGNORECASE)
_RE_AYUDA   = re.compile(r'\[PRECISO DE AYUDA OPERADOR\]', re.IGNORECASE)


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

            historico_cliente = data.get("historico_anterior")
            if historico_cliente is not None:
                historico = list(historico_cliente)

            if not reun_briefing:
                reun_briefing = message

            modo: str = data.get("modo", "auto")

            # ── MODO LOOP ────────────────────────────────────────────────────
            if modo == "loop":
                loop_config: dict = data.get("loop_config", {})
                max_turnos: int = int(loop_config.get("max_turnos", 5))
                custo_cap: float = float(loop_config.get("custo_cap", 1.50))

                historico.append({"role": "user", "content": message})

                loop_custo_total: float = 0.0
                agentes_avisados: set[str] = set()
                last_agent: str | None = None
                consecutive_count: int = 0
                loop_round: int = 0

                # round-robin state
                rr_index: int = 0

                # Determine first agent: @mention in operator message or first in list
                mentioned_first = _parse_mentions(message, agents)
                if mentioned_first:
                    next_agents = mentioned_first[:1]
                else:
                    next_agents = [agents[0]]
                    rr_index = 1 % len(agents)

                loop_running = True
                loop_motivo: str = "turnos_max"
                loop_agente_final: str | None = None

                while loop_running and loop_round < max_turnos:
                    loop_round += 1
                    await ws.send_json({
                        "type": "turn_iteration",
                        "n": loop_round,
                        "total": max_turnos,
                        "custo_total": loop_custo_total,
                    })

                    for name in next_agents:
                        ag = _make_agent(name)
                        if not ag:
                            continue

                        # Cost cap check BEFORE calling agent
                        if loop_custo_total >= custo_cap:
                            loop_motivo = "custo_max"
                            loop_running = False
                            break

                        # Stagnation check
                        if name == last_agent:
                            consecutive_count += 1
                        else:
                            consecutive_count = 0
                            last_agent = name

                        if consecutive_count >= 3:
                            loop_motivo = "stagnacao"
                            loop_running = False
                            break

                        # Build message: inject loop notice on first contact only
                        loop_msg = message if loop_round > 1 else message
                        if name not in agentes_avisados:
                            loop_msg = f"{_LOOP_AVISO}\n\n{message}"
                            agentes_avisados.add(name)

                        await ws.send_json({"type": "agent_start", "agent": name})
                        output_text = ""
                        cost = 0.0
                        try:
                            ev_loop = asyncio.get_running_loop()
                            snap_hist = list(historico)
                            on_tok = _make_on_token(ws, ev_loop, name)
                            result = await ev_loop.run_in_executor(
                                None,
                                lambda ag=ag, h=snap_hist, m=loop_msg, ot=on_tok:
                                    ag.responder(m, h, None, on_token=ot),
                            )
                            output_text = result.get("output_humano", "")
                            cost = result.get("custo_total_usd", 0.0)
                        except Exception as e:
                            await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})
                            continue

                        loop_custo_total += cost
                        historico.append({"role": name, "content": output_text})
                        reun_respostas[name] = output_text
                        reun_custos[name] = reun_custos.get(name, 0.0) + cost
                        if name not in reun_agentes_vistos:
                            reun_agentes_vistos.append(name)

                        await ws.send_json({"type": "agent_done", "agent": name, "cost": cost})

                        # Save JSON per iteration, skip index update (done once at loop_stopped)
                        if reun_respostas:
                            reun_session_id, reun_session_path = _salvar_sessao_reuniao(
                                reun_session_id, reun_session_path,
                                reun_briefing,
                                list(reun_agentes_vistos), list(historico),
                                dict(reun_respostas), dict(reun_custos),
                                skip_index=True,
                            )

                        # Check stop markers
                        if _RE_ENTREGA.search(output_text):
                            loop_motivo = "final"
                            loop_agente_final = name
                            loop_running = False
                            break

                        if _RE_AYUDA.search(output_text):
                            loop_motivo = "ayuda"
                            loop_agente_final = name
                            loop_running = False
                            break

                        # Detect next agent from @mentions in output
                        mentions = _parse_mentions(output_text, agents)
                        # Filter out self-mentions to avoid trivial stagnation
                        mentions_other = [m for m in mentions if m != name]
                        if mentions_other:
                            next_agents = mentions_other[:1]
                        else:
                            # round-robin among agents
                            next_agents = [agents[rr_index % len(agents)]]
                            rr_index = (rr_index + 1) % len(agents)

                    # After processing next_agents, check for operator interrupt
                    if loop_running:
                        try:
                            ctrl = await asyncio.wait_for(ws.receive_json(), timeout=0.05)
                            # Operator sent a message during the loop — process as new turn
                            op_msg: str = ctrl.get("message", "").strip()
                            if op_msg:
                                historico.append({"role": "user", "content": op_msg})
                                # Resume: determine next from mentions in op message
                                op_mentions = _parse_mentions(op_msg, agents)
                                if op_mentions:
                                    next_agents = op_mentions[:1]
                                else:
                                    next_agents = [agents[rr_index % len(agents)]]
                                    rr_index = (rr_index + 1) % len(agents)
                                # Reset stagnation after operator intervention
                                consecutive_count = 0
                            if ctrl.get("type") == "loop_stop":
                                loop_motivo = "operador"
                                loop_running = False
                        except asyncio.TimeoutError:
                            pass  # no message, continue loop
                        except WebSocketDisconnect:
                            break  # client left, stop cleanly

                # Update index once after loop ends
                if reun_session_path:
                    adicionar_entrada(reun_session_path)

                await ws.send_json({
                    "type": "loop_stopped",
                    "motivo": loop_motivo,
                    "n_turnos": loop_round,
                    "custo_total": loop_custo_total,
                    "agente_final": loop_agente_final,
                })
                continue

            # ── MODO AUTO / MANUAL (comportamento original) ───────────────────
            manual: bool = data.get("manual", False)
            mentioned = _parse_mentions(message, agents)
            respondentes = mentioned if (mentioned or manual) else agents

            historico_anterior = list(historico)
            historico.append({"role": "user", "content": message})

            ev_loop = asyncio.get_running_loop()
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
                    on_tok = _make_on_token(ws, ev_loop, name)
                    result = await ev_loop.run_in_executor(
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
                    await ws.send_json({"type": "agent_done", "agent": name, "cost": cost})
                except Exception as e:
                    await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})

            if reun_respostas:
                reun_session_id, reun_session_path = _salvar_sessao_reuniao(
                    reun_session_id, reun_session_path,
                    reun_briefing,
                    list(reun_agentes_vistos), list(historico),
                    dict(reun_respostas), dict(reun_custos),
                )

            await ws.send_json({"type": "turn_done"})

    except WebSocketDisconnect:
        pass
