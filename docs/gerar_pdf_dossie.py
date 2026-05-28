#!/usr/bin/env python3
"""Gera PDF de dossiês Aya seguindo o design system AURA / Lemmon.

Uso:
    python docs/gerar_pdf_dossie.py <caminho-do-md> [--out <caminho-do-pdf>]

Aplica a identidade do design_system.html: Stone palette, Space Grotesk
(display), Inter (corpo), JetBrains Mono (labels), numeração editorial
"01 / SEÇÃO", drop caps, blockquotes editoriais e tabelas elegantes.

Dependências: weasyprint, markdown — disponíveis no .venv do projeto.
"""
from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import markdown
    from weasyprint import CSS, HTML
except ImportError as exc:
    print(f"ERRO: dependência faltando — {exc}")
    print("Rode: pip install weasyprint markdown  (ou ative o .venv do projeto)")
    sys.exit(1)


# ─── CSS Lemmon · Design System AURA ─────────────────────────────────
CSS_LEMMON = """
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');

@page {
    size: A4;
    margin: 2cm 2.2cm 2.4cm 2.2cm;
    @bottom-left {
        content: "LEMMON PRODUÇÕES · DOSSIÊ";
        font-family: 'JetBrains Mono', monospace;
        font-size: 7pt;
        letter-spacing: 0.18em;
        color: #a8a29e;
    }
    @bottom-right {
        content: counter(page) " / " counter(pages);
        font-family: 'JetBrains Mono', monospace;
        font-size: 7pt;
        letter-spacing: 0.15em;
        color: #a8a29e;
    }
}
@page :first {
    @bottom-left  { content: none; }
    @bottom-right { content: none; }
}

* { box-sizing: border-box; }

body {
    font-family: 'Inter', Helvetica, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.7;
    color: #1c1917;
    background: #fdfdfd;
    font-weight: 400;
}

/* ── CAPA ─────────────────────────────────────────────────────── */
.capa {
    page-break-after: always;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 25cm;
    padding: 1.2cm 0.4cm 0.4cm;
    position: relative;
}
.capa-topo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.6cm;
    border-bottom: 1px solid #e7e5e4;
}
.capa-marca {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #1c1917;
}
.capa-marca span { font-weight: 300; }
.capa-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #78716c;
    border: 1px solid #e7e5e4;
    border-radius: 999px;
    padding: 4pt 10pt;
    background: #fff;
}

.capa-meio { padding: 2.5cm 0 1cm; }
.capa-eyebrow {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.25em;
    color: #a8a29e;
    margin-bottom: 1.2cm;
}
.capa-titulo {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 52pt;
    font-weight: 500;
    line-height: 0.92;
    letter-spacing: -0.04em;
    color: #1c1917;
    margin: 0 0 0.4cm;
}
.capa-titulo > span {
    display: block;
}
.capa-titulo .stroke {
    color: #d6d3d1;
    font-weight: 400;
    display: block;
    margin-top: 0.1cm;
}
.capa-subtitulo {
    font-family: 'Inter', sans-serif;
    font-size: 13pt;
    font-weight: 300;
    color: #57534e;
    margin: 0.6cm 0 0;
    max-width: 14cm;
    line-height: 1.5;
}

.capa-base {
    border-top: 1px solid #e7e5e4;
    padding-top: 0.5cm;
}
.capa-meta {
    display: flex;
    gap: 1.6cm;
    margin-bottom: 0.4cm;
}
.capa-meta-bloco {
    flex: 1;
}
.capa-meta-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7pt;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: #a8a29e;
    margin-bottom: 0.18cm;
}
.capa-meta-valor {
    font-family: 'Inter', sans-serif;
    font-size: 10pt;
    font-weight: 600;
    color: #1c1917;
    line-height: 1.35;
}
.capa-rodape {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #a8a29e;
    margin-top: 0.6cm;
    text-align: right;
}

/* ── HIERARQUIA EDITORIAL ─────────────────────────────────────── */
h1 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 32pt;
    font-weight: 500;
    line-height: 0.95;
    letter-spacing: -0.035em;
    color: #1c1917;
    margin: 1.6cm 0 0.9cm;
    padding-top: 0.5cm;
    border-top: 1px solid #1c1917;
    page-break-before: always;
}
h1:first-of-type { page-break-before: avoid; }
h1 .num {
    display: block;
    font-family: 'JetBrains Mono', monospace;
    font-size: 8pt;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.28em;
    color: #a8a29e;
    margin-bottom: 0.45cm;
}

h2 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 18pt;
    font-weight: 500;
    line-height: 1.15;
    letter-spacing: -0.02em;
    color: #1c1917;
    margin: 1.1cm 0 0.35cm;
    padding-bottom: 0.18cm;
    border-bottom: 1px solid #e7e5e4;
}

h3 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 13pt;
    font-weight: 600;
    color: #1c1917;
    margin: 0.85cm 0 0.25cm;
    letter-spacing: -0.01em;
}

h4 {
    font-family: 'Inter', sans-serif;
    font-size: 9pt;
    font-weight: 700;
    color: #44403c;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin: 0.6cm 0 0.18cm;
}

/* ── PARÁGRAFOS ───────────────────────────────────────────────── */
p {
    margin: 0 0 0.55em;
    text-align: left;
    color: #292524;
}

/* primeiro parágrafo após h1: lead text com tamanho destacado */
h1 + p,
h1 + h2 + p {
    font-size: 12pt;
    line-height: 1.55;
    color: #1c1917;
    font-weight: 400;
    margin-bottom: 0.8em;
}

/* ── ÊNFASE ───────────────────────────────────────────────────── */
strong {
    font-weight: 700;
    color: #1c1917;
}
em {
    font-style: italic;
    color: #44403c;
}

/* ── LISTAS ───────────────────────────────────────────────────── */
ul, ol {
    margin: 0.2em 0 0.7em;
    padding-left: 1.4em;
}
ul { list-style: none; padding-left: 0.2em; }
ul li {
    position: relative;
    padding-left: 1.1em;
    margin-bottom: 0.32em;
    line-height: 1.6;
}
ul li::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.62em;
    width: 5pt;
    height: 1px;
    background: #78716c;
}
ol { padding-left: 1.4em; }
ol li {
    margin-bottom: 0.32em;
    line-height: 1.6;
}
li > ul, li > ol {
    margin-top: 0.18em;
    margin-bottom: 0.18em;
}

/* ── CÓDIGO INLINE (usado para timestamps tipo `0s-3s`) ────────── */
code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 8.6pt;
    background: #f5f5f4;
    padding: 0.5pt 4pt;
    border-radius: 3pt;
    color: #1c1917;
    letter-spacing: 0;
}

pre {
    background: #fafaf9;
    border: 1px solid #e7e5e4;
    border-left: 3px solid #1c1917;
    border-radius: 6pt;
    padding: 0.55em 0.95em;
    margin: 0.55em 0 0.9em;
    overflow-x: auto;
    page-break-inside: avoid;
}
pre code {
    background: none;
    padding: 0;
    font-size: 8.5pt;
    line-height: 1.55;
}

/* ── BLOCKQUOTE EDITORIAL (Stone, sem amarelo) ────────────────── */
blockquote {
    border: none;
    border-left: 3pt solid #1c1917;
    background: transparent;
    margin: 0.65em 0 0.9em;
    padding: 0.05em 0 0.05em 0.95em;
    font-family: 'Space Grotesk', sans-serif;
    font-style: normal;
    font-weight: 500;
    font-size: 11.5pt;
    line-height: 1.45;
    color: #1c1917;
    letter-spacing: -0.005em;
    page-break-inside: avoid;
}
blockquote p { margin: 0.18em 0; color: #1c1917; }
blockquote strong { font-weight: 700; color: #1c1917; }
blockquote em { color: #57534e; font-style: italic; }

/* blockquote "label" — parágrafo único curto com nota/alerta (ex.: "Nota: 7,8/10")
   marcado no markdown via classe via fallback ao primeiro parágrafo com strong → texto */

/* ── TABELAS ELEGANTES ────────────────────────────────────────── */
table {
    width: 100%;
    border-collapse: collapse;
    margin: 0.7em 0 1em;
    font-size: 9.4pt;
    page-break-inside: avoid;
    border-top: 1.5px solid #1c1917;
    border-bottom: 1.5px solid #1c1917;
}
thead tr { background: #fafaf9; }
th {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    font-weight: 700;
    text-align: left;
    padding: 8pt 10pt;
    border-bottom: 1px solid #1c1917;
    color: #1c1917;
    text-transform: uppercase;
    letter-spacing: 0.14em;
}
td {
    padding: 7pt 10pt;
    border-bottom: 0.5px solid #e7e5e4;
    vertical-align: top;
    line-height: 1.5;
    color: #292524;
}
tr:last-child td { border-bottom: none; }
td code {
    font-size: 8.2pt;
}

/* ── SEPARADOR ────────────────────────────────────────────────── */
hr {
    border: none;
    height: 1px;
    background: linear-gradient(to right, #e7e5e4 0%, #e7e5e4 50%, transparent 100%);
    margin: 1em 0 1.1em;
}

/* ── LINKS ────────────────────────────────────────────────────── */
a {
    color: #1c1917;
    text-decoration: none;
    border-bottom: 1px solid #d6d3d1;
}

/* ── ITÁLICO EM PARÁGRAFOS DE ASSINATURA ──────────────────────── */
/* parágrafos marcados como assinatura (transformados via pré-processo
   quando todo o conteúdo é uma única ênfase italic, ex.: "*Compilado por Aya...*") */
p.assinatura {
    font-family: 'JetBrains Mono', monospace;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: #a8a29e;
    font-style: normal;
    margin-top: 1cm;
    padding-top: 0.4cm;
    border-top: 1px solid #e7e5e4;
}
"""


