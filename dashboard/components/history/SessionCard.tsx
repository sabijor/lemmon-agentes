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
        return (
          <button key={s.session_id} onClick={() => onSelect(s.session_id)}
            className={`w-full text-left px-4 py-3 border-b border-stone-100 transition-colors
              ${active ? 'bg-stone-900' : 'hover:bg-stone-50'}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {s.origem === 'reuniao' && (
                <span className={`text-[7px] font-mono px-1 py-0.5 rounded-full border ${
                  active ? 'bg-white/10 border-white/20 text-white/60' : 'bg-violet-50 border-violet-200 text-violet-500'
                }`}>reunião</span>
              )}
            </div>
            <p className={`text-[10px] font-mono font-bold leading-snug line-clamp-2 mb-1.5
              ${active ? 'text-white' : 'text-stone-700'}`}>
              {s.briefing || '(sem briefing)'}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[8px] font-mono text-stone-400">
                {s.timestamp ? fmt(s.timestamp) : '—'}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {s.custo_total_usd > 0 && (
                  <span className="text-[8px] font-mono text-stone-400">
                    ${s.custo_total_usd.toFixed(4)}
                  </span>
                )}
                {s.favorito && <span className="text-[10px]" style={{ color: '#f59e0b' }}>★</span>}
              </div>
            </div>
            <div className="flex gap-1 mt-1.5">
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
          </button>
        )
      })}
    </>
  )
}
