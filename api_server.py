"""FastAPI + WebSocket backend para o Lemmon Dashboard."""
import asyncio
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import anthropic as _anthropic
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

_anthropic_client = _anthropic.Anthropic()
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))

from agentes.otto import Otto
from agentes.heitor import Heitor
from agentes.salles import Salles
from agentes.sonia import Sonia
from agentes.aya import Aya
from agentes.pedro_abrahao import PedroAbrahao
from core.config import HISTORICO_DIR, OUTPUTS_DIR, AYA_GERAR_HTML, AYA_GERAR_PDF, AYA_PDF_ENGINE
from core.exportador_aya import exportar_dossie

app = FastAPI(title="Lemmon Dashboard API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _salvar_sessao_reuniao(
    session_id: str | None,
    session_path: Path | None,
    briefing: str,
    agentes_usados: list[str],
    historico: list[dict],
    respostas: dict[str, str],
    custos: dict[str, float],
) -> tuple[str, Path]:
    """Cria ou atualiza sessão de reunião conversacional no histórico."""
    session_dir = HISTORICO_DIR / "dashboard"
    session_dir.mkdir(parents=True, exist_ok=True)

    if session_path and session_path.exists():
        registro = json.loads(session_path.read_text(encoding="utf-8"))
        registro["agentes_usados"] = list(dict.fromkeys(agentes_usados))
        registro["respostas"] = respostas
        registro["custos_usd"] = custos
        registro["custo_total_usd"] = sum(custos.values())
        registro["historico"] = historico
        session_path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
        return session_id, session_path

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    registro = {
        "timestamp": datetime.now().isoformat(),
        "origem": "reuniao",
        "briefing": briefing,
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "historico": historico,
        "avaliacao": None,
        "observacoes_operador": "",
        "tags": [],
    }
    path = session_dir / f"{ts}_reuniao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    return path.stem, path