# ─── HEAD METADATA EXTRACTOR ─────────────────────────────────────────
def detectar_metadados(texto: str) -> dict:
    """Lê título, cliente e data do cabeçalho do markdown."""
    titulo_match = re.search(r"^#\s+(.+?)\s*$", texto, re.MULTILINE)
    cliente_match = re.search(r"\*Cliente:\s*(.+?)(?:·|\*)", texto)
    data_match = re.search(r"em\s+(\d{2}/\d{2}/\d{4}\s+às\s+\d{1,2}:\d{2})", texto)

    titulo_completo = titulo_match.group(1).strip() if titulo_match else "Dossiê"
    if " — " in titulo_completo:
        head, tail = titulo_completo.split(" — ", 1)
    else:
        head, tail = "Dossiê", titulo_completo

    return {
        "head": head.strip(),
        "tail": tail.strip(),
        "cliente": cliente_match.group(1).strip() if cliente_match else "—",
        "data": data_match.group(1).strip() if data_match else datetime.now().strftime("%d/%m/%Y às %H:%M"),
    }


def construir_capa_html(meta: dict) -> str:
    head = meta["head"]
    tail = meta["tail"]
    # quebra opcional do tail em duas linhas dramáticas se tiver "·"
    if " · " in tail:
        linha1, linha2 = tail.split(" · ", 1)
        tail_html = f'<span>{linha1}</span><span class="stroke">{linha2}</span>'
    else:
        tail_html = f"<span>{tail}</span>"

    return f"""
<div class="capa">
  <div class="capa-topo">
    <div class="capa-marca">LEMMON<span>PRODUÇÕES</span></div>
    <div class="capa-tag">● Dossiê Compilado</div>
  </div>

  <div class="capa-meio">
    <div class="capa-eyebrow">Aya · Síntese Multi-Agente · Lemmon Agentes</div>
    <h1 class="capa-titulo">
      {head}
      {tail_html}
    </h1>
    <p class="capa-subtitulo">
      Análise estratégica, compliance, roteiro e performance — compilados pelos agentes Otto, Heitor, Salles e Sonia para o cliente abaixo.
    </p>
  </div>

  <div class="capa-base">
    <div class="capa-meta">
      <div class="capa-meta-bloco">
        <div class="capa-meta-label">Cliente</div>
        <div class="capa-meta-valor">{meta['cliente']}</div>
      </div>
      <div class="capa-meta-bloco">
        <div class="capa-meta-label">Compilado em</div>
        <div class="capa-meta-valor">{meta['data']}</div>
      </div>
      <div class="capa-meta-bloco">
        <div class="capa-meta-label">Agentes</div>
        <div class="capa-meta-valor">Otto · Heitor · Salles · Sonia</div>
      </div>
    </div>
    <div class="capa-rodape">Documento confidencial · uso interno Lemmon Produções</div>
  </div>
</div>
"""


