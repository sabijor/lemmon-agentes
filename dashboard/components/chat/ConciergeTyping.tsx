'use client'
/**
 * Bolha "Concierge pensando..." enquanto a API processa a resposta.
 *
 * Aparece imediatamente após o user enviar uma mensagem e some quando a
 * resposta real chega. Sem isso, cliente leigo via tela parada por 3-5s e
 * pensava que travou.
 */
import { motion } from 'framer-motion'
import { AGENT_MAP } from '@/lib/agents'

export function ConciergeTyping() {
  const concierge = AGENT_MAP.concierge

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 px-1"
    >
      {/* Avatar circular Concierge */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-base shadow-md"
        style={{ background: concierge.color }}
      >
        <span className="text-white">🎯</span>
      </div>

      {/* Bolha de typing */}
      <div className="flex flex-col gap-1 max-w-[80%]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest"
            style={{ color: concierge.color }}>
            {concierge.name}
          </span>
          <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">
            pensando...
          </span>
        </div>
        <div
          className="px-4 py-3 rounded-2xl rounded-tl-sm bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center gap-2"
        >
          {/* 3 pontinhos pulsantes */}
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{ background: concierge.color }}
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.85, 1.1, 0.85],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  )
}
