'use client'
/**
 * T147 — Modal de boas-vindas na primeira visita.
 *
 * Cliente leigo abre o sistema, vê a sala isométrica e o painel de chat sem
 * entender o que fazer. Modal aparece UMA vez, explica fluxo em 3 passos com
 * exemplo concreto, e some. Reaparece só se o usuário limpar localStorage.
 *
 * Detecção: `lemmon-onboarded` em localStorage. Se ausente → mostra modal.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const STORAGE_KEY = 'lemmon-onboarded'

interface Props {
  /** Briefing exemplo a aplicar quando usuário clicar "experimentar com exemplo". */
  onTryExample?: (briefing: string) => void
}

const EXEMPLO = 'Quero lançar uma marca de café especial no Instagram. Tenho orçamento pra 1 captação profissional por mês.'

export default function WelcomeModal({ onTryExample }: Props) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true)
    } catch {
      // localStorage indisponível — não mostra modal pra não atrapalhar
    }
  }, [])

  const close = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setOpen(false)
  }

  const tryExample = () => {
    close()
    onTryExample?.(EXEMPLO)
  }

  if (!mounted) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="bg-white dark:bg-stone-900 rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-7 border border-stone-200 dark:border-stone-700"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-xl">🤖</div>
              <div>
                <h2 className="font-display font-bold text-lg text-stone-900 dark:text-stone-100 leading-tight">
                  Bem-vindo aos Agentes de Conteúdo
                </h2>
                <p className="text-xs font-mono text-stone-500 dark:text-stone-400">
                  Lemmon Produções
                </p>
              </div>
            </div>

            <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed mb-5">
              Um time de 7 agentes de IA prontos pra trabalhar no seu conteúdo. Você descreve, eles entregam.
            </p>

            <div className="space-y-3 mb-6">
              <Step n="1" title="Descreva seu pedido" desc="Em linguagem natural, conta o que você quer (estratégia, roteiro, calendário, etc)." />
              <Step n="2" title="A IA escolhe os agentes" desc="No Modo Auto (recomendado), o sistema decide automaticamente quem precisa entrar." />
              <Step n="3" title="Cada agente entrega sua parte" desc="No final, a Aya monta um dossiê visual juntando tudo. Você baixa em PDF ou compartilha link." />
            </div>

            <div className="bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 rounded-xl p-3 mb-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-1">
                Exemplo de pedido
              </p>
              <p className="text-xs text-stone-700 dark:text-stone-300 italic leading-relaxed">
                &ldquo;{EXEMPLO}&rdquo;
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={tryExample}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-xl transition-colors"
              >
                Experimentar com esse exemplo
              </button>
              <button
                onClick={close}
                className="flex-1 sm:flex-none bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 font-mono text-xs uppercase tracking-widest px-4 py-2.5 rounded-xl transition-colors"
              >
                Vou explorar
              </button>
            </div>

            <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-4 text-center">
              Custos da Anthropic: ~$0.10 a $0.50 por sessão.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 flex items-center justify-center font-display font-bold text-sm">
        {n}
      </div>
      <div className="flex-1 pt-0.5">
        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 mb-0.5">{title}</h3>
        <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}
