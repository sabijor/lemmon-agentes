"""Rotas T36 — links de aprovação compartilhada."""
import json
import secrets
from datetime import datetime
from html import escape as html_escape

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse

from api.deps import HISTORICO_DIR, SHARES_DIR
from api.schemas import ComentarioPayload, SharePayload

router = APIRouter()


def _load_share(token: str) -> dict:
    path = SHARES_DIR / f"{token}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Link não encontrado")
    return json.loads(path.read_text(encoding="utf-8"))


@router.post("/share")
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


@router.get("/share/{token}.json")
async def ver_share_json(token: str):
    """T50: Endpoint JSON puro para página Next.js renderizar com branding Lemmon."""
    return _load_share(token)


@router.get("/share/{token}", response_class=HTMLResponse)
async def ver_share(token: str):
    """T36: Página pública de aprovação — dossiê limpo sem custos/técnico.

    T133: Defesa em profundidade contra XSS — html_escape em TODA interpolação
    + headers HTTP restritivos (CSP, X-Frame-Options, etc.).
    """
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
    body_html = f"""<!DOCTYPE html>
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
    <input id="autor" placeholder="Seu nome" required maxlength="80" />
    <textarea id="texto" rows="3" placeholder="Seu comentário..." required maxlength="2000"></textarea>
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
</body></html>"""
    # T133 — headers de segurança em defesa-em-profundidade.
    # 'unsafe-inline' em script-src é necessário pro form (TODO: extrair pra arquivo estático e remover).
    return HTMLResponse(body_html, headers={
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        ),
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
    })


@router.post("/share/{token}/comentar")
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
