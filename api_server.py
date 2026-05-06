"""FastAPI + WebSocket backend para o Lemmon Dashboard."""
import asyncio
import json
import re
import sys
from datetime import datetime
from pathlib import Path

import base64
import os
import secrets
from html import escape as html_escape

import anthropic as _anthropic
from anthropic import APIError, APIConnectionError, AuthenticationError, RateLimitError
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse

_anthropic_client = _anthropic.Anthropic()
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).parent))

from agentes.otto import Otto
from agentes.heitor import Heitor
from agentes.salles import Salles
from agentes.sonia import Sonia
from agentes.aya import Aya
from agentes.pedro_abrahao import PedroAbrahao
from core.config import HISTORICO_DIR, OUTPUTS_DIR, AYA_GERAR_HTML, AYA_GERAR_PDF, AYA_PDF_ENGINE, MODELO_PADRAO as LEMMON_MODELO_PADRAO
from core.agente_base import formatar_erro_anthropic

SHARES_DIR = HISTORICO_DIR.parent / "shares"
SHARES_DIR.mkdir(exist_ok=True)

CALIBRAGEM_FILE = HISTORICO_DIR.parent / "calibragem_pedro.json"
from core.exportador_aya import exportar_dossie
from core.discussao import construir_prompt_questionamento_mesa, construir_prompt_ata_mesa
from core.exemplares import salvar_exemplar, carregar_exemplares, remover_exemplar
from core.similaridade import buscar_historico_similar

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


@app.get("/historico/similar")
async def historico_similar(briefing: str, n: int = 3):
    """Retorna as N sessões mais similares ao briefing."""
    resultados = buscar_historico_similar(briefing, HISTORICO_DIR, limite=max(1, min(n, 10)))
    return resultados


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


class ExemplarPayload(BaseModel):
    agente: str
    trecho: str
    contexto: str = ""
    session_id: str = ""


@app.post("/exemplares")
async def criar_exemplar(payload: ExemplarPayload):
    entrada = salvar_exemplar(payload.agente, payload.trecho, payload.contexto, payload.session_id)
    return {"ok": True, "exemplar": entrada}


@app.get("/exemplares/{agente}")
async def listar_exemplares(agente: str):
    return carregar_exemplares(agente)


@app.delete("/exemplares/{agente}/{exemplar_id}")
async def deletar_exemplar(agente: str, exemplar_id: str):
    ok = remover_exemplar(agente, exemplar_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Exemplar não encontrado")
    return {"ok": True}


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


class TagsPayload(BaseModel):
    session_id: str
    tags: list[str] = []


@app.post("/tags")
async def salvar_tags(payload: TagsPayload):
    """Persiste tags aceitas pelo operador, sem exigir avaliação."""
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    dados = json.loads(path.read_text(encoding="utf-8"))
    dados["tags"] = payload.tags
    path.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True}


@app.get("/sugerir_pipeline")
async def sugerir_pipeline(briefing: str):
    """T28: Haiku analisa o briefing e sugere quais agentes fazer sentido."""
    loop = asyncio.get_running_loop()
    AGENTES_DISPONIVEIS = ["otto", "heitor", "salles", "sonia", "aya"]
    prompt = (
        "Analise o briefing e sugira quais agentes da Lemmon Produções devem rodar:\n"
        "- otto: análise estratégica, tese criativa (sempre útil)\n"
        "- heitor: compliance (essencial se houver saúde, termos técnicos, suplementos, medicina)\n"
        "- salles: roteiro filmável (use se precisar de conteúdo de vídeo/roteiro)\n"
        "- sonia: performance e distribuição (use se o conteúdo vai para redes sociais)\n"
        "- aya: compilação final (sempre recomendado no final)\n\n"
        "Responda SOMENTE com JSON válido: "
        '{\"agentes\": [\"otto\", ...], \"razoes\": {\"agente\": \"motivo curto\"}}'
        f"\n\nBriefing:\n{briefing[:1000]}"
    )
    try:
        resp = await loop.run_in_executor(
            None,
            lambda: _anthropic_client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=200,
                messages=[{"role": "user", "content": prompt}],
            ),
        )
    except (APIError, APIConnectionError, AuthenticationError, RateLimitError) as e:
        raise HTTPException(status_code=503, detail=formatar_erro_anthropic(e))
    raw = next((b.text for b in resp.content if hasattr(b, "text")), "")
    try:
        import re as _re
        m = _re.search(r'\{.*\}', raw, _re.DOTALL)
        sugestao = json.loads(m.group()) if m else {}
    except Exception:
        sugestao = {"agentes": AGENTES_DISPONIVEIS, "razoes": {}}
    agentes = [a for a in sugestao.get("agentes", AGENTES_DISPONIVEIS) if a in AGENTES_DISPONIVEIS]
    return {"agentes": agentes, "razoes": sugestao.get("razoes", {})}


