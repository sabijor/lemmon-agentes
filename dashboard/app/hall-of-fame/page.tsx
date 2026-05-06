'use client'
import { useState } from 'react'
import Link from 'next/link'
import { fetchHistorico, type Session } from '@/lib/api-client'
import { useApiQuery } from '@/lib/use-api-query'
import { AGENT_MAP } from '@/lib/agents'

function fmt(ts: string) {
  return new Date(ts).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export default function HallOfFame() {
  const { data: allSessions, loading } = useApiQuery<Session[]>(fetchHistorico)
  const sessions = allSessions?.filter(s => s.avaliacao === 5) ?? []
  const [filter, setFilter] = useState<{ formato: string; periodo: string }>({ formato: '', periodo: '' })

  const filtered = sessions.filter(s => {
    if (filter.formato && !s.agentes_usados.includes(filter.formato)) return false
    if (filter.periodo) {
      const ts = new Date(s.timestamp)
      const cutoff = new Date()
      if (filter.periodo === '7d') cutoff.setDate(cutoff.getDate() - 7)
      else if (filter.periodo === '30d') cutoff.setDate(cutoff.getDate() - 30)
      else if (filter.periodo === '90d') cutoff.setDate(cutoff.getDate() - 90)
      if (ts < cutoff) return false
    }
    return true
  })

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-8">
      {/* Header */}
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Hall of Fame</h1>
            <p className="text-sm font-mono text-stone-400 mt-1">Sessões 5⭐ — o melhor da Lemmon Produções</p>
          </div>
          <Link href="/" className="text-[10px] font-mono text-stone-500 hover:text-stone-300 transition-colors uppercase tracking-widest">
            ← Voltar
          </Link>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <select
            value={filter.periodo}
            onChange={e => setFilter(f => ({ ...f, periodo: e.target.value }))}
            className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-[10px] font-mono text-stone-300 focus:outline-none"
          >
            <option value="">Todos os períodos</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
          </select>
          <select
            value={filter.formato}
            onChange={e => setFilter(f => ({ ...f, formato: e.target.value }))}
            className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-700 text-[10px] font-mono text-stone-300 focus:outline-none"
          >
            <option value="">Todos os agentes</option>
            {Object.values(AGENT_MAP).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <span className="text-[9px] font-mono text-stone-500 ml-auto">{filtered.length} sessão{filtered.length !== 1 ? 'ões' : ''}</span>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex gap-1">
              {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-stone-600 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }}/>)}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-4xl mb-4">🏆</p>
            <p className="text-sm font-mono text-stone-500">Nenhuma sessão 5⭐ encontrada.</p>
            <p className="text-[10px] font-mono text-stone-600 mt-1">Avalie sessões no histórico para aparecerem aqui.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(s => (
              <div key={s.session_id}
                className="bg-stone-900 border border-stone-800 rounded-2xl p-5 hover:border-amber-800/50 transition-colors group">
                {/* Stars */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-amber-400 text-sm">★★★★★</span>
                  <span className="text-[8px] font-mono text-stone-500 ml-auto">{fmt(s.timestamp)}</span>
                </div>

                {/* Briefing */}
                <p className="text-sm font-mono text-stone-200 leading-relaxed line-clamp-3 mb-4">
                  {s.briefing || '(sem briefing)'}
                </p>

                {/* Agents */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {s.agentes_usados.map(agId => {
                    const ag = AGENT_MAP[agId as keyof typeof AGENT_MAP]
                    if (!ag) return null
                    return (
                      <span key={agId}
                        className="text-[8px] font-mono px-2 py-0.5 rounded-full"
                        style={{ background: `${ag.color}22`, color: ag.color, border: `1px solid ${ag.color}44` }}>
                        {ag.name}
                      </span>
                    )
                  })}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className={`text-[8px] font-mono px-2 py-0.5 rounded-full border ${
                    s.origem === 'reuniao'
                      ? 'bg-violet-900/30 border-violet-700/40 text-violet-400'
                      : 'bg-stone-800 border-stone-700 text-stone-500'
                  }`}>{s.origem}</span>
                  {s.custo_total_usd > 0 && (
                    <span className="text-[8px] font-mono text-stone-600">${s.custo_total_usd.toFixed(4)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