# ─── MARKDOWN PRE-PROCESSING ────────────────────────────────────────
def aplicar_numeracao_editorial(texto: str) -> str:
    """Converte '# 01 / Otto — Estratégia' em h1 com .num + título.

    O renderizador HTML padrão do markdown gera <h1>01 / Otto — Estratégia</h1>;
    queremos um <h1><span class="num">01 / OTTO</span>Estratégia</h1>.
    Faz substituição via pre-process antes do markdown.convert.
    """
    pattern = re.compile(
        r"^#\s+(\d{2})\s*/\s*([^—\n]+?)\s+—\s+(.+?)\s*$",
        re.MULTILINE,
    )

    def _sub(m: re.Match) -> str:
        numero, agente, titulo = m.groups()
        # marcador HTML inline; o markdown deixa HTML cru passar quando começa por <
        return f'<h1><span class="num">{numero.strip()} / {agente.strip().upper()}</span>{titulo.strip()}</h1>'

    return pattern.sub(_sub, texto)


def marcar_assinaturas(texto: str) -> str:
    """Linhas que são SÓ uma ênfase italic (ex: `*Compilado por Aya...*`)
    viram <p class="assinatura"> no HTML — estilo eyebrow mono.
    """
    pattern = re.compile(r"^\*([^*\n]+?)\*\s*$", re.MULTILINE)
    return pattern.sub(r'<p class="assinatura">\1</p>', texto)


