"""Helpers de WebSocket compartilhados entre ws_chat, ws_reuniao e ws_mesa."""
import asyncio

from fastapi import WebSocket


async def _stream(ws: WebSocket, agent: str, text: str):
    words = text.split(" ")
    chunk_size = 10
    for i in range(0, len(words), chunk_size):
        chunk = " ".join(words[i:i + chunk_size])
        if i + chunk_size < len(words):
            chunk += " "
        await ws.send_json({"type": "token", "agent": agent, "content": chunk})
        await asyncio.sleep(0.06)


def _make_on_token(ws_conn, event_loop, agent_name: str):
    """Retorna callback síncrono que envia tokens de streaming via WS a partir de uma thread."""
    def on_token(text: str) -> None:
        asyncio.run_coroutine_threadsafe(
            ws_conn.send_json({"type": "token", "agent": agent_name, "content": text}),
            event_loop,
        )
    return on_token


def _make_confirmacao_callback(ws_conn, event_loop, agent_name: str):
    """Cria callback síncrono que envia aviso via WS e aguarda confirmação do operador."""
    async def _ask(mensagem: str) -> bool:
        await ws_conn.send_json({"type": "confirmar", "agent": agent_name, "mensagem": mensagem})
        ctrl = await ws_conn.receive_json()
        return ctrl.get("type") == "confirmar_sim"

    def callback(mensagem: str = "") -> bool:
        future = asyncio.run_coroutine_threadsafe(_ask(mensagem), event_loop)
        try:
            return future.result(timeout=300)
        except Exception:
            return False

    return callback
