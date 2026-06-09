# Carrossel · Recrutamento de Corretor — padrão AURA

Refação da arte original do story "Procuro Corretor de Imóveis" (@toninhopires.re),
agora como **carrossel de 5 telas em proporção de stories (1080×1920)**, dentro do
design system **AURA** (`design_system.html`).

## Conceito (leitura Otto)

O anúncio original vende uma **vaga**. Ele já entrega o diferencial sem perceber:
"ambiente saudável", "mentoria", "acompanhamento próximo". A virada é parar de
pedir corretor e passar a **oferecer um ambiente** — e ser seletivo a respeito.

- Tese: *Não é sobre vender mais. É sobre vender bem — e bem acompanhado.*
- Reframe: *Talvez o problema nunca tenha sido você. Foi o terreno.*

## Telas

1. **Capa** — hook + tese (dark)
2. **Diagnóstico** — o que trava o corretor hoje (light)
3. **O ambiente** — 3 pilares: ambiente saudável · mentoria real · método (dark)
4. **Perfil** — pra quem é / pra quem não é (light)
5. **Convite** — CTA "me chame no privado" + @ (dark)

## Padrão AURA aplicado

- Paleta Stone neutra · off-white `#fdfdfd` · apex `#1C1917` · acento âmbar→laranja pontual
- Tipografia: **Space Grotesk** (display), **Inter** (texto), **JetBrains Mono** (labels)
- Eyebrows mono em caixa-alta com numeração `01 /`, ruído sutil, orbs de blur, glass cards, cantos arredondados

## Arquivos

- `carrossel.html` — arte final, **autocontida** (fontes embutidas em base64). Abre em qualquer navegador.
- `carrossel.template.html` — fonte editável (sem fontes embutidas; placeholder `<!--FONTS-->`).
- `slide-1..5.png` — export 1080×1920 @2x, prontos pra postar.

## Regerar os PNGs

Renderizado via headless Chromium (playwright-core + @sparticuz/chromium),
viewport 1080×1920, `deviceScaleFactor: 2`, screenshot por `.slide`.
Para editar: alterar `carrossel.template.html`, reinjetar as fontes no `<!--FONTS-->`
e re-exportar cada `.slide`.
