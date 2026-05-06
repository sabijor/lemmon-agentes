"""WebSocket /ws/mesa_redonda — T10 mesa redonda de agentes."""
import asyncio

from fastapi import WebSocket, WebSocketDisconnect

from agentes.aya import Aya
from api.deps import _make_agent
from api.ws_helpers import _make_on_token
from core.discussao import construir_prompt_ata_mesa, construir_prompt_questionamento_mesa


async def mesa_redonda(ws: WebSocket):
    """Cada agente presente questiona a tese central; Aya sintetiza a ata."""
    await ws.accept()
    try:
        data = await ws.receive_json()
        tese: str = data.get("tese", "").strip()
        briefing: str = data.get("briefing", "").strip()
        agents: list[str] = data.get("agents", [])
        if not tese or not agents:
            await ws.send_json({"type": "error", "error": "tese e agents são obrigatórios"})
            return

        loop = asyncio.get_running_loop()
        questionamentos: dict[str, str] = {}
        questioners = [a for a in agents if a != "aya"]
        has_aya = "aya" in agents

        for name in questioners:
            ag = _make_agent(name)
            if not ag:
                continue
            await ws.send_json({"type": "agent_start", "agent": name})
            try:
                prompt = construir_prompt_questionamento_mesa(name, tese, briefing, agents)
                on_tok = _make_on_token(ws, loop, name)
                result = await loop.run_in_executor(
                    None,
                    lambda ag=ag, p=prompt, ot=on_tok:
                        ag.responder(p, [], None, on_token=ot),
                )
                text = result.get("output_humano", "")
                cost = result.get("custo_total_usd", 0)
                questionamentos[name] = text
                await ws.send_json({"type": "agent_done", "agent": name, "cost": cost})
            except Exception as e:
                await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})

        if has_aya and questionamentos:
            aya_ag = Aya()
            await ws.send_json({"type": "agent_start", "agent": "aya"})
            try:
                ata_prompt = construir_prompt_ata_mesa(tese, briefing, questionamentos)
                on_tok = _make_on_token(ws, loop, "aya")
                result = await loop.run_in_executor(
                    None,
                    lambda p=ata_prompt, ot=on_tok:
                        aya_ag.responder(p, [], None, on_token=ot),
                )
                cost = result.get("custo_total_usd", 0)
                await ws.send_json({"type": "agent_done", "agent": "aya", "cost": cost})
            except Exception as e:
                await ws.send_json({"type": "agent_error", "agent": "aya", "error": str(e)})

        await ws.send_json({"type": "mesa_redonda_done"})
    except WebSocketDisconnect:
        pass
