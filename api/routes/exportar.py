"""Rotas de exportação de dossiê/editorial e download."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from api.deps import AYA_GERAR_HTML, AYA_GERAR_PDF, AYA_PDF_ENGINE, HISTORICO_DIR, OUTPUTS_DIR
from api.schemas import ExportarPayload
from core.exportador_aya import exportar_dossie

router = APIRouter()


@router.post("/exportar")
async def exportar(payload: ExportarPayload):
    """Gera HTML + PDF do output de um agente a partir de uma sessão salva.

    O campo `agente` (padrão "aya") seleciona qual output exportar.
    Compatibilidade: chamadas sem o campo continuam exportando Aya.
    """
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    dados = json.loads(path.read_text(encoding="utf-8"))
    agente = payload.agente
    markdown = dados.get("respostas", {}).get(agente, "")
    if not markdown.strip():
        raise HTTPException(status_code=400, detail=f"Sessão não contém output do agente '{agente}'")

    # agentes_consultados é contexto específico do dossiê da Aya (lista de agentes que rodaram).
    # Para outros agentes, não faz sentido injetar esse contexto no documento.
    respostas = dados.get("respostas", {})
    agentes_detectados = (
        [a for a in dados.get("agentes_usados", []) if a != "aya" and respostas.get(a, "").strip()]
        if agente == "aya" else []
    )

    out_dir = OUTPUTS_DIR / agente
    out_dir.mkdir(parents=True, exist_ok=True)
    caminho_md = out_dir / f"{payload.session_id}.md"

    loop = asyncio.get_event_loop()
    resultado = await loop.run_in_executor(
        None,
        lambda: exportar_dossie(
            markdown_original=markdown,
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


@router.get("/download/{session_id}/{tipo}")
async def download_arquivo(
    session_id: str,
    tipo: str,
    agente: str = Query(default="aya"),
):
    """Serve o HTML ou PDF gerado para download.

    O query param `agente` (padrão "aya") seleciona o subdiretório correto
    em outputs/. Ex: /download/20260507_133528_sessao/pdf?agente=renata
    """
    out_dir = OUTPUTS_DIR / agente
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
