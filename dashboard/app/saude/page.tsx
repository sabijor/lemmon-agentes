'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { fetchHistorico, type Session } from '@/lib/api-client'
import { useApiQuery } from '@/lib/use-api-query'
import { AGENT_MAP } from '@/lib/agents'

function pct(n: number, total: number) {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function fmt$(n: number) {
  return n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(3)}`
}

function monthLabel(date: Date) {
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function getMonth(ts: string) {
  const d = new Date(ts)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function Saude() {
  const { data: sessions, loading } = useApiQuery<Session[]>(fetchHistorico)

  const stats = useMemo(() => {
    if (!sessions?.length) return null

    const total = sessions.length
    const totalCost = sessions.reduce((s, r) => s + (r.custo_total_usd || 0), 0)
    const avgCost = totalCost / total
    const evaluated = sessions.filter(s => s.avaliacao !== null).length
    const fiveStar = sessions.filter(s => s.avaliacao === 5).length
    const avalRate = pct(evaluated, total)
    const fiveRate = pct(fiveStar, total)

    // Sessions + cost per month (last 6)
    const now = new Date()
    const months: { key: string; label: string; count: number; cost: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({ key, label: monthLabel(d), count: 0, cost: 0 })
    }
    sessions.forEach(s => {
      const mk = getMonth(s.timestamp)
      const m = months.find(x => x.key === mk)
      if (m) { m.count++; m.cost += s.custo_total_usd || 0 }
    })

    // Agent usage
    const agentCounts: Record<string, number> = {}
    sessions.forEach(s => {
      s.agentes_usados?.forEach(a => { agentCounts[a] = (agentCounts[a] || 0) + 1 })
    })
    const agentRanking = Object.entries(agentCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, count, agent: AGENT_MAP[id as keyof typeof AGENT_MAP] }))

    const maxMonth = Math.max(...months.map(m => m.count), 1)
    const maxAgent = Math.max(...agentRanking.map(a => a.count), 1)

    return { total, totalCost, avgCost, evaluated, fiveStar, avalRate, fiveRate, months, agentRanking, maxMonth, maxAgent }
  }, [sessions])

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Dashboard de Saúde</h1>
            <p className="text-sm font-mono text-stone-400 mt-1">Visão geral do sistema — todos os tempos</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/hall-of-fame" className="text-[10px] font-mono text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest">
              🏆 Hall of Fame
            </Link>
            <Link href="/" className="text-[10px] font-mono text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest">
              ← Voltar
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-stone-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : !stats ? (
          <div className="text-center py-32">
            <p className="text-sm font-mono text-stone-500">Nenhuma sessão encontrada.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'sessões totais', value: stats.total.toString(), sub: '' },
                { label: 'custo total', value: fmt$(stats.totalCost), sub: `avg ${fmt$(stats.avgCost)}/sessão` },
                { label: 'taxa avaliação', value: `${stats.avalRate}%`, sub: `${stats.evaluated} de ${stats.total}` },
                { label: 'taxa 5 estrelas', value: `${stats.fiveRate}%`, sub: `${stats.fiveStar} sessões` },
              ].map(card => (
                <div key={card.label} className="bg-stone-900 border border-stone-800 rounded-2xl p-5">
                  <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest mb-2">{card.label}</p>
                  <p className="text-2xl font-display font-bold">{card.value}</p>
                  {card.sub && <p className="text-[9px] font-mono text-stone-500 mt-1">{card.sub}</p>}
                </div>
              ))}
            </div>

            {/* Sessions per month */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
              <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest mb-5">sessões por mês (últimos 6)</p>
              <div className="flex items-end gap-3 h-28">
                {stats.months.map(m => (
                  <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
                    <span className="text-[8px] font-mono text-stone-400">{m.count || ''}</span>
                    <div className="w-full rounded-t-md bg-stone-700 relative overflow-hidden" style={{ height: 80 }}>
                      <div
                        className="absolute bottom-0 w-full rounded-t-md bg-stone-400 transition-all duration-700"
                        style={{ height: `${(m.count / stats.maxMonth) * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] font-mono text-stone-500 text-center leading-tight">{m.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Cost per month */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
              <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest mb-5">custo por mês (USD)</p>
              <div className="flex items-end gap-3 h-28">
                {stats.months.map(m => {
                  const maxCost = Math.max(...stats.months.map(x => x.cost), 0.001)
                  return (
                    <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
                      <span className="text-[8px] font-mono text-stone-400">{m.cost > 0 ? fmt$(m.cost) : ''}</span>
                      <div className="w-full rounded-t-md bg-stone-700 relative overflow-hidden" style={{ height: 80 }}>
                        <div
                          className="absolute bottom-0 w-full rounded-t-md bg-emerald-700 transition-all duration-700"
                          style={{ height: `${(m.cost / maxCost) * 100}%` }}
                        />
                      </div>
                      <span className="text-[8px] font-mono text-stone-500 text-center leading-tight">{m.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Agent usage */}
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6">
              <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest mb-5">uso de agentes</p>
              <div className="space-y-3">
                {stats.agentRanking.map(({ id, count, agent }) => (
                  <div key={id} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-28 flex-shrink-0 min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: agent?.color ?? '#a8a29e' }} />
                      <span className="text-[9px] font-mono text-stone-300 truncate">
                        {agent?.name ?? id}
                      </span>
                    </div>
                    <div className="flex-1 h-4 bg-stone-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${(count / stats.maxAgent) * 100}%`,
                          background: agent?.color ?? '#a8a29e',
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-stone-400 w-8 text-right flex-shrink-0">{count}</span>
                    <span className="text-[8px] font-mono text-stone-600 w-8 text-right flex-shrink-0">
                      {pct(count, stats.total)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
