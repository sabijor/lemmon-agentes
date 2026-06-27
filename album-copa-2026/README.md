# Meu Álbum da Copa 2026 — Dashboard

Dashboard interativo, mobile-first e offline para acompanhar o álbum **Panini FIFA World Cup 2026**:
quais figurinhas você **tem**, quais **faltam**, **repetidas** para troca, e quais **jogadores**
já estão colados. Visual baseado no design system **AURA** do projeto (paleta Stone, tipografia
Space Grotesk / Inter / JetBrains Mono, accent âmbar).

## Como usar

Abra **`index.html`** no navegador do celular. É 100% local — nenhum dado sai do aparelho.
Link público (mesmo arquivo, servido via htmlpreview):
`https://htmlpreview.github.io/?https://github.com/sabijor/lemmon-agentes/blob/album-copa/album-copa-2026/index.html`

No iPhone: abra no Safari → Compartilhar → **Adicionar à Tela de Início** (vira um app em tela cheia
com ícone próprio).

## Funcionalidades

- **Resumo**: total / coladas / faltam / % completo, com barra de progresso.
- **Filtros** `Todas · Faltam · Tenho` e **ordenação** (`Álbum`, `Quase lá`, `Mais faltam`).
- **Busca** por jogador, seleção ou código, **ignorando acentos** (`militao` acha `Éder Militão`).
- **Chips** por **Grupo (A–L)** e por **seleção**, com contador (`BRA 8/20`).
- **Seções dobráveis** por seleção, cada uma com seu progresso.
- **Toque** numa figurinha para alternar tenho / falta (com micro-animação + **desfazer**).
- **Repetidas**: nas coladas, use `−` / `+` para contar quantas você tem para troca.
- **Lista de troca**: gera um texto com faltantes + repetidas para copiar/compartilhar.
- **Backup**: exportar/importar seu progresso num arquivo `.json` (para trocar de aparelho).
- **PWA**: manifest + ícone para "Adicionar à Tela de Início".
- Tudo salvo no navegador (`localStorage`).

## Dados

Gerado a partir das fotos das páginas do álbum: **964 figurinhas** — **48 seleções** (grupos A–L),
aberturas e especiais Coca-Cola. `dados-brutos.json` guarda a leitura completa por imagem.

> A leitura é automática a partir das fotos e pode ter pequenos erros de OCR num nome ou outro;
> por isso a dashboard é totalmente editável (toque para corrigir).
