#!/usr/bin/env python3
"""Gera PDF do MANUAL_SISTEMA.md em docs/releases/.

Uso:
    python docs/gerar_pdf.py

Detecta a versão e a data automaticamente do cabeçalho do markdown.
Não sobrescreve PDFs antigos — cada release fica como snapshot.

Dependências: weasyprint, markdown
    pip install weasyprint markdown
"""
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import markdown
    from weasyprint import CSS, HTML
except ImportError as e:
    print(f"ERRO: dependência faltando — {e}")
    print("Rode: pip install weasyprint markdown")
    sys.exit(1)


# ─── CSS Lemmon ──────────────────────────────────────────────────────
CSS_LEMMON = """
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono:wght@400;700&display=swap');

@page {
    size: A4;
    margin: 2cm 2.2cm 2.4cm 2.2cm;
    @bottom-center {
        content: "LEMMON AGENTES — Manual do Sistema";
        font-family: 'Inter', Helvetica, sans-serif;
        font-size: 8pt;
        color: #78716c;
    }
    @bottom-right {
        content: "pág. " counter(page);
        font-family: 'Inter', Helvetica, sans-serif;
        font-size: 8pt;
        color: #78716c;
    }
}

@page :first {
    @bottom-center { content: none; }
    @bottom-right  { content: none; }
}

* { box-sizing: border-box; }

body {
    font-family: 'Inter', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.65;
    color: #1c1917;
    background: #fff;
}

/* ── Capa ── */
.capa {
    page-break-after: always;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 24cm;
    text-align: center;
    padding: 3cm 1cm 2cm;
}
.capa-logo {
    font-size: 10pt;
    font-weight: 700;
    letter-spacing: 0.25em;
    text-transform: uppercase;
    color: #78716c;
    margin-bottom: 1.4cm;
}
.capa-titulo {
    font-size: 38pt;
    font-weight: 700;
    color: #18181b;
    line-height: 1.1;
    margin: 0 0 0.3cm;
}
.capa-subtitulo {
    font-size: 14pt;
    color: #78716c;
    margin: 0 0 1.8cm;
}
.capa-box {
    border: 1px solid #d6d3d1;
    border-radius: 8px;
    background: #fafaf9;
    padding: 0.6cm 1.4cm;
    margin-bottom: 1.8cm;
    min-width: 9cm;
}
.capa-box p {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 9.5pt;
    color: #44403c;
    margin: 0.25em 0;
    border: none;
    background: none;
    padding: 0;
}
.capa-rodape {
    font-size: 8pt;
    color: #a8a29e;
    font-style: italic;
    max-width: 14cm;
}

/* ── Títulos ── */
h1 {
    font-size: 20pt;
    font-weight: 700;
    color: #18181b;
    margin: 1.2cm 0 0.35cm;
    padding-bottom: 0.15cm;
    border-bottom: 2px solid #18181b;
    page-break-before: always;
}
h1:first-of-type { page-break-before: avoid; }

h2 {
    font-size: 13pt;
    font-weight: 700;
    color: #1c1917;
    margin: 0.9cm 0 0.25cm;
    padding-bottom: 0.1cm;
    border-bottom: 1px solid #e7e5e4;
}

h3 {
    font-size: 11pt;
    font-weight: 600;
    color: #44403c;
    margin: 0.6cm 0 0.2cm;
}

h4 {
    font-size: 10pt;
    font-weight: 600;
    color: #57534e;
    margin: 0.4cm 0 0.15cm;
}

/* ── Parágrafos ── */
p {
    margin: 0 0 0.45em;
    text-align: justify;
}

/* ── Listas ── */
ul, ol {
    margin: 0.1em 0 0.6em 0;
    padding-left: 1.4em;
}
li {
    margin-bottom: 0.2em;
    line-height: 1.55;
}
li > ul, li > ol {
    margin-top: 0.15em;
    margin-bottom: 0.15em;
}

/* ── Código ── */
code {
    font-family: 'JetBrains Mono', 'Courier New', monospace;
    font-size: 8.8pt;
    background: #f5f5f4;
    padding: 0.1em 0.35em;
    border-radius: 3px;
    color: #1c1917;
}

pre {
    background: #f5f5f4;
    border-left: 3px solid #78716c;
    border-radius: 5px;
    padding: 0.6em 0.9em;
    margin: 0.5em 0 0.8em;
    overflow-x: auto;
    page-break-inside: avoid;
}
pre code {
    background: none;
    padding: 0;
    font-size: 8.5pt;
    line-height: 1.5;
}

/* ── Blockquote ── */
blockquote {
    background: #fef3c7;
    border-left: 3px solid #f59e0b;
    border-radius: 0 5px 5px 0;
    margin: 0.5em 0 0.8em;
    padding: 0.5em 0.9em;
    font-style: italic;
    color: #44403c;
    page-break-inside: avoid;
}
blockquote p { margin: 0.15em 0; }

/* ── Tabelas ── */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5em 0 0.9em;
    font-size: 9.5pt;
    page-break-inside: avoid;
}
thead tr {
    background: #f5f5f4;
}
th {
    font-weight: 700;
    text-align: left;
    padding: 0.35em 0.6em;
    border-bottom: 1.5px solid #d6d3d1;
    color: #18181b;
}
td {
    padding: 0.3em 0.6em;
    border-bottom: 0.5px solid #e7e5e4;
    vertical-align: top;
}
tr:last-child td { border-bottom: 1px solid #d6d3d1; }

/* ── Separador ── */
hr {
    border: none;
    border-top: 1px solid #e7e5e4;
    margin: 0.7em 0;
}

/* ── Links ── */
a { color: #1c1917; text-decoration: none; }

/* ── Forte / ênfase ── */
strong { font-weight: 700; }
em { font-style: italic; }
"""


