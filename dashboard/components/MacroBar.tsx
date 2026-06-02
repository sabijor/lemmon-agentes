'use client'
import { AnimatePresence, motion } from 'framer-motion'
import { AGENT_MAP, type AgentId } from '@/lib/agents'
import type { AgentStatus } from '@/lib/useChat'

const STATUS_ICON: Record<AgentStatus, string> = {
  idle: '⏱',
  thinking: '▶',
  speaking: '▶',
  done: '✓',
  error: '✕',
}

interface Props {
  activeAgentIds: AgentId[]
  agentStatus: Record<AgentId, AgentStatus>
  agentProgress: Record<string, number>
  isVisible: boolean
}

export function MacroBar({ activeAgentIds, agentStatus, agentProgress, isVisible }: Props) {
  return (
    <AnimatePresence>
      {isVisible && activeAgentIds.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="px-4 py-2 border-b border-stone-100 dark:border-stone-800 bg-stone-50/60 dark:bg-stone-900/60 flex items-center gap-3 flex-wrap flex-shrink-0"
        >
          {activeAgentIds.map(id => {
            const agent = AGENT_MAP[id]
            const status = agentStatus[id]
            const pct = agentProgress[id] ?? 0
            const isActive = status === 'thinking' || status === 'speaking'

            return (
              <motion.div
                key={id}
                className="flex flex-col items-center gap-0.5 min-w-[44px] relative"
                title={agent.title}
                animate={isActive ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                transition={isActive ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
              >
                {/* Glow no agente ativo */}
                {isActive && (
                  <motion.div
                    className="absolute inset-0 -m-1 rounded-lg blur-md -z-10"
                    style={{ background: agent.color, opacity: 0.25 }}
                    animate={{ opacity: [0.15, 0.35, 0.15] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
                <span className="text-[8px] font-mono font-bold uppercase tracking-widest"
                  style={{ color: agent.color }}>
                  {agent.name}
                </span>
                {/* T190.B10 — cargo abaixo do nome pra cliente saber o que cada um faz */}
                <span className="text-[7px] font-mono text-stone-500 dark:text-stone-400 leading-tight truncate max-w-[60px]">
                  {agent.title}
                </span>
                <span className={`text-[10px] transition-colors ${
                  status === 'done' ? 'text-green-500' :
                  status === 'error' ? 'text-red-500' :
                  isActive ? 'text-stone-700 dark:text-stone-100' : 'text-stone-300 dark:text-stone-600'
                }`}>
                  {STATUS_ICON[status]}
                </span>
                {isActive && (
                  <div className="w-8 h-0.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: agent.color }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.2, ease: 'linear' }}
                    />
                  </div>
                )}
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
