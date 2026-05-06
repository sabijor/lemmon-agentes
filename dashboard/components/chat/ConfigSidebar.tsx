import { AGENT_MAP } from '@/lib/agents'
import { type AgentConfig } from '@/lib/useChat'

interface Props {
  agentConfig: AgentConfig
  onUpdateConfig: <K extends keyof AgentConfig>(agent: K, patch: Partial<AgentConfig[K]>) => void
  isRunning: boolean
  custoCap: number | null
  onSetCustoCap: (v: number | null) => void
}

export function ConfigSidebar({ agentConfig, onUpdateConfig, isRunning, custoCap, onSetCustoCap }: Props) {
  return (
    <div className="w-44 flex-shrink-0 border-r border-stone-200/50 flex flex-col bg-stone-50/70">
      <div className="px-3 py-2.5 border-b border-stone-200/40">
        <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Configurações</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Otto */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.otto?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Otto</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">modo visual</p>
          <div className="flex flex-col gap-1">
            {(['completo', 'resumido', 'minimo'] as const).map(v => (
              <button key={v} disabled={isRunning} onClick={() => onUpdateConfig('otto', { modo_visual: v })}
                className={`px-2 py-1 rounded-md text-[9px] font-mono border transition-all text-left disabled:opacity-50 ${
                  agentConfig.otto.modo_visual === v
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                }`}>{v}</button>
            ))}
          </div>
        </div>

        {/* Heitor */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.heitor?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Heitor</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">buscas: {agentConfig.heitor.max_buscas}</p>
          <input type="range" min={1} max={10} value={agentConfig.heitor.max_buscas}
            disabled={isRunning}
            onChange={e => onUpdateConfig('heitor', { max_buscas: Number(e.target.value) })}
            className="w-full accent-stone-900 disabled:opacity-50" />
          <div className="flex justify-between mt-0.5">
            <span className="text-[8px] font-mono text-stone-300">1</span>
            <span className="text-[8px] font-mono text-stone-300">10</span>
          </div>
        </div>

        {/* Salles */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.salles?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Salles</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">formato</p>
          <div className="flex flex-col gap-1 mb-3">
            {(['auto', 'reels', 'documental', 'mini-doc', 'tese', 'aftermovie'] as const).map(v => (
              <button key={v} disabled={isRunning} onClick={() => onUpdateConfig('salles', { formato: v })}
                className={`px-2 py-1 rounded-md text-[9px] font-mono border transition-all text-left disabled:opacity-50 ${
                  agentConfig.salles.formato === v
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                }`}>{v}</button>
            ))}
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">gate espelho pedro</p>
          <div className="flex flex-col gap-1 mb-3">
            {(['off', 'auto', 'manual'] as const).map(v => (
              <button key={v} disabled={isRunning} onClick={() => onUpdateConfig('salles', { gate_espelho: v })}
                className={`px-2 py-1 rounded-md text-[9px] font-mono border transition-all text-left disabled:opacity-50 ${
                  agentConfig.salles.gate_espelho === v
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                }`}>
                {v === 'off' ? 'off — sem gate' : v === 'auto' ? 'auto — bloqueia se 🔴' : 'manual — sempre pede OK'}
              </button>
            ))}
          </div>
          <button disabled={isRunning}
            onClick={() => onUpdateConfig('salles', { alternativas: agentConfig.salles.alternativas === 3 ? 0 : 3 })}
            className="flex items-center gap-2 disabled:opacity-50">
            <div className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${
              agentConfig.salles.alternativas === 3 ? 'bg-stone-900' : 'bg-stone-200'
            }`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                agentConfig.salles.alternativas === 3 ? 'translate-x-3.5' : 'translate-x-0.5'
              }`} />
            </div>
            <span className="text-[9px] font-mono text-stone-500">3 variantes A/B</span>
          </button>
        </div>

        {/* Sônia */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.sonia?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Sônia</span>
          </div>
          <div className="flex flex-col gap-2">
            {([
              { label: 'busca web', key: 'com_busca' as const },
              { label: 'tendências', key: 'usar_tendencias' as const },
            ]).map(({ label, key }) => (
              <button key={key} disabled={isRunning} onClick={() => onUpdateConfig('sonia', { [key]: !agentConfig.sonia[key] })}
                className="flex items-center gap-2 disabled:opacity-50">
                <div className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                  agentConfig.sonia[key] ? 'bg-stone-900' : 'bg-stone-200'
                }`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    agentConfig.sonia[key] ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-[9px] font-mono text-stone-500">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custo-cap */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Custo-cap</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">limite USD por sessão</p>
          <div className="flex gap-1 items-center">
            <input
              type="number"
              min="0"
              step="0.10"
              placeholder="sem limite"
              value={custoCap ?? ''}
              disabled={isRunning}
              onChange={e => {
                const v = parseFloat(e.target.value)
                onSetCustoCap(isNaN(v) || v <= 0 ? null : v)
              }}
              className="flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-[9px] font-mono text-stone-700
                placeholder:text-stone-300 focus:outline-none focus:border-stone-400 disabled:opacity-50 min-w-0"
            />
            {custoCap !== null && (
              <button onClick={() => onSetCustoCap(null)} disabled={isRunning}
                className="text-stone-400 hover:text-stone-700 transition-colors text-[10px] flex-shrink-0 disabled:opacity-50">×</button>
            )}
          </div>
          {custoCap !== null && (
            <p className="text-[8px] font-mono text-emerald-600 mt-1">cap: ${custoCap.toFixed(2)}</p>
          )}
        </div>
      </div>
    </div>
  )
}