def detectar_versao_e_data(texto: str) -> tuple[str, str]:
    versao_match = re.search(r"\*\*Versão atual:\*\*\s*v([\w.]+)", texto)
    data_match   = re.search(r"\*\*Última atualização:\*\*\s*(\d{4}-\d{2}-\d{2})", texto)
    versao = "v" + versao_match.group(1) if versao_match else "v?.?"
    data   = data_match.group(1) if data_match else datetime.now().strftime("%Y-%m-%d")
    return versao, data


def construir_capa_html(versao: str, data: str) -> str:
    return f"""
<div class="capa">
  <div class="capa-logo">Lemmon Produções</div>
  <div class="capa-titulo">Lemmon Agentes</div>
  <div class="capa-subtitulo">Manual do Sistema</div>
  <div class="capa-box">
    <p><strong>Versão:</strong> {versao}</p>
    <p><strong>Data:</strong> {data}</p>
    <p><strong>Cliente principal:</strong> Hator Clinic</p>
  </div>
  <div class="capa-rodape">
    Documento vivo · sempre que uma função for adicionada,<br>
    este manual deve ser atualizado e um novo PDF gerado.
  </div>
</div>
"""


def md_para_html(texto: str) -> str:
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc"])
    return md.convert(texto)


def gerar(md_path: Path, releases_dir: Path) -> Path:
    if not md_path.exists():
        print(f"ERRO: {md_path} não existe.")
        sys.exit(1)

    texto = md_path.read_text(encoding="utf-8")
    versao, data = detectar_versao_e_data(texto)

    releases_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = releases_dir / f"MANUAL_{versao}_{data}.pdf"

    if pdf_path.exists():
        print(f"⚠  {pdf_path.name} já existe. Sobrescrevendo (mesma versão e data).")

    corpo_html = md_para_html(texto)
    capa_html  = construir_capa_html(versao, data)

    html_completo = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Lemmon Agentes — Manual {versao}</title></head>
<body>
{capa_html}
{corpo_html}
</body>
</html>"""

    HTML(string=html_completo, base_url=str(md_path.parent)).write_pdf(
        str(pdf_path),
        stylesheets=[CSS(string=CSS_LEMMON)],
    )

    tamanho_kb = pdf_path.stat().st_size // 1024
    print(f"✓ Gerado: {pdf_path}")
    print(f"  Versão: {versao} · Data: {data} · Tamanho: {tamanho_kb} KB")
    return pdf_path


if __name__ == "__main__":
    base        = Path(__file__).resolve().parent
    md_path     = base / "MANUAL_SISTEMA.md"
    releases_dir = base / "releases"
    gerar(md_path, releases_dir)
