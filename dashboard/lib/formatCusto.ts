/**
 * T190.B3 — formatar custos USD em R$ pra cliente brasileiro.
 *
 * Taxa fixa $1 = R$5.50 (média 2026). Não usamos câmbio em tempo real porque:
 *  1. Custo é estimativa, não cobrança real ao cliente
 *  2. Cliente pré-paga Anthropic em USD, R$ é só pra ele ter noção
 *  3. Adicionar dep de API de câmbio = mais ponto de falha
 *
 * Se quiser overridear, define `NEXT_PUBLIC_USD_BRL_RATE` no env (cliente).
 */

const USD_BRL_RATE = parseFloat(process.env.NEXT_PUBLIC_USD_BRL_RATE || '5.50')

/** Formata custo em USD pra string em R$ amigável. Ex: 0.42 → "R$ 2,30" */
export function formatCustoBRL(usd: number): string {
  const brl = usd * USD_BRL_RATE
  return `R$ ${brl.toFixed(2).replace('.', ',')}`
}

/** Versão compacta com USD entre parênteses pra modo expert. Ex: "R$ 2,30 ($0.42)" */
export function formatCustoCompleto(usd: number): string {
  return `${formatCustoBRL(usd)} ($${usd.toFixed(2)})`
}
