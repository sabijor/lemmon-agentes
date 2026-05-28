'use client'
/**
 * T158 — Menu de exportação granular.
 *
 * Substitui os botões "↓ Dossiê" / "↓ Editorial" antigos. Cliente marca
 * checkboxes (Estratégia, Roteiros, Cronograma, Resumo, Dossiê completo)
 * e gera UM PDF combinado com as seções escolhidas.
 *
 * Opções disponíveis dependem dos agentes que rodaram na sessão:
 * - Estratégia → otto
 * - Roteiros → salles
 * - Cronograma → renata
 * - Dossiê completo → aya (single)
 * - Resumo executivo → aya (modo='resumo', Haiku faz 1-page; custa ~$0.05 extra)
 */
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { API_URL } from '@/lib/api'
import { notify } from '@/lib/toast'

interface ExportResult {
  html_gerado: boolean
  pdf_gerado: boolean
  erros: string[]
  slug?: string
  custo_usd?: number | null
}

interface Props {
  sessionId: string | null
  respostas: Record<string, string>  // pra saber quais agentes têm output
  /** Posicionamento: 'top' alinha popover acima, 'bottom' abaixo (default). */
  align?: 'top' | 'bottom'
}

interface OpcaoExport {
  id: string
  label: string
  hint: string
  agentes: string[]
  modo?: 'completo' | 'resumo'
  custoExtra?: string  // legenda visual ex: '+$0.05'
}

const OPCOES: OpcaoExport[] = [
  { id: 'estrategia', label: '🧠 Estratégia',         hint: 'Tese, conceito, mecanismo — output do Otto',                agentes: ['otto'] },
  { id: 'roteiros',   label: '🎬 Roteiros',           hint: 'Roteiros filmáveis com hooks e CTAs — output do Salles',     agentes: ['salles'] },
  { id: 'cronograma', label: '📅 Cronograma',         hint: 'Calendário editorial multi-plataforma — output da Renata',   agentes: ['renata'] },
  { id: 'compliance', label: '🛡️ Compliance',         hint: 'Riscos Meta + recomendações — output do Heitor',              agentes: ['heitor'] },
  { id: 'performance', label: '📈 Performance',       hint: 'Otimização para retenção e CTR — output da Sônia',           agentes: ['sonia'] },
  { id: 'dossie',     label: '📋 Dossiê completo',    hint: 'Tudo da sessão num PDF — output da Aya',                     agentes: ['aya'] },
  { id: 'resumo',     label: '⚡ Resumo executivo',    hint: 'Aya resumida em ~1 página (gera novo via Haiku)',            agentes: ['aya'], modo: 'resumo', custoExtra: '+$0.05' },
]

