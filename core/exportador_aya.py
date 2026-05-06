"""Exportador da Aya v1.1 — gera HTML estilizado + PDF a partir de markdown.

Identidade visual: Design System AURA (design_system.html).

CSS construído a partir do design system real:
- Paleta Stone (50, 100, 200, 400, 500, 700, 900)
- Tipografia: Space Grotesk (display) + Inter (sans) + JetBrains Mono (mono)
- Espaçamento editorial generoso
- Hierarquia: label mono uppercase pequeno + título display grande
- Cards com border-left preto e fundo stone-50
- Capa com fundo Stone 900 e tipografia branca minimalista
"""
import logging
import re
from datetime import datetime
from pathlib import Path

logger = logging.getLogger("lemmon.aya.exportador")


# =============================================================================
# CSS — Identidade AURA (carregado de core/templates/aura.css)
# Para ajustar o visual, edite core/templates/aura.css diretamente.
# =============================================================================

_CSS_PATH = Path(__file__).parent / "templates" / "aura.css"
CSS_AURA = _CSS_PATH.read_text(encoding="utf-8")



# =============================================================================
# GERAÇÃO DA CAPA HTML
# =============================================================================

def gerar_html_capa(nome_projeto: str, data_compilacao: str,
                    agentes_consultados: list) -> str:
    """Gera HTML da capa do dossiê — fundo Stone 900, tipografia AURA."""
    agentes_str = " · ".join(a.upper() for a in agentes_consultados) if agentes_consultados else "—"

    return f"""<div class="aura-capa">
    <div class="aura-capa-topo">
        <div class="aura-capa-marca">LEMMON<span>PRODUÇÕES</span></div>
    </div>

    <div class="aura-capa-meio">
        <div class="aura-capa-label">Dossiê Estratégico</div>
        <h1 class="aura-capa-titulo">Dossiê</h1>
        <p class="aura-capa-projeto">{nome_projeto}</p>
    </div>

    <div class="aura-capa-rodape">
        <div class="aura-capa-meta">
            <div class="aura-capa-meta-item">
                <span class="label">Compilado em</span>
                <span class="valor">{data_compilacao}</span>
            </div>
            <div class="aura-capa-meta-item">
                <span class="label">Agentes</span>
                <span class="valor">{agentes_str}</span>
            </div>
        </div>
    </div>
</div>"""


# =============================================================================
# CONVERSÃO MARKDOWN → HTML
# =============================================================================

def markdown_para_html(markdown: str) -> str:
    """Converte markdown pra HTML usando biblioteca markdown."""
    try:
        import markdown as md_lib
    except ImportError:
        raise RuntimeError(
            "Biblioteca 'markdown' não instalada. "
            "Rode: pip install markdown"
        )

    md = md_lib.Markdown(
        extensions=["extra", "tables", "fenced_code", "nl2br", "sane_lists"],
        output_format="html5",
    )
    return md.convert(markdown)


# =============================================================================
# EXTRAÇÃO E LIMPEZA DO MARKDOWN
# =============================================================================

def extrair_dados_e_limpar_markdown(markdown_original: str) -> tuple:
    """
    Extrai nome do projeto e data do cabeçalho do markdown gerado pela Aya,
    e remove esse cabeçalho pra não duplicar na capa.

    Retorna: (nome_projeto, data_str, markdown_limpo)
    """
    nome_projeto = "Sem nome"
    data_str = datetime.now().strftime("%d/%m/%Y às %H:%M")

    match_titulo = re.search(
        r"^#\s*Dossiê\s*[—\-]\s*(.+?)$",
        markdown_original,
        re.MULTILINE,
    )
    if match_titulo:
        nome_projeto = match_titulo.group(1).strip()

    match_data = re.search(r"\*Compilado em\s*(.+?)\*", markdown_original)
    if match_data:
        data_str = match_data.group(1).strip()

    # Remove título + data + primeiro separador
    markdown_limpo = re.sub(
        r"^#\s*Dossiê\s*[—\-].+?\n+\*Compilado em.+?\*\n+",
        "",
        markdown_original,
        count=1,
        flags=re.MULTILINE,
    )
    markdown_limpo = re.sub(r"^---\n+", "", markdown_limpo, count=1)

    return nome_projeto, data_str, markdown_limpo