class BriefingReversoPayload(BaseModel):
    transcricao: str


@app.post("/briefing_reverso")
async def analisar_briefing_reverso(payload: BriefingReversoPayload):
    """T23: dado um vídeo/texto pronto, infere o briefing e tese original."""
    loop = asyncio.get_running_loop()
    system_p = (
        "Você é Otto, estrategista criativo da Lemmon Produções. "
        "Dado um vídeo ou texto já produzido, você deve reconstruir: "
        "qual era o briefing original que gerou este conteúdo, qual é a tese criativa "
        "subjacente e qual o posicionamento de marca implícito.\n\n"
        "Responda em markdown com 3 seções:\n"
        "## Briefing inferido\n## Tese criativa\n## Posicionamento de marca"
    )
    try:
        resp = await loop.run_in_executor(
            None,
            lambda: _anthropic_client.messages.create(
                model=LEMMON_MODELO_PADRAO,
                max_tokens=1200,
                system=system_p,
                messages=[{"role": "user", "content": f"Analise este conteúdo:\n\n{payload.transcricao[:8000]}"}],
            ),
        )
    except (APIError, APIConnectionError, AuthenticationError, RateLimitError) as e:
        raise HTTPException(status_code=503, detail=formatar_erro_anthropic(e))
    texto = next((b.text for b in resp.content if hasattr(b, "text")), "")
    custo = (resp.usage.input_tokens * 3e-6 + resp.usage.output_tokens * 1.5e-5)
    return {"resultado": texto, "custo_total_usd": round(custo, 6)}


class CortesProntosPayload(BaseModel):
    transcricao: str
    duracoes: list[int] = [15, 30, 60]


@app.post("/cortes_prontos")
async def gerar_cortes_prontos(payload: CortesProntosPayload):
    """T25: a partir de transcrição, propõe cortes autônomos com timestamps."""
    loop = asyncio.get_running_loop()
    durs = ", ".join([f"{d}s" for d in payload.duracoes[:4]])
    system_p = (
        "Você é Sônia, especialista em performance de conteúdo para redes sociais. "
        "Dado o texto de um vídeo longo, proponha cortes autônomos prontos para edição. "
        f"Durações alvo: {durs}. Para cada corte: início/fim aproximado, texto da legenda "
        "principal, hook de abertura e CTA final. Use formato markdown com tabela por duração."
    )
    try:
        resp = await loop.run_in_executor(
            None,
            lambda: _anthropic_client.messages.create(
                model=LEMMON_MODELO_PADRAO,
                max_tokens=2000,
                system=system_p,
                messages=[{"role": "user", "content": f"Transcrição:\n\n{payload.transcricao[:10000]}"}],
            ),
        )
    except (APIError, APIConnectionError, AuthenticationError, RateLimitError) as e:
        raise HTTPException(status_code=503, detail=formatar_erro_anthropic(e))
    texto = next((b.text for b in resp.content if hasattr(b, "text")), "")
    custo = (resp.usage.input_tokens * 3e-6 + resp.usage.output_tokens * 1.5e-5)
    return {"cortes": texto, "custo_total_usd": round(custo, 6)}


