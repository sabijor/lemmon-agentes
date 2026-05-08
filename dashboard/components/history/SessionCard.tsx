'use client'
import { AGENT_MAP } from '@/lib/agents'
import { type HistoryItem } from '@/lib/useHistory'

function fmt(ts: string) {
  const d = new Date(ts)
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short', day: '2-digit', month: 'short',
  }) + ' · ' + d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', minute: '2-digit',
  })
}

const ORIGEM_ICON: Record<string, string> = {
  dashboard: '📊',
  reuniao: '💬',
  sandbox: '🧪',
  cli: '⌨️',
}

export function Stars({ n }: { n: number | null }) {
  if (n === null) return <span className="text-[9px] font-mono text-stone-300">—</span>
  return (
    <span className="text-[10px]">
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= n ? '#f59e0b' : '#d6d3d1' }}>★</span>
      ))}
    </span>
  )
}

export function SessionList({ sessions, loading, selectedId, onSelect }: {
  sessions: HistoryItem[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="flex gap-0.5">
        {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}
      </div>
    </div>
  )

  if (sessions.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <span className="text-2xl">🗂</span>
      <p className="text-[10px] font-mono text-stone-400 uppercase tracking-widest leading-relaxed">
        Nenhuma sessão<br />salva ainda
      </p>
    </div>
  )

  return (
    <>
      {sessions.map(s => {
        const active = s.session_id === selectedId
        const origemIcon = ORIGEM_ICON[s.origem ?? 'dashboard'] ?? '📊'
        const tags = (s.tags ?? []).slice(0, 3)
        return (
          <button key={s.session_id} onClick={() => onSelect(s.session_id)}
            className={`w-full text-left px-4 py-3 border-b border-stone-100 transition-colors
              ${active ? 'bg-stone-900' : 'hover:bg-stone-50'}`}
          >
            {/* Origin icon + favorito */}
            <div className="flex items-center gap-1 mb-1">
              <span
                className="text-[9px] leading-none"
                title={s.origem ?? 'dashboard'}
              >
                {origemIcon}
              </span>
              {s.favorito && <span className="text-[10px] ml-auto" style={{ color: '#f59e0b' }}>★</span>}
            </div>

            <p className={`text-[10px] font-mono font-bold leading-snug line-clamp-2 mb-1.5
              ${active ? 'text-white' : 'text-stone-700'}`}>
              {s.briefing || '(sem briefing)'}
            </p>

            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[8px] font-mono text-stone-400">
                {s.timestamp ? fmt(s.timestamp) : '—'}
              </span>
              {s.custo_total_usd > 0 && (
                <span className="text-[8px] font-mono text-stone-400 flex-shrink-0">
                  ${s.custo_total_usd.toFixed(4)}
                </span>
              )}
            </div>

            {/* Agent chips */}
            <div className="flex gap-1 flex-wrap">
              {s.agentes_usados.map(a => {
                const ag = AGENT_MAP[a as keyof typeof AGENT_MAP]
                if (!ag) return null
                return (
                  <span key={a} className="text-[7px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ background: active ? 'rgba(255,255,255,0.15)' : ag.colorDim, color: active ? 'white' : ag.color }}>
                    {ag.name}
                  </span>
                )
              })}
            </div>

            {/* Semantic tags */}
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {tags.map(tag => (
                  <span key={tag}
                    className={`text-[7px] font-mono px-1.5 py-0.5 rounded-full border ${
                      active
                        ? 'border-white/20 text-white/60'
                        : 'border-stone-200 text-stone-500 bg-stone-50'
                    }`}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </button>
        )
      })}
    </>
  )
}
