'use client'
/**
 * Card visual de "confirmar" — substitui a bolha de texto quando o Concierge
 * propõe a equipe e espera OK do cliente.
 *
 * Antes: bolha de texto com lista em markdown.
 * Agora: avatares circulares + nome + cargo + razão + custo + 2 botões grandes.
 *
 * Cliente leigo entende em 2 segundos quem vai trabalhar, quanto vai custar,
 * e tem ação clara (OK / Editar) em vez de digitar resposta.
 */
import { motion } from 'framer-motion'
import { AGENT_MAP, type AgentId } from '@/lib/agents'
import { formatCustoBRL } from '@/lib/formatCusto'

interface Props {
  /** Mensagem livre do Concierge antes do card (ex: "Pra Reels de menopausa...") */
  mensagem: string
  agentes: AgentId[]
  razoes: Record<string, string>
  ferramentas?: string[]
  custoEstimadoUsd: number
  onApprove: () => void
  onEdit: () => void
}

const FERRAMENTA_LABELS: Record<string, string> = {
  briefing_reverso: '🔍 Briefing Reverso',
  cortes_prontos: '✂️ Cortes Prontos',
  calibragem_pedro: '🎯 Calibragem Pedro',
  transcrever: '🎤 Transcrição',
  share: '🔗 Compartilhar',
  exportar: '📄 Exportar',
}

export function ConciergeConfirmCard({
  mensagem,
  agentes,
  razoes,
  ferramentas = [],
  custoEstimadoUsd,
  onApprove,
  onEdit,
}: Props) {
  const concierge = AGENT_MAP.concierge

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex items-start gap-3 px-1"
    >
      {/* Avatar Concierge */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base shadow-md"
        style={{ background: concierge.color }}
      >
        <span className="text-white">🎯</span>
      </div>

      {/* Card de confirmação */}
      <div className="flex-1 flex flex-col gap-2 max-w-[100%]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest"
            style={{ color: concierge.color }}>
            {concierge.name}
          </span>
          <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">
            propôs uma equipe
          </span>
        </div>

        <div className="rounded-2xl rounded-tl-sm bg-gradient-to-br from-emerald-50/80 to-white dark:from-emerald-950/30 dark:to-stone-900 border-2 border-emerald-400/30 dark:border-emerald-500/30 shadow-md overflow-hidden">
          {/* Mensagem livre do Concierge */}
          {mensagem && (
            <p className="text-sm text-stone-800 dark:text-stone-100 leading-relaxed px-4 py-3 border-b border-emerald-200/40 dark:border-emerald-800/40 whitespace-pre-wrap">
              {mensagem}
            </p>
          )}

          {/* Time proposto */}
          <div className="px-4 py-3 space-y-2.5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400">
              Equipe proposta
            </p>
            <div className="space-y-2">
              {agentes.map((id, idx) => {
                const agent = AGENT_MAP[id]
                if (!agent) return null
                const razao = razoes[id] || agent.title
                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 + 0.1, duration: 0.2 }}
                    className="flex items-start gap-2.5"
                  >
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm"
                      style={{ background: agent.color }}
                    >
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-xs font-semibold text-stone-800 dark:text-stone-100">
                          {agent.name}
                        </span>
                        <span className="text-[10px] text-stone-500 dark:text-stone-400">
                          {agent.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 dark:text-stone-300 leading-snug">
                        {razao}
                      </p>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Ferramentas extras */}
            {ferramentas.length > 0 && (
              <div className="pt-2 border-t border-emerald-200/40 dark:border-emerald-800/40">
                <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1.5">
                  Ferramentas extras
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ferramentas.map(f => (
                    <span
                      key={f}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200"
                    >
                      {FERRAMENTA_LABELS[f] || f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Custo estimado */}
            {custoEstimadoUsd > 0 && (
              <div className="pt-2 border-t border-emerald-200/40 dark:border-emerald-800/40 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400">
                  Custo estimado
                </span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  {formatCustoBRL(custoEstimadoUsd)}
                </span>
              </div>
            )}
          </div>

          {/* Botões de ação */}
          <div className="grid grid-cols-2 gap-px bg-emerald-200/40 dark:bg-emerald-800/40 border-t border-emerald-200/40 dark:border-emerald-800/40">
            <button
              onClick={onEdit}
              className="px-4 py-3 bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 text-sm font-mono uppercase tracking-widest transition-colors active:scale-[0.99]"
            >
              ✏️ Editar
            </button>
            <button
              onClick={onApprove}
              className="px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold font-mono uppercase tracking-widest transition-colors shadow-inner active:scale-[0.99]"
            >
              ✅ OK, rodar
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