# ── T34 — Transcrição de áudio ──────────────────────────────────────────

@app.post("/transcrever")
async def transcrever_audio(audio: UploadFile = File(...)):
    """T34: Transcreve arquivo de áudio .mp3/.m4a/.wav em texto (requer OPENAI_API_KEY)."""
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY não configurada. Adicione ao .env para usar transcrição de áudio.",
        )
    try:
        import io
        import openai as _openai  # type: ignore[import]
        client = _openai.OpenAI(api_key=openai_key)
        content = await audio.read()
        buf = io.BytesIO(content)
        buf.name = audio.filename or "audio.mp3"
        transcription = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: client.audio.transcriptions.create(
                model="whisper-1",
                file=buf,
                language="pt",
            ),
        )
        return {"transcricao": transcription.text}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro na transcrição: {exc}") from exc


# ── T36 — Links de aprovação ─────────────────────────────────────────────

class ComentarioPayload(BaseModel):
    autor: str = Field(default="Cliente", max_length=80)
    texto: str = Field(..., max_length=2000)


class SharePayload(BaseModel):
    session_id: str


def _load_share(token: str) -> dict:
    path = SHARES_DIR / f"{token}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Link não encontrado")
    return json.loads(path.read_text(encoding="utf-8"))


@app.post("/share")
async def criar_share(payload: SharePayload):
    """T36: Gera link de aprovação limpo para uma sessão."""
    sessao_path = HISTORICO_DIR / "dashboard" / f"{payload.session_id}.json"
    if not sessao_path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    sessao = json.loads(sessao_path.read_text(encoding="utf-8"))
    token = secrets.token_urlsafe(16)
    share = {
        "token": token,
        "session_id": payload.session_id,
        "created_at": datetime.now().isoformat(),
        "briefing": sessao.get("briefing", ""),
        "agentes_usados": sessao.get("agentes_usados", []),
        "respostas": sessao.get("respostas", {}),
        "comentarios": [],
    }
    (SHARES_DIR / f"{token}.json").write_text(
        json.dumps(share, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"token": token}


@app.get("/share/{token}.json")
async def ver_share_json(token: str):
    """T50: Endpoint JSON puro para página Next.js renderizar com branding Lemmon."""
    return _load_share(token)


@app.get("/share/{token}", response_class=HTMLResponse)
async def ver_share(token: str):
    """T36: Página pública de aprovação — dossiê limpo sem custos/técnico."""
    share = _load_share(token)
    agentes = share.get("agentes_usados", [])
    respostas = share.get("respostas", {})
    blocos_html = ""
    for ag in agentes:
        txt = respostas.get(ag, "")
        if not txt:
            continue
        blocos_html += f"""
        <section class="agent-block">
          <h2 class="agent-name">{html_escape(ag.capitalize())}</h2>
          <pre class="agent-content">{html_escape(txt)}</pre>
        </section>"""
    comentarios_html = ""
    for c in share.get("comentarios", []):
        comentarios_html += f"""<div class="comment"><strong>{html_escape(c["autor"])}</strong>: {html_escape(c["texto"])}</div>"""
    briefing = share.get("briefing", "")
    return HTMLResponse(f"""<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lemmon — Aprovação</title>
<style>
  body{{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem;color:#1c1917;background:#fafaf9}}
  h1{{font-size:1.5rem;font-weight:700;margin-bottom:.5rem}}
  .briefing{{background:#f5f5f4;border-left:4px solid #a8a29e;padding:1rem;border-radius:4px;margin-bottom:2rem;font-size:.9rem}}
  .agent-block{{margin-bottom:2rem;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden}}
  .agent-name{{background:#292524;color:#fff;padding:.75rem 1rem;margin:0;font-size:.85rem;text-transform:uppercase;letter-spacing:.1em}}
  .agent-content{{white-space:pre-wrap;padding:1rem;margin:0;font-size:.875rem;line-height:1.6;font-family:inherit}}
  .comment-section{{margin-top:2rem}}
  .comment{{padding:.75rem;border:1px solid #e7e5e4;border-radius:6px;margin-bottom:.5rem}}
  form{{margin-top:1rem;display:flex;flex-direction:column;gap:.5rem}}
  input,textarea{{border:1px solid #d6d3d1;border-radius:6px;padding:.5rem .75rem;font-family:inherit}}
  button{{background:#292524;color:#fff;border:none;border-radius:6px;padding:.75rem 1.5rem;cursor:pointer;font-weight:600}}
  button:hover{{background:#44403c}}
</style>
</head><body>
<h1>Lemmon Produções — Aprovação de Conteúdo</h1>
<div class="briefing"><strong>Briefing:</strong> {html_escape(briefing[:500])}</div>
{blocos_html}
<div class="comment-section">
  <h2>Comentários</h2>
  {comentarios_html or '<p style="color:#a8a29e;font-size:.875rem">Nenhum comentário ainda.</p>'}
  <form onsubmit="sendComment(event)">
    <input id="autor" placeholder="Seu nome" required />
    <textarea id="texto" rows="3" placeholder="Seu comentário..." required></textarea>
    <button type="submit">Enviar comentário</button>
  </form>
</div>
<script>
async function sendComment(e){{
  e.preventDefault();
  const r=await fetch(window.location.href+'/comentar',{{method:'POST',headers:{{'Content-Type':'application/json'}},
    body:JSON.stringify({{autor:document.getElementById('autor').value,texto:document.getElementById('texto').value}})}});
  if(r.ok)location.reload();
}}
</script>
</body></html>""")


@app.post("/share/{token}/comentar")
async def comentar_share(token: str, payload: ComentarioPayload):
    """T36: Adiciona comentário inline à sessão compartilhada."""
    if not payload.texto.strip():
        raise HTTPException(status_code=400, detail="Comentário não pode ser vazio")
    share = _load_share(token)
    comentarios = share.setdefault("comentarios", [])
    if len(comentarios) >= 20:
        raise HTTPException(status_code=400, detail="Limite de comentários atingido")
    comentarios.append({
        "autor": payload.autor,
        "texto": payload.texto,
        "created_at": datetime.now().isoformat(),
    })
    (SHARES_DIR / f"{token}.json").write_text(
        json.dumps(share, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True}


# ── T37 — Calibragem espelho IA × real ─────────────────────────────────

class FeedbackPedroPayload(BaseModel):
    session_id: str
    elemento: str
    predicao_ia: str
    feedback_real: str
    nota_acerto: int


@app.post("/calibragem_pedro")
async def registrar_calibragem(payload: FeedbackPedroPayload):
    """T37: Registra divergência entre Pedro IA e Pedro real para calibragem do espelho."""
    historico: list = []
    if CALIBRAGEM_FILE.exists():
        try:
            historico = json.loads(CALIBRAGEM_FILE.read_text(encoding="utf-8"))
        except Exception:
            historico = []
    historico.append({
        "id": secrets.token_hex(6),
        "session_id": payload.session_id,
        "elemento": payload.elemento,
        "predicao_ia": payload.predicao_ia,
        "feedback_real": payload.feedback_real,
        "nota_acerto": max(0, min(5, payload.nota_acerto)),
        "created_at": datetime.now().isoformat(),
    })
    CALIBRAGEM_FILE.write_text(
        json.dumps(historico, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {"ok": True, "total_registros": len(historico)}


@app.get("/calibragem_pedro")
async def ver_calibragem():
    """T37: Retorna histórico de calibragem e métricas de precisão do espelho."""
    if not CALIBRAGEM_FILE.exists():
        return {"registros": [], "media_acerto": None, "total": 0}
    try:
        historico = json.loads(CALIBRAGEM_FILE.read_text(encoding="utf-8"))
    except Exception:
        historico = []
    if not historico:
        return {"registros": [], "media_acerto": None, "total": 0}
    media = sum(r.get("nota_acerto", 0) for r in historico) / len(historico)
    return {"registros": historico, "media_acerto": round(media, 2), "total": len(historico)}


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
            fast_track: bool = data.get("fast_track", False)
            sandbox: bool = data.get("sandbox", False)
            custo_cap_usd: float | None = data.get("custo_cap_usd") or None
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
            heitor_risco_vermelho = False  # T29: roteamento condicional

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

            # T26: Fast-track força Otto resumido
            if fast_track:
                cfg_otto = {**cfg_otto, "modo_visual": "resumido"}

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
                    nonlocal heitor_risco_vermelho
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
                        output_humano = res.get("output_humano", "")
                        # T29: detectar risco vermelho para routing condicional
                        _risco = (diretrizes_heitor or {}).get("risco_geral", "") if isinstance(diretrizes_heitor, dict) else ""
                        if _risco.lower() in ("vermelho", "red", "high") or "🔴" in output_humano:
                            heitor_risco_vermelho = True
                            await ws.send_json({"type": "routing_condicional", "motivo": "heitor_risco_vermelho",
                                                "mensagem": "🔴 Risco vermelho detectado — Salles será instruído a adotar modo seguro automaticamente."})
                        return output_humano, res.get("custo_total_usd", 0)
                    return "Análise de compliance cancelada.", 0

                elif name == "salles":
                    ag = Salles()
                    formato = cfg_salles.get("formato", "auto")
                    # T29: modo seguro se Heitor sinalizou risco vermelho
                    briefing_salles = briefing
                    if heitor_risco_vermelho:
                        briefing_salles = (
                            briefing + "\n\n[MODO SEGURO ATIVADO POR RISCO HEITOR]: "
                            "Evite qualquer claim terapêutico, promessa de resultado, "
                            "linguagem de antes/depois. Use linguagem de awareness e educação "
                            "apenas. Heitor identificou risco vermelho de compliance neste briefing."
                        )
                    res = await loop.run_in_executor(
                        None,
                        lambda: ag.executar(
                            briefing=briefing_salles,
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

            custo_cap_autorizado = custo_cap_usd  # pode ser aumentado por autorizações

            async def _verificar_custo_cap() -> bool:
                """T30: verifica custo acumulado vs cap. Retorna False se pipeline cancelado."""
                nonlocal pipeline_cancelled, custo_cap_autorizado
                if custo_cap_autorizado is None:
                    return True
                total_atual = sum(custos.values())
                pct = total_atual / custo_cap_autorizado
                if pct >= 0.8 and pct < 1.0:
                    await ws.send_json({
                        "type": "custo_aviso",
                        "total_atual": round(total_atual, 5),
                        "cap": custo_cap_autorizado,
                        "pct": round(pct * 100),
                    })
                elif pct >= 1.0:
                    await ws.send_json({
                        "type": "custo_cap_atingido",
                        "total_atual": round(total_atual, 5),
                        "cap": custo_cap_autorizado,
                    })
                    ctrl = await ws.receive_json()
                    if ctrl.get("type") == "autorizar_custo":
                        custo_cap_autorizado += max(0.1, float(ctrl.get("valor", 0.5)))
                    else:
                        pipeline_cancelled = True
                        return False
                return True

            async def _run_salles_alternativas() -> bool:
                """T24: roda Salles 3x com variações e combina para Sônia. Retorna False se cancelado."""
                nonlocal roteiro_salles, pipeline_cancelled
                variacoes = [
                    ("padrão", ""),
                    ("impactante e direto", " [VARIAÇÃO: estilo mais impactante, hooks agressivos, ritmo acelerado, foco em conversão]"),
                    ("emocional e pessoal", " [VARIAÇÃO: estilo emocional e testemunhal, tom íntimo, foco em conexão humana]"),
                ]
                formato = cfg_salles.get("formato", "auto")
                todos_textos: list[str] = []
                for idx, (label, hint) in enumerate(variacoes):
                    variant_id = f"salles_v{idx+1}"
                    bv = briefing + hint
                    await ws.send_json({"type": "agent_start", "agent": variant_id})
                    try:
                        ag_s = Salles()
                        res_s = await loop.run_in_executor(
                            None,
                            lambda bv=bv: ag_s.executar(
                                briefing=bv,
                                formato=formato,
                                analise_otto_existente=analise_otto,
                                diretrizes_heitor=diretrizes_heitor,
                            ),
                        )
                        texto_s = f"**Variante {idx+1} — {label}**\n\n" + res_s.get("output_humano", "")
                        custo_s = res_s.get("custo_total_usd", 0)
                        todos_textos.append(res_s.get("output_humano", ""))
                        custos[f"salles_v{idx+1}"] = custo_s
                        await _stream(ws, variant_id, texto_s)
                        if manual_mode and idx == len(variacoes) - 1:
                            await ws.send_json({"type": "agent_done", "agent": variant_id, "cost": custo_s, "awaiting_approval": True})
                            ctrl = await ws.receive_json()
                            if ctrl.get("type") == "cancel":
                                pipeline_cancelled = True
                                return False
                        else:
                            await ws.send_json({"type": "agent_done", "agent": variant_id, "cost": custo_s})
                    except Exception as e:
                        await ws.send_json({"type": "agent_error", "agent": variant_id, "error": str(e)})
                        return True
                roteiro_salles = "\n\n---\n\n".join(
                    [f"## Variante {i+1}\n\n{t}" for i, t in enumerate(todos_textos)]
                )
                respostas["salles"] = roteiro_salles
                return True

            for name in names:
                if name == "aya":
                    continue

                # T26: Fast-track — pula Heitor com aviso
                if fast_track and name == "heitor":
                    aviso = "⚡ **Fast-track ativo** — Heitor pulado. Valide compliance manualmente antes de publicar."
                    respostas["heitor"] = aviso
                    await ws.send_json({"type": "agent_start", "agent": "heitor"})
                    await _stream(ws, "heitor", aviso)
                    await ws.send_json({"type": "agent_done", "agent": "heitor", "cost": 0})
                    continue

                # T24: A/B alternativas para Salles
                if name == "salles" and int(cfg_salles.get("alternativas", 0)) >= 3 and not pipeline_cancelled:
                    ok = await _run_salles_alternativas()
                else:
                    ok = await _execute_with_approval(name)
                if not ok:
                    break
                # T30: verificar custo-cap após cada agente
                if not await _verificar_custo_cap():
                    break
                # Gate de espelho Pedro entre Salles e Sônia (skip em fast_track)
                if name == "salles" and not pipeline_cancelled and not fast_track:
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
            # T27: sandbox — não salva no histórico
            if not sandbox:
                session_path = _salvar_sessao(briefing, all_agents, respostas, custos, contexto_tecnico)
                session_id = session_path.stem
            else:
                session_id = None

            # Sugerir tags automaticamente via Aya (T15) — nunca em sandbox
            if not pipeline_cancelled and respostas and not sandbox:
                try:
                    _haiku = _anthropic_client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=120,
                        messages=[{
                            "role": "user",
                            "content": (
                                f"Briefing: {briefing[:300]}\n"
                                f"Agentes: {', '.join(all_agents)}\n\n"
                                "Liste 3 a 5 tags curtas (1-3 palavras cada) que descrevem esta sessão. "
                                "Responda APENAS as tags separadas por vírgula, sem explicação. "
                                "Ex: reels, hator, compliance, tese-identidade"
                            ),
                        }],
                    )
                    raw_tags = next((b.text for b in _haiku.content if hasattr(b, "text")), "")
                    tags_sugeridas = [t.strip().lower().replace(" ", "-") for t in raw_tags.split(",") if t.strip()][:5]
                    await ws.send_json({"type": "tags_sugeridas", "tags": tags_sugeridas, "session_id": session_id})
                except Exception:
                    pass

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


# ── Mesa Redonda (T10) ───────────────────────────────────────────────────────

@app.websocket("/ws/mesa_redonda")
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
