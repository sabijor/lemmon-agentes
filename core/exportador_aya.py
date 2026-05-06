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
from pathlib import Path
from datetime import datetime

logger = logging.getLogger("lemmon.aya.exportador")


# =============================================================================
# CSS — Identidade AURA aplicada a documento PDF
# =============================================================================
# Antigravity: este CSS foi extraído diretamente do design_system.html.
# Se precisar ajustar algo, CONSULTE design_system.html antes.
# =============================================================================

CSS_AURA = """
/* ============================================================
   FONTES — mesmas do design system AURA
   ============================================================ */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');

/* ============================================================
   PÁGINA — A4, margens generosas (editorial)
   ============================================================ */
@page {
    size: A4;
    margin: 22mm 18mm 22mm 18mm;

    @bottom-center {
        content: "Lemmon Produções  ·  " counter(page) " / " counter(pages);
        font-family: 'JetBrains Mono', monospace;
        font-size: 8pt;
        color: #a8a29e;
        letter-spacing: 0.15em;
        text-transform: uppercase;
    }
}

/* Capa (primeira página) sem rodapé e sem margem */
@page :first {
    margin: 0;
    @bottom-center { content: none; }
}

/* ============================================================
   RESET E BASE
   ============================================================ */
* { box-sizing: border-box; }

html, body {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #1c1917;
    background: #ffffff;
    line-height: 1.65;
    font-size: 10.5pt;
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
}

::selection { background: #1c1917; color: #ffffff; }

/* ============================================================
   CAPA — Fundo Stone 900, tipografia branca minimalista
   Inspirado no Hero do design_system.html
   ============================================================ */
.aura-capa {
    page-break-after: always;
    height: 297mm;
    width: 210mm;
    padding: 0;
    margin: 0;
    background: #1c1917;
    color: #fafaf9;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
}

.aura-capa::before {
    content: "";
    position: absolute;
    top: 30%;
    right: -10%;
    width: 60%;
    height: 60%;
    background: radial-gradient(circle, rgba(120,113,108,0.15) 0%, transparent 70%);
    pointer-events: none;
}

.aura-capa-topo {
    padding: 50px 50px 24px 50px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    z-index: 2;
    position: relative;
}

.aura-capa-marca {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12pt;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #fafaf9;
}

.aura-capa-marca span { font-weight: 300; }

.aura-capa-meio {
    padding: 0 50px;
    z-index: 2;
    position: relative;
}

.aura-capa-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 999px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #d6d3d1;
    margin-bottom: 32px;
}

.aura-capa-titulo {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 56pt;
    font-weight: 500;
    line-height: 0.92;
    letter-spacing: -0.03em;
    margin: 0 0 16px 0;
    color: #fafaf9;
    page-break-after: avoid;
}

.aura-capa-projeto {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 18pt;
    font-weight: 300;
    color: #a8a29e;
    margin: 0;
    letter-spacing: -0.01em;
}

.aura-capa-rodape {
    padding: 0 50px 50px 50px;
    z-index: 2;
    position: relative;
}

.aura-capa-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    padding-top: 24px;
    border-top: 1px solid rgba(255,255,255,0.1);
}

.aura-capa-meta-item .label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #78716c;
    margin-bottom: 6px;
    display: block;
}

.aura-capa-meta-item .valor {
    font-family: 'Inter', sans-serif;
    font-size: 10pt;
    font-weight: 500;
    color: #fafaf9;
    line-height: 1.4;
}

/* ============================================================
   CONTEÚDO INTERNO
   ============================================================ */
.aura-conteudo { padding: 0; }

/* ============================================================
   HEADERS — hierarquia AURA
   ============================================================ */
h1 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 32pt;
    font-weight: 500;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: #1c1917;
    margin: 0 0 24px 0;
    page-break-after: avoid;
}

h2 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 22pt;
    font-weight: 500;
    line-height: 1.15;
    letter-spacing: -0.015em;
    color: #1c1917;
    margin: 0 0 20px 0;
    padding-top: 4mm;
    page-break-before: always;
    page-break-after: avoid;
    position: relative;
}

h2::before {
    content: "";
    display: block;
    width: 32px;
    height: 1px;
    background: #1c1917;
    margin-bottom: 12px;
}

.aura-conteudo > h2:first-child { page-break-before: avoid; }
.aura-resumo h2 { page-break-before: avoid; }

h3 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 14pt;
    font-weight: 500;
    line-height: 1.3;
    letter-spacing: -0.01em;
    color: #1c1917;
    margin: 24px 0 10px 0;
    page-break-after: avoid;
}

h4 {
    font-family: 'Inter', sans-serif;
    font-size: 11pt;
    font-weight: 600;
    color: #292524;
    margin: 18px 0 8px 0;
    page-break-after: avoid;
    letter-spacing: -0.005em;
}

/* ============================================================
   TEXTO — corpo editorial Inter
   ============================================================ */
p {
    margin: 0 0 12px 0;
    color: #44403c;
    orphans: 3;
    widows: 3;
}

strong, b { font-weight: 600; color: #1c1917; }
em, i { font-style: italic; color: #292524; }

a {
    color: #1c1917;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
}

/* ============================================================
   LISTAS
   ============================================================ */
ul, ol { margin: 8px 0 14px 0; padding-left: 22px; }
li { margin: 4px 0; color: #44403c; }
li strong { color: #1c1917; }

/* ============================================================
   BLOCKQUOTE — estilo editorial AURA
   ============================================================ */
blockquote {
    margin: 18px 0;
    padding: 14px 20px;
    background: #fafaf9;
    border-left: 3px solid #1c1917;
    color: #44403c;
    font-size: 10pt;
    line-height: 1.6;
    page-break-inside: avoid;
}

blockquote p:last-child { margin-bottom: 0; }

/* ============================================================
   CÓDIGO E MONO
   ============================================================ */
code {
    font-family: 'JetBrains Mono', monospace;
    background: #f5f5f4;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.88em;
    color: #1c1917;
    border: 1px solid #e7e5e4;
}

pre {
    background: #fafaf9;
    border: 1px solid #e7e5e4;
    padding: 14px 16px;
    border-radius: 6px;
    font-size: 9pt;
    line-height: 1.5;
    page-break-inside: avoid;
}

pre code { background: none; padding: 0; border: none; }

/* ============================================================
   TABELAS
   ============================================================ */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
    font-size: 9.5pt;
    page-break-inside: avoid;
}

th {
    background: #1c1917;
    color: #fafaf9;
    padding: 8px 12px;
    text-align: left;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

td {
    padding: 8px 12px;
    border-bottom: 1px solid #e7e5e4;
    color: #44403c;
}

/* ============================================================
   SEPARADORES
   ============================================================ */
hr { border: none; border-top: 1px solid #e7e5e4; margin: 28px 0; }

/* ============================================================
   ÍNDICE
   ============================================================ */
.aura-indice {
    background: #fafaf9;
    border: 1px solid #e7e5e4;
    border-radius: 12px;
    padding: 20px 24px;
    margin: 16px 0 32px 0;
    page-break-inside: avoid;
}

.aura-indice-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #78716c;
    margin-bottom: 12px;
    display: block;
}

.aura-indice ul { list-style: none; padding: 0; margin: 0; }

.aura-indice li {
    margin: 6px 0;
    padding: 6px 0;
    border-bottom: 1px dotted #d6d3d1;
    font-family: 'Inter', sans-serif;
    font-size: 10pt;
    font-weight: 500;
    color: #1c1917;
}

.aura-indice li:last-child { border-bottom: none; }

/* ============================================================
   RESUMO EXECUTIVO (página 1 após capa)
   ============================================================ */
.aura-resumo { page-break-after: always; }

.aura-resumo-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #78716c;
    margin-bottom: 8px;
    display: block;
}

.aura-resumo-titulo {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 28pt;
    font-weight: 500;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: #1c1917;
    margin: 0 0 32px 0;
}

/* ============================================================
   CARDS DE AGENTE — border-left preto, fundo stone-50
   ============================================================ */
.aura-agente {
    margin: 28px 0;
    padding: 22px 24px;
    background: #fafaf9;
    border-left: 4px solid #1c1917;
    border-radius: 0 8px 8px 0;
    page-break-inside: avoid;
}

.aura-agente-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #78716c;
    margin-bottom: 6px;
    display: block;
}

.aura-agente-nome {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 16pt;
    font-weight: 500;
    color: #1c1917;
    margin: 0 0 12px 0;
    letter-spacing: -0.01em;
}

.aura-agente-resumo {
    font-family: 'Inter', sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #44403c;
}

.aura-agente-resumo p:last-child { margin-bottom: 0; }

/* ============================================================
   RODAPÉ FINAL
   ============================================================ */
.aura-rodape-final {
    margin-top: 60px;
    padding: 24px 0 0 0;
    border-top: 1px solid #e7e5e4;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #a8a29e;
}

.aura-page-break { page-break-after: always; }
"""


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
