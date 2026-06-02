'use client'
/**
 * PROD-14 — Página de pricing.
 *
 * 3 planos focados em clínicas de saúde (Hator como cliente piloto):
 *  - Plano Solo (gratuito 7 dias)
 *  - Plano Clínica (R$ 497/mês) — incluindo Espelho IA do médico calibrado
 *  - Plano Agência (R$ 997/mês) — multi-cliente com brand kits
 *
 * Página estática; conversões reais (Stripe/Pagar.me) ficam pra próximo sprint.
 */
import Link from 'next/link'

const PLANOS = [
  {
    id: 'solo',
    nome: 'Solo',
    preco: 'Grátis',
    sub: '7 dias de trial · cartão dispensado',
    destaque: false,
    cor: 'stone',
    inclui: [
      '3 agentes especialistas (Otto, Carlos, Aya)',
      '10 sessões / 7 dias',
      'Export PDF',
      'Sem espelho IA do médico',
      'Sem cortes automáticos',
    ],
    cta: 'Começar trial',
    href: '/?trial=1',
  },
  {
    id: 'clinica',
    nome: 'Clínica',
    preco: 'R$ 497',
    sub: '/mês · faturamento mensal',
    destaque: true,
    cor: 'emerald',
    inclui: [
      'Todos os 13 agentes especialistas',
      '60 sessões/mês (suficiente pra ~2 Reels/dia)',
      'Pedro Espelho IA calibrado com material do médico',
      'Compliance Meta (Heitor)',
      'Cortes automáticos de podcast/live',
      'Briefing reverso (refs visuais)',
      'WhatsApp pra avisar dossiê pronto',
      'Suporte prioritário (WhatsApp Lemmon)',
    ],
    cta: 'Falar com a equipe',
    href: 'mailto:contato@lemmon.com.br?subject=Plano%20Clinica',
  },
  {
    id: 'agencia',
    nome: 'Agência',
    preco: 'R$ 997',
    sub: '/mês · até 5 clientes',
    destaque: false,
    cor: 'amber',
    inclui: [
      'Tudo do Plano Clínica',
      'Brand Kit por cliente (logo, paleta, tom)',
      'Multi-user (Pedro + secretária + freelancer)',
      'Dashboard de performance Instagram',
      'White-label opcional (logo Lemmon escondido)',
      'Onboarding 1-a-1 com Calebe',
      'Slack dedicado com a Lemmon',
    ],
    cta: 'Solicitar demo',
    href: 'mailto:contato@lemmon.com.br?subject=Plano%20Agencia',
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-900 dark:to-stone-950">
      <header className="border-b border-stone-200 dark:border-stone-800 bg-white/80 dark:bg-stone-900/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-stone-900 dark:bg-stone-100 flex items-center justify-center">
              <span className="text-white dark:text-stone-900 text-xs font-display font-bold">L</span>
            </div>
            <span className="font-display font-semibold text-stone-900 dark:text-stone-100">
              Lemmon Agentes
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-mono uppercase tracking-widest text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
          >
            ← voltar ao app
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-stone-900 dark:text-stone-100 mb-4 leading-tight">
            O departamento de marketing<br />da sua clínica em IA
          </h1>
          <p className="text-lg text-stone-600 dark:text-stone-300 max-w-2xl mx-auto">
            13 especialistas conversam, escrevem, validam e entregam.
            Você acompanha pelo chat. Plano pensado pra <strong>clínicas de saúde</strong>.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {PLANOS.map(p => (
            <div
              key={p.id}
              className={`rounded-2xl border-2 p-6 flex flex-col transition-all hover:scale-[1.02] ${
                p.destaque
                  ? 'border-emerald-500 bg-white dark:bg-stone-900 shadow-xl shadow-emerald-500/10'
                  : 'border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/60'
              }`}
            >
              {p.destaque && (
                <div className="inline-block bg-emerald-500 text-white text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full self-start mb-3">
                  Mais escolhido
                </div>
              )}
              <h2 className="text-2xl font-display font-bold text-stone-900 dark:text-stone-100 mb-1">
                Plano {p.nome}
              </h2>
              <div className="flex items-baseline gap-2 mb-1">
                <span className={`text-3xl font-display font-bold ${
                  p.cor === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' :
                  p.cor === 'amber' ? 'text-amber-600 dark:text-amber-400' :
                  'text-stone-900 dark:text-stone-100'
                }`}>
                  {p.preco}
                </span>
              </div>
              <p className="text-xs font-mono text-stone-500 dark:text-stone-400 mb-5">
                {p.sub}
              </p>
              <ul className="space-y-2 mb-6 flex-1">
                {p.inclui.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-200">
                    <span className={`flex-shrink-0 mt-0.5 ${
                      item.startsWith('Sem ') ? 'text-stone-300 dark:text-stone-600' : 'text-emerald-500'
                    }`}>
                      {item.startsWith('Sem ') ? '·' : '✓'}
                    </span>
                    <span className={item.startsWith('Sem ') ? 'text-stone-400 dark:text-stone-500 line-through' : ''}>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href={p.href}
                className={`block text-center py-3 rounded-xl font-mono text-xs uppercase tracking-widest transition-colors ${
                  p.destaque
                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                    : 'border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-stone-900 rounded-2xl p-8 border border-stone-200 dark:border-stone-700">
          <h2 className="text-xl font-display font-bold text-stone-900 dark:text-stone-100 mb-3">
            Por que não usar ChatGPT direto?
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm text-stone-700 dark:text-stone-300">
            <p>
              <strong className="text-stone-900 dark:text-stone-100">ChatGPT não conhece a sua clínica.</strong>{' '}
              Nosso Pedro Espelho IA é calibrado com o material do seu médico — fala como ele,
              recusa o que ele recusaria, valida pela ótica dele.
            </p>
            <p>
              <strong className="text-stone-900 dark:text-stone-100">ChatGPT não conhece o mercado de saúde.</strong>{' '}
              Heitor faz busca em CFM/ANVISA/Meta a cada Reel pra você não levar ban
              do Instagram nem processo do conselho.
            </p>
            <p>
              <strong className="text-stone-900 dark:text-stone-100">ChatGPT esquece tudo entre sessões.</strong>{' '}
              Nosso Concierge consulta o histórico antes de perguntar — vê que você fez Reels
              de menopausa semana passada e propõe continuar a linha.
            </p>
            <p>
              <strong className="text-stone-900 dark:text-stone-100">ChatGPT não tem opinião.</strong>{' '}
              Otto recusa briefing raso. Carlos não escreve hook ruim. Pedro nega frase
              que o médico não falaria. Isso protege sua marca.
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-stone-400 mt-8">
          Todos os planos cobram a Anthropic separadamente (custo de IA: ~R$ 0,50 a R$ 2,80/sessão).
          <br />
          Você pode trazer sua chave própria pra eliminar este custo.
        </p>
      </main>
    </div>
  )
}