# =============================================================================
# ENRIQUECIMENTO DO HTML — adiciona classes AURA semânticas
# =============================================================================

def enriquecer_html_aura(html: str) -> str:
    """
    Adiciona classes semânticas AURA ao HTML gerado pelo markdown:
    - Índice → .aura-indice com label decorativo
    - Resumo dos agentes → .aura-resumo com cards .aura-agente por agente
    """
    # Wrap do índice
    html = re.sub(
        r"(<h2[^>]*>Índice\s*</h2>)(.*?)(</ul>)",
        lambda m: (
            f'<div class="aura-indice">'
            f'<span class="aura-indice-label">Navegação</span>'
            f"{m.group(2)}{m.group(3)}"
            f"</div>"
        ),
        html,
        count=1,
        flags=re.DOTALL,
    )

    # Wrap do "Resumo dos agentes" — cards por agente
    def _wrap_resumo(m):
        conteudo = m.group(1)
        conteudo_estilizado = re.sub(
            r"<h3[^>]*>([^<]+)</h3>\s*(.*?)(?=<h3|$)",
            lambda h: (
                f'<div class="aura-agente">'
                f'<span class="aura-agente-label">Agente</span>'
                f'<h3 class="aura-agente-nome">{h.group(1).strip()}</h3>'
                f'<div class="aura-agente-resumo">{h.group(2).strip()}</div>'
                f"</div>"
            ),
            conteudo,
            flags=re.DOTALL,
        )
        return (
            f'<div class="aura-resumo">'
            f'<span class="aura-resumo-label">Visão Geral</span>'
            f'<h2 class="aura-resumo-titulo">Resumo dos agentes</h2>'
            f"{conteudo_estilizado}"
            f"</div>"
        )

    html = re.sub(
        r"<h2[^>]*>Resumo dos agentes</h2>(.*?)(?=<hr\s*/?>|<h2)",
        _wrap_resumo,
        html,
        count=1,
        flags=re.DOTALL,
    )

    return html


# =============================================================================
# GERAÇÃO HTML COMPLETO
# =============================================================================

def gerar_html_completo(markdown_original: str, agentes_consultados: list) -> str:
    """
    Recebe markdown completo da Aya, gera HTML estilizado com design system AURA.
    """
    nome_projeto, data_str, markdown_limpo = extrair_dados_e_limpar_markdown(
        markdown_original
    )

    capa_html = gerar_html_capa(nome_projeto, data_str, agentes_consultados)

    conteudo_html_bruto = markdown_para_html(markdown_limpo)
    conteudo_html = enriquecer_html_aura(conteudo_html_bruto)

    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dossiê — {nome_projeto} — Lemmon Produções</title>
    <style>
{CSS_AURA}
    </style>
</head>
<body>

{capa_html}

<div class="aura-conteudo">
{conteudo_html}
</div>

<div class="aura-rodape-final">
    Lemmon Produções · {data_str}
</div>

