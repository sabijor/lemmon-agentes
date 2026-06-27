# Meu Álbum da Copa 2026 — Dashboard

Dashboard interativo e mobile-first para acompanhar o álbum **Panini FIFA World Cup 2026**:
quais figurinhas você **tem**, quais **faltam**, e quais **jogadores** já estão colados ou não.

## Como usar

Abra o arquivo **`index.html`** no navegador do celular (toque duas vezes / "Abrir com"
→ Safari ou Chrome). É 100% local e offline — nenhum dado sai do seu aparelho.

> Dica: no iPhone, salve em *Arquivos* e abra; ou use "Adicionar à Tela de Início"
> no Safari pra virar um atalho que parece um app.

## Funcionalidades

- **Resumo no topo**: total de figurinhas, coladas, faltando e % completo, com barra de progresso.
- **Filtros**: `Todas` · `Faltam` · `Tenho`.
- **Busca** por jogador, seleção ou código (ex.: `brasil`, `Paquetá`, `BRA 6`).
- **Chips** por seleção pra pular direto.
- **Seções dobráveis** por seleção, cada uma com seu progresso (ex.: `7/20 coladas`).
- **Toque numa figurinha** pra alternar entre *tenho* / *falta*. As alterações ficam
  salvas no próprio navegador (`localStorage`), então da próxima vez continua de onde parou.
- **Resetar** volta tudo pro estado original escaneado.

## De onde vêm os dados

Gerado a partir das fotos das páginas do álbum. Cada espaço do álbum mostra o código
(ex.: `BRA 6`), o nome do jogador e se está colado (foto brilhante) ou vazio (número grande).
São **964 figurinhas** lidas: **48 seleções** (grupos A–L), as aberturas e os especiais Coca‑Cola.

`dados-brutos.json` guarda a leitura completa (por imagem), caso queira conferir ou reprocessar.

> Observação: a leitura é automática a partir das fotos e pode ter pequenos erros de OCR
> em um nome ou outro. Por isso a dashboard é editável — é só tocar pra corrigir.
