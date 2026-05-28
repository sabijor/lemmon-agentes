"""Rotas de exportação de dossiê/editorial e download."""
import asyncio
import json

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from api.deps import AYA_GERAR_HTML, AYA_GERAR_PDF, AYA_PDF_ENGINE, HISTORICO_DIR, OUTPUTS_DIR, LEMMON_MODELO_PADRAO, _anthropic_client
from api.schemas import ExportarPayload
from core.exportador_aya import exportar_dossie
from core.custo import Custo

router = APIRouter()

# T158 — labels humanas das seções por agente, usadas quando combinamos vários
# outputs num único PDF. Mantém uma ordem editorial razoável (estratégia → roteiro
# → performance → distribuição → compilação → espelho).
_LABELS_AGENTE = {
    "otto": "Estratégia",
    "heitor": "Compliance Meta",
    "salles": "Roteiros",
    "sonia": "Performance",
    "renata": "Cronograma editorial",
    "aya": "Dossiê",
    "pedro_abrahao": "Espelho do cliente (Pedro Abrahão)",
}
_ORDEM = ["otto", "heitor", "salles", "sonia", "renata", "aya", "pedro_abrahao"]


def _compor_markdown_combinado(respostas: dict, agentes: list[str]) -> str:
    """Concatena os outputs dos agentes selecionados com headers de seção."""
    partes: list[str] = []
    for ag in sorted(agentes, key=lambda a: _ORDEM.index(a) if a in _ORDEM else 99):
        md = (respostas.get(ag) or "").strip()
        if not md:
            continue
        label = _LABELS_AGENTE.get(ag, ag.capitalize())
        partes.append(f"# {label}\n\n{md}")
    return "\n\n---\n\n".join(partes)


def _gerar_resumo_executivo(markdown_completo: str) -> tuple[str, float]:
    """T159 — pede ao Haiku pra resumir o dossiê em ~500 palavras executivas.

    Retorna (markdown_resumido, custo_usd). Lança RuntimeError se Haiku falhar.
    """
    system = (
        "Você é editor executivo. Resuma o dossiê abaixo em até 500 palavras "
        "no formato MARKDOWN, com as seções: ## Tese · ## Entregáveis "
        "principais · ## Cronograma compacto · ## Próximos passos do operador. "
        "Linguagem direta, sem preâmbulo, sem repetir o briefing original. "
        "Foco em o que será produzido e quando."
    )
    resp = _anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        system=system,
        messages=[{"role": "user", "content": markdown_completo[:60000]}],
    )
    texto = next((b.text for b in resp.content if hasattr(b, "text")), "")
    custo = Custo.calcular(
        resp.usage.input_tokens,
        resp.usage.output_tokens,
        modelo="claude-haiku-4-5-20251001",
    ).custo_usd
    return texto, custo


@router.post("/exportar")
async def exportar(payload: ExportarPayload):
    """Gera HTML + PDF de um ou mais agentes de uma sessão salva.

    T158: aceita `agentes` (lista) pra exportar combinado, OU `agente` singular.
    T159: `modo="resumo"` pede ao Haiku 1 página executiva do dossiê.
    """
    session_dir = HISTORICO_DIR / "dashboard"
    path = session_dir / f"{payload.session_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Sessão não encontrada")

    dados = json.loads(path.read_text(encoding="utf-8"))
    respostas = dados.get("respostas", {})

    # Determina lista de agentes a exportar
    agentes_solicitados = payload.agentes if payload.agentes else [payload.agente]
    # Filtra apenas os que têm output válido
    agentes_validos = [a for a in agentes_solicitados if (respostas.get(a) or "").strip()]
    if not agentes_validos:
        raise HTTPException(
            status_code=400,
            detail=f"Sessão não contém output dos agentes: {', '.join(agentes_solicitados)}"
        )

    # Compõe markdown
    if len(agentes_validos) == 1:
        markdown = respostas.get(agentes_validos[0], "")
        # Aya tem contexto especial — injeta lista de agentes consultados
        agentes_detectados = (
            [a for a in dados.get("agentes_usados", []) if a != "aya" and respostas.get(a, "").strip()]
            if agentes_validos[0] == "aya" else []
        )
    else:
        markdown = _compor_markdown_combinado(respostas, agentes_validos)
        agentes_detectados = []

    # T159 — modo resumo: pede ao Haiku pra condensar
    custo_resumo: float | None = None
    if payload.modo == "resumo":
        try:
            loop = asyncio.get_event_loop()
            markdown, custo_resumo = await loop.run_in_executor(
                None, lambda: _gerar_resumo_executivo(markdown)
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Falha ao gerar resumo: {exc}") from exc

    # Define nome do arquivo de saída a partir dos agentes
    if payload.modo == "resumo":
        slug = "resumo"
    elif len(agentes_validos) == 1:
        slug = agentes_validos[0]
    else:
        slug = "+".join(agentes_validos)

    out_dir = OUTPUTS_DIR / slug
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
        "slug": slug,  # cliente usa pra montar URL de download
        "custo_usd": custo_resumo,  # só preenchido se modo=resumo
    }


@router.get("/download/{session_id}/{tipo}")
async def download_arquivo(
    session_id: str,
    tipo: str,
    agente: str | None = Query(default=None),
    slug: str | None = Query(default=None),
):
    """Serve o HTML ou PDF gerado para download.

    T158: aceita `slug` (multi-agentes, ex: 'otto+salles') ou `agente` (legado).
    Ex: /download/SID/pdf?slug=otto+salles  ou  ?agente=renata
    """
    subdir = slug or agente or "aya"
    out_dir = OUTPUTS_DIR / subdir
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
