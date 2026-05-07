'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { AGENT_MAP, type AgentId } from '@/lib/agents'
import type { ProgressMeta } from '@/lib/useChat'

interface Props {
  agentId: AgentId
  progress: number
  meta: ProgressMeta
  isManualLocked: boolean
  isVisible: boolean
}

export function ProgressBar({ agentId, progress, meta, isManualLocked, isVisible }: Props) {
  const agent = AGENT_MAP[agentId]
  if (!agent) return null

  const isOverloaded = meta.elapsed > meta.mediana * 1.5 && progress < 100
  const barColor = isOverloaded ? '#f59e0b' : agent.color
  const tooltipText = `Tempo médio: ${Math.round(meta.mediana)}s · decorrido: ${Math.round(meta.elapsed)}s · n=${meta.amostras} amostras`

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="ml-13 pl-[52px] mt-1 pb-1"
          title={tooltipText}
        >
          <div className="h-1 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: barColor }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.2, ease: 'linear' }}
            />
          </div>
          {isOverloaded && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="block text-[9px] font-mono text-amber-500 mt-0.5"
            >
              Mais lento que o normal
            </motion.span>
          )}
          {isManualLocked && (
            <span className="block text-[9px] font-mono text-stone-400 mt-0.5">
              🔒 Aguardando aprovação...
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
