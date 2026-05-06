'use client'
import { AGENT_MAP } from '@/lib/agents'
import { type HistoryItem } from '@/lib/useHistory'

export interface FilterState {
  periodo: '' | '7d' | '30d' | '90d'
  agente: string
  avaliacaoMin: '' | '1' | '2' | '3' | '4' | '5'
  origem: string
  semAvaliacao: boolean
}

export const DEFAULT_FILTER: FilterState = {
  periodo: '',
  agente: '',
  avaliacaoMin: '',
  origem: '',
  semAvaliacao: false,
}

export function applyFilter(sessions: HistoryItem[], f: FilterState): HistoryItem[] {
  return sessions.filter(s => {
    if (f.semAvaliacao && s.avaliacao !== null) return false
    if (!f.semAvaliacao && f.avaliacaoMin && (s.avaliacao === null || s.avaliacao < Number(f.avaliacaoMin))) return false
    if (f.agente && !s.agentes_usados.includes(f.agente)) return false
    if (f.origem && s.origem !== f.origem) return false
    if (f.periodo) {
      const ts = new Date(s.timestamp)
      const cutoff = new Date()
      if (f.periodo === '7d') cutoff.setDate(cutoff.getDate() - 7)
      else if (f.periodo === '30d') cutoff.setDate(cutoff.getDate() - 30)
      else if (f.periodo === '90d') cutoff.setDate(cutoff.getDate() - 90)
      if (ts < cutoff) return false
    }
    return true
  })
}

export function FilterBar({ filter, onChange, sessions }: {
  filter: FilterState
  onChange: (patch: Partial<FilterState>) => void
  sessions: HistoryItem[]
}) {
  const origens = Array.from(new Set(sessions.map(s => s.origem).filter(Boolean)))
  const activeCount = Object.values(filter).filter(v => v !== '' && v !== false).length

  return (
    <div className="px-3 py-2 border-b border-stone-100 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-mono text-stone-400 uppercase tracking-widest">Filtros</span>
        {activeCount > 0 && (
          <button onClick={() => onChange(DEFAULT_FILTER)}
            className="text-[8px] font-mono text-stone-400 hover:text-stone-700 transition-colors">
            limpar ({activeCount})
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {/* Período */}
        <select value={filter.periodo} onChange={e => onChange({ periodo: e.target.value as FilterState['periodo'] })}
          className="px-1.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[8px] font-mono text-stone-600 focus:outline-none">
          <option value="">todo período</option>
          <option value="7d">7 dias</option>
          <option value="30d">30 dias</option>
          <option value="90d">90 dias</option>
        </select>
        {/* Origem */}
        {origens.length > 1 && (
          <select value={filter.origem} onChange={e => onChange({ origem: e.target.value })}
            className="px-1.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[8px] font-mono text-stone-600 focus:outline-none">
            <option value="">toda origem</option>
            {origens.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        )}
        {/* Agente */}
        <select value={filter.agente} onChange={e => onChange({ agente: e.target.value })}
          className="px-1.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[8px] font-mono text-stone-600 focus:outline-none">
          <option value="">todo agente</option>
          {Object.values(AGENT_MAP).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {/* Avaliação mínima */}
        <select
          value={filter.semAvaliacao ? 'sem' : filter.avaliacaoMin}
          onChange={e => {
            if (e.target.value === 'sem') onChange({ semAvaliacao: true, avaliacaoMin: '' })
            else onChange({ semAvaliacao: false, avaliacaoMin: e.target.value as FilterState['avaliacaoMin'] })
          }}
          className="px-1.5 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-[8px] font-mono text-stone-600 focus:outline-none">
          <option value="">qualquer nota</option>
          <option value="sem">sem avaliação</option>
          <option value="5">★★★★★ (5)</option>
          <option value="4">★★★★+ (4+)</option>
          <option value="3">★★★+ (3+)</option>
        </select>
      </div>
    </div>
  )
}
