"""LGPD endpoints — direito ao esquecimento + exportação de dados.

G-01 — exportar dados do tenant em ZIP (Art. 18, II/V/VI da LGPD)
G-02 — deletar sessão específica (Art. 18, IV)
G-03 — deletar TODOS os dados do tenant (Art. 18, VI)

Todos os endpoints registram audit. Em produção, devem exigir auth.
"""
from __future__ import annotations

import io
import json
import shutil
import zipfile
from datetime import datetime
from pathlib import Path

import os
import secrets

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.deps import HISTORICO_DIR, OUTPUTS_DIR
from core import audit
from core.tenant import tenant_id

router = APIRouter()


def _require_auth_token(authorization: str | None, *, allow_dev: bool = True) -> None:
    """Exige Authorization: Bearer <LEMMON_AUTH_TOKEN>. Constant-time compare.

    v1.46.2 A3a-001 — comportamento dev/prod:
    - allow_dev=True (default): em dev (LEMMON_AUTH_TOKEN não setado) permite acesso.
      Single-user local não precisa de auth pra exportar/deletar SUAS sessões.
    - allow_dev=False: SEMPRE exige token (usado por /lgpd/apagar-tudo — destrutivo).
    """
    esperado = os.getenv("LEMMON_AUTH_TOKEN", "")
    if not esperado:
        if allow_dev:
            return  # modo dev — single-user local, sem auth
        raise HTTPException(
            status_code=403,
            detail="Operação destrutiva requer LEMMON_AUTH_TOKEN configurada no servidor.",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=403,
            detail="Authorization header obrigatório (Bearer <token>).",
        )
    enviado = authorization[7:].strip()
    if not secrets.compare_digest(enviado, esperado):
        raise HTTPException(status_code=403, detail="Token inválido.")


@router.get("/lgpd/exportar")
async def lgpd_exportar_dados(authorization: str | None = Header(default=None)):
    """Exporta TODOS os dados do tenant em ZIP (Art. 18 LGPD).

    v1.46.2 A3a-001 — agora exige auth. Antes GET sem token retornava ZIP
    inteiro do tenant (vazamento médico + financeiro + audit).

    Inclui:
    - historico/<tenant>/dashboard/*.json (sessões)
    - historico/<tenant>/audit.jsonl
    - outputs/<tenant>/ (PDFs gerados)
    """
    _require_auth_token(authorization)
    t = tenant_id()
    audit.registrar("lgpd_export", tenant=t)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for base, tipo in [
            (HISTORICO_DIR / t, "historico"),
            (OUTPUTS_DIR / t, "outputs"),
        ]:
            if not base.exists():
                continue
            for arquivo in base.rglob("*"):
                if arquivo.is_file():
                    arc = f"{tipo}/{arquivo.relative_to(base)}"
                    zf.write(arquivo, arcname=arc)

        # Metadados do export
        meta = {
            "tenant": t,
            "exportado_em": datetime.utcnow().isoformat() + "Z",
            "lgpd_artigo": "Art. 18 LGPD — direito de acesso/portabilidade",
            "contato": "contato@lemmon.com.br",
        }
        zf.writestr("_metadata.json", json.dumps(meta, indent=2, ensure_ascii=False))

    buf.seek(0)
    nome = f"lemmon_export_{t}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


class _DeletarSessaoPayload(BaseModel):
    session_id: str


@router.post("/lgpd/deletar-sessao")
async def lgpd_deletar_sessao(
    payload: _DeletarSessaoPayload,
    authorization: str | None = Header(default=None),
):
    """Apaga 1 sessão específica + outputs relacionados.

    G-02 — direito ao esquecimento (Art. 18, IV LGPD).
    v1.46.2 A3a-001 — agora exige auth. Antes POST sem token apagava sessão
    de qualquer tenant que adivinhasse session_id.
    """
    _require_auth_token(authorization)
    import re
    # SEC-equiv — sanitize session_id
    if not re.match(r"^[A-Za-z0-9_+.\-]+$", payload.session_id):
        raise HTTPException(status_code=400, detail="session_id inválido")
    # v1.49 A3a-007 — defesa em profundidade: rejeita session_id que vire ".."
    # ou variações que o regex permite mas têm intent suspeito.
    if payload.session_id in ("..", "...", "....") or ".." in payload.session_id:
        raise HTTPException(status_code=400, detail="session_id inválido")

    t = tenant_id()
    deletados: list[str] = []

    # JSON da sessão — v1.49 A3a-007/008 usa safe_join
    from core.tenant import safe_join
    json_path = safe_join(HISTORICO_DIR, t, "dashboard", f"{payload.session_id}.json")
    if json_path is None:
        raise HTTPException(status_code=400, detail="session_id inválido (path escape)")
    if json_path.exists():
        json_path.unlink()
        try:
            deletados.append(str(json_path.relative_to(HISTORICO_DIR.parent)))
        except ValueError:
            deletados.append(str(json_path))

    # Outputs (PDF, HTML, MD)
    out_dir = OUTPUTS_DIR / t
    if out_dir.exists():
        for sub in out_dir.iterdir():
            if not sub.is_dir():
                continue
            for ext in ("md", "html", "pdf"):
                f = safe_join(sub, f"{payload.session_id}.{ext}")
                if f is None:
                    continue
                if f.exists():
                    f.unlink()
                    try:
                        deletados.append(str(f.relative_to(OUTPUTS_DIR.parent)))
                    except ValueError:
                        deletados.append(str(f))

    if not deletados:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    audit.registrar("lgpd_delete_session", session_id=payload.session_id, n=len(deletados))
    return {"ok": True, "arquivos_deletados": deletados}


@router.post("/lgpd/apagar-tudo")
async def lgpd_apagar_tudo(authorization: str | None = Header(default=None)):
    """🚨 Apaga TODOS os dados do tenant. Irreversível.

    G-03 — direito ao esquecimento total (Art. 18, VI LGPD).
    Exige Authorization: Bearer <LEMMON_AUTH_TOKEN> (constant-time compare).
    v1.46.2 — allow_dev=False: sempre exige token, mesmo em dev (destrutivo).
    """
    _require_auth_token(authorization, allow_dev=False)
    t = tenant_id()
    apagados: list[str] = []
    for base in [HISTORICO_DIR / t, OUTPUTS_DIR / t]:
        if base.exists():
            shutil.rmtree(base)
            apagados.append(str(base.relative_to(base.parent.parent)))
    audit.registrar("lgpd_delete_all", paths=apagados)
    return {"ok": True, "diretorios_removidos": apagados}