def md_para_html(texto: str) -> str:
    texto = aplicar_numeracao_editorial(texto)
    texto = marcar_assinaturas(texto)
    md = markdown.Markdown(extensions=["tables", "fenced_code", "md_in_html"])
    return md.convert(texto)


# ─── ORCHESTRATION ──────────────────────────────────────────────────
def gerar(md_path: Path, pdf_path: Path) -> Path:
    if not md_path.exists():
        print(f"ERRO: {md_path} não existe.")
        sys.exit(1)

    texto = md_path.read_text(encoding="utf-8")
    meta = detectar_metadados(texto)

    pdf_path.parent.mkdir(parents=True, exist_ok=True)

    corpo_html = md_para_html(texto)
    capa_html = construir_capa_html(meta)

    html_completo = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>{meta['head']} — {meta['tail']}</title></head>
<body>
{capa_html}
{corpo_html}
</body>
</html>"""

    HTML(string=html_completo, base_url=str(md_path.parent)).write_pdf(
        str(pdf_path),
        stylesheets=[CSS(string=CSS_LEMMON)],
    )

    kb = pdf_path.stat().st_size // 1024
    print(f"✓ Gerado: {pdf_path}")
    print(f"  Cliente: {meta['cliente']} · Data: {meta['data']} · Tamanho: {kb} KB")
    return pdf_path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("md", type=Path, help="Caminho do arquivo .md de origem")
    parser.add_argument("--out", type=Path, default=None, help="Caminho do PDF de saída (default: ao lado do .md)")
    args = parser.parse_args()

    md_path = args.md.resolve()
    pdf_path = args.out.resolve() if args.out else md_path.with_suffix(".pdf")
    gerar(md_path, pdf_path)


if __name__ == "__main__":
    main()