def _salvar_sessao(
    briefing: str,
    agentes_usados: list[str],
    respostas: dict[str, str],
    custos: dict[str, float],
    contexto_tecnico: dict | None = None,
) -> Path:
    """Salva sessão completa da dashboard no histórico."""
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir = HISTORICO_DIR / "dashboard"
    session_dir.mkdir(parents=True, exist_ok=True)

    registro = {
        "timestamp": datetime.now().isoformat(),
        "origem": "dashboard",
        "briefing": briefing,
        "agentes_usados": agentes_usados,
        "respostas": respostas,
        "custos_usd": custos,
        "custo_total_usd": sum(custos.values()),
        "contexto_tecnico": contexto_tecnico or {},
        "avaliacao": None,
        "observacoes_operador": "",
        "tags": [],
    }

    path = session_dir / f"{ts}_sessao.json"
    path.write_text(json.dumps(registro, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


class AvaliacaoPayload(BaseModel):
    session_id: str
    nota: int          # 1–5
    observacoes: str = ""
    tags: list[str] = []


@app.get("/historico")
async def listar_historico():
    session_dir = HISTORICO_DIR / "dashboard"
    if not session_dir.exists():
        return []
    all_files = sorted(
        list(session_dir.glob("*_sessao.json")) + list(session_dir.glob("*_reuniao.json")),
        key=lambda p: p.stem,
        reverse=True,
    )[:200]
    sessions = []
    for path in all_files:
        try:
            dados = json.loads(path.read_text(encoding="utf-8"))
            sessions.append({
                "session_id": path.stem,
                "timestamp": dados.get("timestamp"),
                "briefing": dados.get("briefing", "")[:120],
                "agentes_usados": dados.get("agentes_usados", []),
                "custo_total_usd": dados.get("custo_total_usd", 0),
                "avaliacao": dados.get("avaliacao"),
                "origem": dados.get("origem", "dashboard"),
            })
        except Exception:
            pass
    return sessions


@app.get("/historico/{session_id}")
async def detalhe_historico(session_id: str):
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["session_id"] = session_id  # garante que o id vem do nome do arquivo (nunca null)
    return dados


class ExportarPayload(BaseModel):
    session_id: str


@app.post("/exportar")
async def exportar(payload: ExportarPayload):
    """Gera HTML + PDF do dossiê da Aya a partir de uma sessão salva."""
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    dados = json.loads(path.read_text(encoding="utf-8"))
    markdown_aya = dados.get("respostas", {}).get("aya", "")
    if not markdown_aya.strip():
        raise HTTPException(status_code=400, detail="Sessão não contém output da Aya")

    respostas = dados.get("respostas", {})
    agentes_detectados = [
        a for a in dados.get("agentes_usados", [])
        if a != "aya" and respostas.get(a, "").strip()
    ]

    out_dir = OUTPUTS_DIR / "aya"
    out_dir.mkdir(parents=True, exist_ok=True)
    caminho_md = out_dir / f"{payload.session_id}.md"

    loop = asyncio.get_event_loop()
    resultado = await loop.run_in_executor(
        None,
        lambda: exportar_dossie(
            markdown_original=markdown_aya,
            caminho_md=caminho_md,
            agentes_consultados=agentes_detectados,
            gerar_html=AYA_GERAR_HTML,
            gerar_pdf=AYA_GERAR_PDF,
            pdf_engine=AYA_PDF_ENGINE,
        ),
    )

    return {
        "html_gerado": resultado["html_gerado"],
        "pdf_gerado": resultado["pdf_gerado"],
        "caminho_html": str(resultado["caminho_html"]) if resultado["caminho_html"] else None,
        "caminho_pdf": str(resultado["caminho_pdf"]) if resultado["caminho_pdf"] else None,
        "erros": resultado["erros"],
    }


@app.get("/download/{session_id}/{tipo}")
async def download_arquivo(session_id: str, tipo: str):
    """Serve o HTML ou PDF gerado para download pelo browser."""
    out_dir = OUTPUTS_DIR / "aya"
    if tipo == "html":
        path = out_dir / f"{session_id}.html"
        media_type = "text/html"
    elif tipo == "pdf":
        path = out_dir / f"{session_id}.pdf"
        media_type = "application/pdf"
    else:
        raise HTTPException(status_code=400, detail="Tipo inválido. Use 'html' ou 'pdf'.")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado. Exporte primeiro.")
    return FileResponse(path, media_type=media_type, filename=path.name)


@app.post("/avaliar")
async def avaliar(payload: AvaliacaoPayload):
    """Recebe avaliação da sessão e persiste no JSON já salvo."""
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["avaliacao"] = max(1, min(5, payload.nota))
    dados["observacoes_operador"] = payload.observacoes
    dados["tags"] = payload.tags
    path.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


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


@app.websocket("/ws/chat")
async def chat(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            data = await ws.receive_json()
            names: list[str] = data.get("agents", [])
            briefing: str = data.get("message", "").strip()
            if not briefing or not names:
                continue

            # Se houver imagem anexada, descreve com visão e injeta no briefing
            image_base64: str | None = data.get("image_base64")
            image_media_type: str = data.get("image_media_type", "image/jpeg")
            if image_base64:
                try:
                    _resp = _anthropic_client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=600,
                        messages=[{
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": image_media_type,
                                        "data": image_base64,
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": (
                                        "Descreva esta imagem com detalhes relevantes para "
                                        "criação de conteúdo de vídeo/marketing. Inclua: "
                                        "elementos visuais, texto visível, cores, contexto "
                                        "e mood/atmosfera. Seja objetivo e completo."
                                    ),
                                },
                            ],
                        }],
                    )
                    descricao = _resp.content[0].text
                    briefing = (
                        f"{briefing}\n\n"
                        f"[CONTEXTO VISUAL — Imagem enviada pelo operador]\n"
                        f"{descricao}\n"
                        f"[FIM DO CONTEXTO VISUAL]"
                    )
                except Exception:
                    pass  # não bloqueia se a visão falhar

            manual_mode: bool = data.get("manual_mode", False)
            config: dict = data.get("config", {})
            loop = asyncio.get_running_loop()

            # Retomada de sessão anterior: restaura contexto técnico
            resume_context: dict = data.get("resume_context") or {}
            analise_otto = resume_context.get("analise_otto") or None
            diretrizes_heitor = resume_context.get("diretrizes_heitor") or None
            roteiro_salles = resume_context.get("roteiro_salles") or None

            # Herda respostas anteriores para que a sessão salva fique completa
            respostas: dict[str, str] = dict(resume_context.get("respostas", {}))
            custos: dict[str, float] = dict(resume_context.get("custos_usd", {}))
            pipeline_cancelled = False

            # Se resume_context tem briefing e o usuário não digitou nada novo, mantém o original
            if resume_context.get("briefing") and briefing == resume_context["briefing"]:
                pass  # briefing já é o original
            elif resume_context.get("briefing") and briefing:
                briefing = f"{resume_context['briefing']}\n\n[INSTRUÇÃO ADICIONAL]: {briefing}"
            elif resume_context.get("briefing"):
                briefing = resume_context["briefing"]

            # Config helpers
            cfg_otto = config.get("otto", {})
            cfg_heitor = config.get("heitor", {})
            cfg_salles = config.get("salles", {})
            cfg_sonia = config.get("sonia", {})

            async def _run_agent_step(name: str) -> tuple[str, float] | None:
                """Executa um agente e retorna (text, cost) ou None se cancelado/pulado."""
                nonlocal analise_otto, diretrizes_heitor, roteiro_salles

                if name == "otto":
                    ag = Otto()
                    modo_visual = cfg_otto.get("modo_visual", "completo")
                    res = await loop.run_in_executor(
                        None, lambda: ag.executar(briefing, modo_visual=modo_visual)
                    )
                    analise_otto = res.get("output_tecnico", {})
                    analise_otto["briefing_original"] = briefing
                    return res.get("output_humano", ""), res.get("custo_total_usd", 0)

                elif name == "heitor":
                    ag = Heitor()
                    max_buscas = int(cfg_heitor.get("max_buscas", 3))
                    cb = _make_confirmacao_callback(ws, loop, "heitor")
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            conteudo=briefing,
                            modo="cadeia",
                            modo_saida="log",
                            max_buscas=max_buscas,
                            contexto_otto=analise_otto or {},
                            confirmacao_callback=cb,
                        ),
                    )
                    if res and not res.get("cancelado"):
                        diretrizes_heitor = res.get("output_tecnico")
                        return res.get("output_humano", ""), res.get("custo_total_usd", 0)
                    return "Análise de compliance cancelada.", 0

                elif name == "salles":
                    ag = Salles()
                    formato = cfg_salles.get("formato", "auto")
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            briefing=briefing,
                            formato=formato,
                            analise_otto_existente=analise_otto,
                            diretrizes_heitor=diretrizes_heitor,
                        ),
                    )
                    roteiro_salles = res.get("output_humano", "")
                    return roteiro_salles, res.get("custo_total_usd", 0)

                elif name == "sonia":
                    ag = Sonia()
                    roteiro = roteiro_salles or briefing
                    com_busca = bool(cfg_sonia.get("com_busca", False))
                    usar_tendencias = bool(cfg_sonia.get("usar_tendencias", True))
                    cb = _make_confirmacao_callback(ws, loop, "sonia")
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            roteiro=roteiro,
                            modo="solo",
                            com_busca=com_busca,
                            usar_tendencias=usar_tendencias,
                            contexto_otto=analise_otto,
                            contexto_heitor=diretrizes_heitor,
                            confirmacao_callback=cb,
                        ),
                    )
                    if res and not res.get("cancelado"):
                        return res.get("output_humano", ""), res.get("custo_total_usd", 0)
                    return "Análise de performance cancelada.", 0

                elif name == "aya":
                    ag = Aya()
                    nome_projeto = briefing[:60] if briefing else None
                    # Sempre passa os 4 agentes; None = ausente nesta sessão
                    # (Aya não vai buscar no disco para os ausentes)
                    snap_outputs: dict[str, dict | None] = {
                        "otto": {
                            "output_humano": respostas.get("otto", ""),
                            "output_tecnico": analise_otto,
                        } if analise_otto is not None else None,
                        "heitor": {
                            "output_humano": respostas.get("heitor", ""),
                            "output_tecnico": diretrizes_heitor or {},
                        } if diretrizes_heitor else None,
                        "salles": {
                            "output_humano": roteiro_salles,
                            "output_tecnico": {},
                        } if roteiro_salles else None,
                        "sonia": {
                            "output_humano": respostas.get("sonia", ""),
                            "output_tecnico": {},
                        } if "sonia" in respostas else None,
                    }
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            nome_projeto=nome_projeto,
                            outputs_diretos=snap_outputs,
                        ),
                    )
                    return res.get("output_humano", ""), res.get("custo_total_usd", 0)

                return None

            async def _execute_with_approval(name: str) -> bool:
                """Executa agente com loop de retry em modo manual. Retorna False se pipeline cancelado."""
                nonlocal pipeline_cancelled
                while True:
                    await ws.send_json({"type": "agent_start", "agent": name})
                    try:
                        result = await _run_agent_step(name)
                        if result is None:
                            return True
                        text, cost = result
                        respostas[name] = text
                        custos[name] = cost
                        await _stream(ws, name, text)

                        if manual_mode:
                            await ws.send_json({"type": "agent_done", "agent": name, "cost": cost, "awaiting_approval": True})
                            ctrl = await ws.receive_json()
                            if ctrl.get("type") == "cancel":
                                pipeline_cancelled = True
                                return False
                        else:
                            await ws.send_json({"type": "agent_done", "agent": name, "cost": cost})
                        return True

                    except Exception as e:
                        if manual_mode:
                            await ws.send_json({"type": "agent_error", "agent": name, "error": str(e), "awaiting_retry": True})
                            ctrl = await ws.receive_json()
                            action = ctrl.get("type", "skip")
                            if action == "retry":
                                continue  # reinicia o while
                            elif action == "cancel":
                                pipeline_cancelled = True
                                return False
                            else:  # skip
                                return True
                        else:
                            await ws.send_json({"type": "agent_error", "agent": name, "error": str(e)})
                            return True

            async def _run_gate_espelho() -> bool:
                """Roda Pedro como gate de qualidade após Salles. Retorna False se pipeline cancelado."""
                nonlocal pipeline_cancelled
                gate_mode = cfg_salles.get("gate_espelho", "off")
                if gate_mode == "off" or not roteiro_salles:
                    return True
                await ws.send_json({"type": "agent_start", "agent": "gate_espelho"})
                try:
                    pedro = PedroAbrahao()
                    gate_res = await loop.run_in_executor(
                        None,
                        lambda: pedro.executar(
                            pergunta="Valide se o roteiro abaixo está fiel à minha voz, posicionamento e tom.",
                            contexto_opcional=roteiro_salles,
                            modo="validacao",
                            tags=["gate_pipeline"],
                        ),
                    )
                    gate_text = gate_res.get("output_humano", "")
                    gate_cost = gate_res.get("custo_total_usd", 0)
                    veredicto = "verde"
                    if "🔴" in gate_text:
                        veredicto = "vermelho"
                    elif "🟡" in gate_text:
                        veredicto = "amarelo"
                    respostas["gate_espelho"] = gate_text
                    custos["gate_espelho"] = gate_cost
                    await ws.send_json({
                        "type": "gate_espelho_result",
                        "veredicto": veredicto,
                        "cost": gate_cost,
                    })
                    await _stream(ws, "gate_espelho", gate_text)
                    await ws.send_json({"type": "agent_done", "agent": "gate_espelho", "cost": gate_cost})
                    # Bloqueia se vermelho em modo auto, ou sempre em modo manual
                    if veredicto == "vermelho" or gate_mode == "manual":
                        emoji = "🔴" if veredicto == "vermelho" else "🟡"
                        msg = (
                            f"{emoji} Gate Espelho — veredicto {veredicto}.\n"
                            f"Pedro flagrou problemas de voz/posicionamento.\n\n"
                            f"{gate_text[:500]}\n\nContinuar para Sônia mesmo assim?"
                        )
                        await ws.send_json({"type": "confirmar", "agent": "gate_espelho", "mensagem": msg})
                        ctrl = await ws.receive_json()
                        if ctrl.get("type") != "confirmar_sim":
                            pipeline_cancelled = True
                            return False
                    return True
                except Exception as e:
                    await ws.send_json({"type": "agent_error", "agent": "gate_espelho", "error": str(e)})
                    return True  # gate falhou, não bloqueia

            for name in names:
                if name == "aya":
                    continue
                ok = await _execute_with_approval(name)
                if not ok:
                    break
                # Gate de espelho Pedro entre Salles e Sônia
                if name == "salles" and not pipeline_cancelled:
                    ok = await _run_gate_espelho()
                    if not ok:
                        break

            # Aya compila os outputs dos outros agentes (sempre por último)
            if "aya" in names and not pipeline_cancelled:
                ok = await _execute_with_approval("aya")
                _ = ok

            # Salva sessão completa e envia o ID para o frontend avaliar
            all_agents = list(dict.fromkeys(list(resume_context.get("agentes_usados", [])) + names))
            contexto_tecnico = {
                "briefing": briefing,
                "analise_otto": analise_otto,
                "diretrizes_heitor": diretrizes_heitor,
                "roteiro_salles": roteiro_salles,
                "respostas": respostas,
                "custos_usd": custos,
                "agentes_usados": all_agents,
            }
            session_path = _salvar_sessao(briefing, all_agents, respostas, custos, contexto_tecnico)
            session_id = session_path.stem
            await ws.send_json({"type": "pipeline_done", "session_id": session_id})

    except WebSocketDisconnect:
        pass


# ─── Reunião conversacional ───────────────────────────────────────────

def _parse_mentions(text: str, agents: list[str]) -> list[str]:
    return [a for a in agents if re.search(rf'@{re.escape(a)}\b', text, re.IGNORECASE)]

def _make_agent(name: str):
    mapping = {"otto": Otto, "heitor": Heitor, "salles": Salles, "sonia": Sonia, "aya": Aya, "pedro_abrahao": PedroAbrahao}
    cls = mapping.get(name)
    return cls() if cls else None


@app.websocket("/ws/reuniao")
async def reuniao(ws: WebSocket):
    await ws.accept()
    historico: list[dict] = []
    reun_session_id: str | None = None
    reun_session_path: Path | None = None
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
