'use client'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AGENT_MAP } from '@/lib/agents'
import { type HistoryDetail } from '@/lib/useHistory'
import { API_URL } from '@/lib/api'
import CharacterSprite from '../office/CharacterSprite'
import { favoritarSessao } from '@/lib/api-client'
import { notify } from '@/lib/toast'

interface ExportResult {
  html_gerado: boolean
  pdf_gerado: boolean
  erros: string[]
}

const EXPORTAVEIS = ['aya', 'renata'] as const
type ExportAgente = typeof EXPORTAVEIS[number]

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

interface SessionDetailProps {
  detail: HistoryDetail | null
  loadingDetail: boolean
  bodyH: number
  onBack: () => void
  onResume: (detail: HistoryDetail) => void
  onRemix?: (detail: HistoryDetail) => void
}

export function SessionDetail({
  detail, loadingDetail, bodyH, onBack, onResume, onRemix,
}: SessionDetailProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [briefingExpanded, setBriefingExpanded] = useState(false)
  const [exemplaresMarked, setExemplaresMarked] = useState<Record<string, boolean>>({})
  const [exportStates, setExportStates] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [exportResults, setExportResults] = useState<Record<string, ExportResult | null>>({})
  const [favoritado, setFavoritado] = useState(false)

  const handleExportar = async (agente: ExportAgente) => {
    if (!detail) return
    setExportStates(prev => ({ ...prev, [agente]: 'loading' }))
    try {
      const res = await fetch(`${API_URL}/exportar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: detail.session_id, agente }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Erro' }))
        throw new Error((err as { detail?: string }).detail ?? 'Erro ao exportar')
      }
      const r: ExportResult = await res.json()
      setExportResults(prev => ({ ...prev, [agente]: r }))
      setExportStates(prev => ({ ...prev, [agente]: r.html_gerado || r.pdf_gerado ? 'done' : 'error' }))
      // T157: se backend retornou erros internos, mostra pro usuário em vez de silenciar
      if (r.erros && r.erros.length > 0) {
        notify.warning(`Exportar com avisos: ${r.erros.join(' · ')}`)
      }
    } catch (e: any) {
      // T157: mostra a mensagem real do backend em vez de "Falha ao exportar" genérico
      const msg = e?.message ?? 'Erro desconhecido ao exportar'
      notify.error(`Não consegui exportar ${agente}: ${msg}`)
      setExportStates(prev => ({ ...prev, [agente]: 'error' }))
    }
  }

  const handleDownload = (tipo: 'html' | 'pdf', agente: ExportAgente) => {
    if (!detail) return
    const a = document.createElement('a')
    a.href = `${API_URL}/download/${detail.session_id}/${tipo}?agente=${agente}`
    a.download = `${detail.session_id}_${agente}.${tipo}`
    a.click()
  }

  const marcarExemplar = async (agentId: string, trecho: string) => {
    if (!detail) return
    const key = `${detail.session_id}-${agentId}`
    try {
      await fetch(`${API_URL}/exemplares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agente: agentId,
          trecho,
          contexto: detail.briefing?.slice(0, 200) ?? '',
          session_id: detail.session_id,
        }),
      })
      setExemplaresMarked(prev => ({ ...prev, [key]: true }))
    } catch {}
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [detail])

  useEffect(() => {
    setBriefingExpanded(false)
    setExportStates({})
    setExportResults({})
    setFavoritado(detail?.favorito ?? false)
  }, [detail?.session_id, detail?.favorito])

  const handleFavoritar = async () => {
    if (!detail) return
    const next = !favoritado
    setFavoritado(next)
    try {
      await favoritarSessao(detail.session_id, next)
    } catch {
      setFavoritado(!next)
    }
  }

  if (loadingDetail) return (
    <div style={{ height: bodyH }} className="flex items-center justify-center">
      <div className="flex gap-0.5">
        {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}
      </div>
    </div>
  )

  if (!detail) return (
    <div style={{ height: bodyH }} className="flex flex-col items-center justify-center gap-2 px-8 text-center">
      <span className="text-3xl">←</span>
      <p className="text-[10px] font-mono text-stone-400 uppercase tracking-widest leading-relaxed">
        Selecione uma sessão<br />para ver o conteúdo
      </p>
    </div>
  )

  const isReuniao = detail.origem === 'reuniao'
  const orderedAgents = detail.agentes_usados.filter(a => detail.respostas[a])

  return (
    <div style={{ height: bodyH, display: 'flex', flexDirection: 'column' }}>
      {/* Detail header */}
      <div className="px-4 py-3 border-b border-stone-200/50 flex items-start justify-between gap-3" style={{ flexShrink: 0 }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">
              {isReuniao ? 'Reunião' : 'Briefing'}
            </p>
            {isReuniao && (
              <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-600">
                conversacional
              </span>
            )}
          </div>
          <div style={briefingExpanded ? { maxHeight: 120, overflowY: 'auto' } : undefined}>
            <p className={`text-xs font-mono text-stone-700 leading-relaxed ${briefingExpanded ? '' : 'line-clamp-2'}`}>
              {detail.briefing}
            </p>
          </div>
          <button
            onClick={() => setBriefingExpanded(v => !v)}
            className="text-[8px] font-mono text-stone-400 hover:text-stone-600 mt-0.5 transition-colors"
          >
            {briefingExpanded ? '▲ ver menos' : '▼ ver mais'}
          </button>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[8px] font-mono text-stone-400">{detail.timestamp ? fmt(detail.timestamp) : ''}</span>
            {detail.custo_total_usd > 0 && (
              <span className="text-[8px] font-mono text-stone-400">Total: ${detail.custo_total_usd.toFixed(5)}</span>
            )}
            <button
              onClick={handleFavoritar}
              title={favoritado ? 'Remover dos favoritos' : 'Marcar como favorita'}
              className="text-sm transition-transform hover:scale-110 active:scale-95"
            >
              <span style={{ color: favoritado ? '#f59e0b' : '#d6d3d1' }}>{favoritado ? '★' : '☆'}</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isReuniao && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onResume(detail)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-[9px] font-mono uppercase tracking-widest hover:bg-stone-700 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Retomar
              </button>
              {onRemix && (
                <button
                  onClick={() => onRemix(detail)}
                  title="Remix: carrega sessão com Salles+Sônia+Aya pré-selecionados — ideal para reutilizar tese com novo formato/cliente"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-100 border border-violet-200 text-violet-700 text-[9px] font-mono uppercase tracking-widest hover:bg-violet-200 transition-colors"
                >
                  🔀 Remix
                </button>
              )}
            </div>
          )}

          {/* Export — Aya e Renata */}
          {EXPORTAVEIS.filter(ag => detail.respostas[ag]).map(ag => {
            const st = exportStates[ag] ?? 'idle'
            const res = exportResults[ag]
            const label = ag === 'aya' ? 'Dossiê' : 'Editorial'
            return (
              <div key={ag} className="flex items-center gap-0.5">
                {st === 'idle' && (
                  <button onClick={() => handleExportar(ag)}
                    className="px-2 py-1 rounded-lg border border-stone-200 bg-white text-[8px] font-mono text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-all">
                    ↓ {label}
                  </button>
                )}
                {st === 'loading' && (
                  <span className="text-[8px] font-mono text-stone-400 px-1">gerando...</span>
                )}
                {st === 'error' && (
                  <button onClick={() => handleExportar(ag)}
                    className="px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-[8px] font-mono text-red-500 hover:bg-red-100 transition-all">
                    ↺ {label}
                  </button>
                )}
                {st === 'done' && res && (
                  <>
                    {res.html_gerado && (
                      <button onClick={() => handleDownload('html', ag)}
                        className="px-2 py-1 rounded-lg border border-stone-200 bg-white text-[8px] font-mono text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-all">
                        html
                      </button>
                    )}
                    {res.pdf_gerado && (
                      <button onClick={() => handleDownload('pdf', ag)}
                        className="px-2 py-1 rounded-lg border border-stone-200 bg-white text-[8px] font-mono text-stone-500 hover:border-stone-400 hover:text-stone-700 transition-all">
                        pdf
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
          <button onClick={onBack}
            className="w-7 h-7 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable messages */}
      <div style={{ flex: 1, overflowY: 'auto' }}
        className="px-4 py-4 space-y-4">

        {/* Reunião: exibe histórico completo como chat */}
        {isReuniao && detail.historico ? (
          detail.historico.map((entry, i) => {
            if (entry.role === 'user') {
              return (
                <div key={i} className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 pr-1">
                    <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">Você</span>
                    <div className="w-5 h-5 rounded-full bg-stone-900 flex items-center justify-center">
                      <span className="text-white text-[8px] font-bold">V</span>
                    </div>
                  </div>
                  <div className="max-w-[88%] bg-stone-900 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
                    <p className="text-sm font-mono leading-relaxed text-stone-100 whitespace-pre-wrap">{entry.content}</p>
                  </div>
                </div>
              )
            }
            const agent = AGENT_MAP[entry.role as keyof typeof AGENT_MAP]
            if (!agent) return null
            return (
              <div key={i} className="flex gap-2.5 items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center border"
                  style={{ background: agent.colorDim, borderColor: `${agent.color}30` }}>
                  <CharacterSprite id={agent.id} size={0.6} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-mono uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full inline-block mb-1"
                    style={{ background: agent.colorDim, color: agent.color }}>
                    {agent.name}
                  </span>
                  <div className="rounded-2xl rounded-tl-sm px-3 py-2.5 border"
                    style={{ background: agent.colorDim, borderColor: `${agent.color}20` }}>
                    <p className="text-sm font-mono leading-relaxed whitespace-pre-wrap text-stone-800">{entry.content}</p>
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          /* Pipeline: exibe resposta final de cada agente */
          orderedAgents.map(agentId => {
            const agent = AGENT_MAP[agentId as keyof typeof AGENT_MAP]
            if (!agent) return null
            const text = detail.respostas[agentId]
            const cost = detail.custos_usd?.[agentId]

            return (
              <motion.div key={agentId}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-3 items-start">
                <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center border"
                  style={{ background: agent.colorDim, borderColor: `${agent.color}30` }}>
                  <CharacterSprite id={agent.id} size={0.65} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
                      style={{ background: agent.colorDim, color: agent.color }}>
                      {agent.name}
                    </span>
                    <span className="text-[8px] font-mono text-stone-400">{agent.title}</span>
                    {cost !== undefined && cost > 0 && (
                      <span className="text-[8px] font-mono text-stone-300">${cost.toFixed(5)}</span>
                    )}
                    {(() => {
                      const dur = (detail.duracoes_segundos ?? {})[agentId]
                      if (!dur) return null
                      const slow = dur > 120
                      return (
                        <span className={`text-[8px] font-mono ${slow ? 'text-amber-500' : 'text-stone-300'}`}>
                          ⏱ {dur}s
                        </span>
                      )
                    })()}
                    {detail.favorito === true && (
                      <button
                        onClick={() => marcarExemplar(agentId, text)}
                        className={`ml-auto text-[8px] font-mono px-2 py-0.5 rounded-full border transition-all ${
                          exemplaresMarked[`${detail.session_id}-${agentId}`]
                            ? 'bg-amber-100 border-amber-300 text-amber-700 cursor-default'
                            : 'bg-white border-stone-200 text-stone-400 hover:border-amber-300 hover:text-amber-600'
                        }`}
                        disabled={!!exemplaresMarked[`${detail.session_id}-${agentId}`]}
                      >
                        {exemplaresMarked[`${detail.session_id}-${agentId}`] ? '⭐ marcado' : '☆ exemplar'}
                      </button>
                    )}
                  </div>
                  <div className="rounded-2xl rounded-tl-sm px-4 py-3 border"
                    style={{ background: agent.colorDim, borderColor: `${agent.color}20` }}>
                    <p className="text-sm font-mono leading-relaxed whitespace-pre-wrap text-stone-800">{text}</p>
                  </div>
                </div>
              </motion.div>
            )
          })
        )}

        {detail.observacoes_operador && (
          <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-[9px] font-mono text-amber-600 uppercase tracking-widest mb-1">Observações</p>
            <p className="text-xs font-mono text-amber-800">{detail.observacoes_operador}</p>
          </div>
        )}

        {detail.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {detail.tags.map(t => (
              <span key={t} className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-stone-500">
                {t}
              </span>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
