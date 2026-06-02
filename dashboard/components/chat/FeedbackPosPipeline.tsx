'use client'
/**
 * PROD-4 — Feedback loop pós-Aya.
 *
 * Quando pipeline termina, pergunta "Ficou bom?" com 4 reações.
 * Cada clique grava feedback no backend (`/historico/{id}/feedback`)
 * e fecha o card. Sem isso, sistema não aprende com sinal qualitativo.
 *
 * Cliente leigo entende em 1s: emojis + 1 palavra.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '@/lib/api'
import { notify } from '@/lib/toast'

interface Props {
  sessionId: string | null
  isVisible: boolean
}

type Reacao = 'love' | 'ajustar' | 'refazer' | 'otimo'

const REACOES: Array<{ id: Reacao; emoji: string; label: string; cor: string }> = [
  { id: 'love',    emoji: '🔥', label: 'Show love',     cor: 'bg-rose-500' },
  { id: 'otimo',   emoji: '✅', label: 'Já tá ótimo',    cor: 'bg-emerald-500' },
  { id: 'ajustar', emoji: '✏️', label: 'Quero ajustar', cor: 'bg-amber-500' },
  { id: 'refazer', emoji: '🔄', label: 'Refazer',        cor: 'bg-stone-500' },
]

export function FeedbackPosPipeline({ sessionId, isVisible }: Props) {
  const [enviado, setEnviado] = useState(false)
  const [escolhido, setEscolhido] = useState<Reacao | null>(null)

  const reagir = async (r: Reacao) => {
    setEscolhido(r)
    if (!sessionId) return
    try {
      await fetch(`${API_URL}/historico/${sessionId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reacao: r, timestamp: Date.now() }),
      })
      setTimeout(() => setEnviado(true), 1200)
      const msg = r === 'love' ? '🔥 Obrigado pelo feedback!' :
                  r === 'otimo' ? '✅ Show!' :
                  r === 'ajustar' ? '✏️ Bora ajustar — diz o que quer mudar' :
                  '🔄 OK, vamos refazer'
      notify.success(msg)
    } catch {
      // Best-effort — não bloqueia UI se /feedback não existir ainda
      setTimeout(() => setEnviado(true), 1200)
    }
  }

  return (
    <AnimatePresence>
      {isVisible && !enviado && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mx-4 my-2 px-4 py-3 rounded-2xl border-2 border-emerald-200/60 dark:border-emerald-800/40 bg-gradient-to-br from-white to-emerald-50/40 dark:from-stone-900 dark:to-emerald-950/20"
        >
          <p className="text-sm font-display font-semibold text-stone-800 dark:text-stone-100 mb-3">
            E aí, ficou bom?
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {REACOES.map(r => (
              <button
                key={r.id}
                onClick={() => reagir(r.id)}
                disabled={escolhido !== null}
                className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl border transition-all active:scale-[0.97] ${
                  escolhido === r.id
                    ? `${r.cor} text-white border-transparent`
                    : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-400 dark:hover:border-stone-500 disabled:opacity-40'
                }`}
              >
                <span className="text-lg">{r.emoji}</span>
                <span className="text-[10px] font-mono uppercase tracking-widest">
                  {r.label}
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