export default function ExportMenu({ sessionId, respostas, align = 'bottom' }: Props) {
  const [open, setOpen] = useState(false)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [resultados, setResultados] = useState<Array<{ slug: string; tipo: 'html' | 'pdf' }>>([])
  const ref = useRef<HTMLDivElement>(null)

  // Fechar ao clicar fora
  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickAway)
    return () => document.removeEventListener('mousedown', onClickAway)
  }, [open])

  // Filtra opções pelo que tem output real
  const opcoesDisponiveis = OPCOES.filter(o =>
    o.agentes.every(ag => (respostas?.[ag] || '').trim().length > 0)
  )

  const toggle = (id: string) => {
    setMarcados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const exportar = async () => {
    if (!sessionId) {
      notify.warning('Sessão ainda não foi salva.')
      return
    }
    if (marcados.size === 0) {
      notify.warning('Selecione pelo menos uma opção pra exportar.')
      return
    }
    setLoading(true)
    setResultados([])
    try {
      // Cada opção gera UM pdf separado. Se tiver "resumo" + outras, são chamadas separadas
      // (resumo usa modo=resumo do Haiku; demais combinam num único PDF).
      const opcoesEscolhidas = OPCOES.filter(o => marcados.has(o.id))
      const isResumoSelecionado = opcoesEscolhidas.some(o => o.modo === 'resumo')
      const outras = opcoesEscolhidas.filter(o => o.modo !== 'resumo')
      const agentesCombinados = Array.from(new Set(outras.flatMap(o => o.agentes)))

      const novos: typeof resultados = []

      if (agentesCombinados.length > 0) {
        const r = await postExport({ session_id: sessionId, agentes: agentesCombinados })
        if (r.pdf_gerado && r.slug) novos.push({ slug: r.slug, tipo: 'pdf' })
        if (r.erros?.length) notify.warning(`Avisos: ${r.erros.join(' · ')}`)
      }

      if (isResumoSelecionado) {
        const r = await postExport({ session_id: sessionId, agente: 'aya', modo: 'resumo' })
        if (r.pdf_gerado && r.slug) novos.push({ slug: r.slug, tipo: 'pdf' })
      }

      setResultados(novos)
      if (novos.length === 0) {
        notify.error('Nenhum PDF foi gerado.')
      } else {
        notify.success(`${novos.length} PDF${novos.length > 1 ? 's' : ''} pronto${novos.length > 1 ? 's' : ''} pra download.`)
      }
    } catch (e: any) {
      notify.error(`Erro ao exportar: ${e?.message ?? 'desconhecido'}`)
    } finally {
      setLoading(false)
    }
  }

  const download = (slug: string, tipo: 'html' | 'pdf') => {
    if (!sessionId) return
    const a = document.createElement('a')
    a.href = `${API_URL}/download/${sessionId}/${tipo}?slug=${encodeURIComponent(slug)}`
    a.download = `lemmon_${slug}_${sessionId}.${tipo}`
    a.click()
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={!sessionId}
        className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-[9px] font-mono text-stone-600 dark:text-stone-300 hover:border-stone-400 dark:hover:border-stone-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ↓ Exportar {open ? '▴' : '▾'}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: align === 'top' ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: align === 'top' ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className={`absolute right-0 z-50 ${align === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl w-72 p-3`}
          >
            <p className="text-[10px] font-mono uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-2">
              O que exportar?
            </p>

            {opcoesDisponiveis.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-stone-400 italic py-2">
                Nenhum agente desta sessão tem output exportável.
              </p>
            ) : (
              <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto">
                {opcoesDisponiveis.map(o => (
                  <label key={o.id}
                    className="flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={marcados.has(o.id)}
                      onChange={() => toggle(o.id)}
                      className="mt-0.5 accent-emerald-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-stone-800 dark:text-stone-100">{o.label}</span>
                        {o.custoExtra && (
                          <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400">{o.custoExtra}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-snug">{o.hint}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <button
              onClick={exportar}
              disabled={loading || marcados.size === 0 || opcoesDisponiveis.length === 0}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-mono text-[10px] uppercase tracking-widest px-3 py-2 rounded-lg transition-colors"
            >
              {loading ? 'Gerando...' : `Gerar PDF${marcados.size > 1 ? ` (${marcados.size})` : ''}`}
            </button>

            {resultados.length > 0 && (
              <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-700 space-y-1.5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  ✓ Pronto
                </p>
                {resultados.map(r => (
                  <button
                    key={r.slug}
                    onClick={() => download(r.slug, r.tipo)}
                    className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                  >
                    <span className="text-xs text-stone-700 dark:text-stone-200 truncate">
                      {OPCOES.find(o => (o.modo === 'resumo' ? 'resumo' : o.agentes.join('+')) === r.slug)?.label || r.slug}
                    </span>
                    <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 flex-shrink-0">↓ {r.tipo.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

async function postExport(body: Record<string, unknown>): Promise<ExportResult> {
  const res = await fetch(`${API_URL}/exportar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail || `Erro HTTP ${res.status}`)
  }
  return res.json() as Promise<ExportResult>
}