</body>
</html>"""


# =============================================================================
# CONVERSÃO HTML → PDF
# =============================================================================

def html_para_pdf(html: str, caminho_saida: Path,
                  engine: str = "weasyprint") -> bool:
    """
    Converte HTML pra PDF.
    Retorna True se sucesso, False se falhou (sem levantar exception).
    """
    try:
        if engine == "weasyprint":
            return _html_para_pdf_weasyprint(html, caminho_saida)
        elif engine == "playwright":
            return _html_para_pdf_playwright(html, caminho_saida)
        else:
            logger.error(f"Engine PDF desconhecido: {engine}")
            return False
    except Exception as e:
        logger.error(f"Falha ao gerar PDF: {e}")
        return False


def _html_para_pdf_weasyprint(html: str, caminho_saida: Path) -> bool:
    try:
        from weasyprint import HTML
    except ImportError:
        logger.error(
            "WeasyPrint não instalado. Rode: pip install weasyprint\n"
            "No Mac, pode precisar: brew install pango cairo gdk-pixbuf libffi"
        )
        return False

    try:
        HTML(string=html).write_pdf(
            target=str(caminho_saida),
            presentational_hints=True,
        )
        logger.info(f"PDF gerado via WeasyPrint: {caminho_saida}")
        return True
    except Exception as e:
        logger.error(f"Erro WeasyPrint: {e}")
        return False


def _html_para_pdf_playwright(html: str, caminho_saida: Path) -> bool:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error(
            "Playwright não instalado. Rode: pip install playwright && "
            "playwright install chromium"
        )
        return False

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle")
            page.pdf(
                path=str(caminho_saida),
                format="A4",
                margin={"top": "22mm", "bottom": "22mm",
                        "left": "18mm", "right": "18mm"},
                print_background=True,
            )
            browser.close()
        logger.info(f"PDF gerado via Playwright: {caminho_saida}")
        return True
    except Exception as e:
        logger.error(f"Erro Playwright: {e}")
        return False


# =============================================================================
# FUNÇÃO PRINCIPAL
# =============================================================================

def exportar_dossie(
    markdown_original: str,
    caminho_md: Path,
    agentes_consultados: list,
    gerar_html: bool = True,
    gerar_pdf: bool = True,
    pdf_engine: str = "weasyprint",
) -> dict:
    """
    Exporta dossiê em HTML + PDF a partir do markdown gerado pela Aya.

    Args:
        markdown_original: conteúdo do .md já gerado pela Aya
        caminho_md: caminho do arquivo .md (usado pra deduzir nomes dos outros)
        agentes_consultados: lista de agentes que rodaram
        gerar_html: se True, gera arquivo .html
        gerar_pdf: se True, gera arquivo .pdf
        pdf_engine: 'weasyprint' ou 'playwright'

    Retorna dict com:
        - html_gerado (bool)
        - pdf_gerado (bool)
        - caminho_html (Path ou None)
        - caminho_pdf (Path ou None)
        - erros (list[str])
    """
    resultado = {
        "html_gerado": False,
        "pdf_gerado": False,
        "caminho_html": None,
        "caminho_pdf": None,
        "erros": [],
    }

    if not gerar_html and not gerar_pdf:
        return resultado

    try:
        html_completo = gerar_html_completo(markdown_original, agentes_consultados)
    except Exception as e:
        erro_msg = f"Falha ao gerar HTML: {e}"
        logger.error(erro_msg)
        resultado["erros"].append(erro_msg)
        return resultado

    if gerar_html:
        caminho_html = caminho_md.with_suffix(".html")
        try:
            caminho_html.write_text(html_completo, encoding="utf-8")
            resultado["html_gerado"] = True
            resultado["caminho_html"] = caminho_html
            logger.info(f"HTML salvo: {caminho_html}")
        except Exception as e:
            erro_msg = f"Falha ao salvar HTML: {e}"
            logger.error(erro_msg)
            resultado["erros"].append(erro_msg)

    if gerar_pdf:
        caminho_pdf = caminho_md.with_suffix(".pdf")
        if html_para_pdf(html_completo, caminho_pdf, engine=pdf_engine):
            resultado["pdf_gerado"] = True
            resultado["caminho_pdf"] = caminho_pdf
        else:
            resultado["erros"].append(
                f"Falha na geração de PDF (engine={pdf_engine}). "
                "HTML foi gerado e pode ser convertido manualmente."
            )

    return resultado
