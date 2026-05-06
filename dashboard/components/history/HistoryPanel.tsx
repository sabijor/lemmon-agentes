'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, type DragControls } from 'framer-motion'
import { AGENT_MAP } from '@/lib/agents'
import { type HistoryItem, type HistoryDetail } from '@/lib/useHistory'
import { API_URL } from '@/lib/api'
import CharacterSprite from '../office/CharacterSprite'

const HEADER_H = 52

interface Props {
  sessions: HistoryItem[]
  selected: HistoryDetail | null
  loading: boolean
  loadingDetail: boolean
  dragControls: DragControls
  onOpen: () => void
  onSelectSession: (id: string) => void
  onClearSelected: () => void
  onClose: () => void
  onResume: (detail: HistoryDetail) => void
}

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

function Stars({ n }: { n: number | null }) {
  if (n === null) return <span className="text-[9px] font-mono text-stone-300">—</span>
  return (
    <span className="text-[10px]">
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= n ? '#f59e0b' : '#d6d3d1' }}>★</span>
      ))}
    </span>
  )
}

function SessionList({ sessions, loading, selectedId, onSelect }: {
  sessions: HistoryItem[]
  loading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="flex gap-0.5">
        {[0,1,2].map(i => <div key={i} className="w-1 h-1 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}
      </div>
    </div>
  )

  if (sessions.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <span className="text-2xl">🗂</span>
      <p className="text-[10px] font-mono text-stone-400 uppercase tracking-widest leading-relaxed">
        Nenhuma sessão<br />salva ainda
      </p>
    </div>
  )

  return (
    <>
      {sessions.map(s => {
        const active = s.session_id === selectedId
        return (
          <button key={s.session_id} onClick={() => onSelect(s.session_id)}
            className={`w-full text-left px-4 py-3 border-b border-stone-100 transition-colors
              ${active ? 'bg-stone-900' : 'hover:bg-stone-50'}`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              {s.origem === 'reuniao' && (
                <span className={`text-[7px] font-mono px-1 py-0.5 rounded-full border ${
                  active ? 'bg-white/10 border-white/20 text-white/60' : 'bg-violet-50 border-violet-200 text-violet-500'
                }`}>reunião</span>
              )}
            </div>
            <p className={`text-[10px] font-mono font-bold leading-snug line-clamp-2 mb-1.5
              ${active ? 'text-white' : 'text-stone-700'}`}>
              {s.briefing || '(sem briefing)'}
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[8px] font-mono text-stone-400">
                {s.timestamp ? fmt(s.timestamp) : '—'}
              </span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {s.custo_total_usd > 0 && (
                  <span className="text-[8px] font-mono text-stone-400">
                    ${s.custo_total_usd.toFixed(4)}
                  </span>
                )}
                <Stars n={s.avaliacao} />
              </div>
            </div>
            <div className="flex gap-1 mt-1.5">
              {s.agentes_usados.map(a => {
                const ag = AGENT_MAP[a as keyof typeof AGENT_MAP]
                if (!ag) return null
                return (
                  <span key={a} className="text-[7px] font-mono px-1.5 py-0.5 rounded-full"
                    style={{ background: active ? 'rgba(255,255,255,0.15)' : ag.colorDim, color: active ? 'white' : ag.color }}>
                    {ag.name}
                  </span>
                )
              })}
            </div>
          </button>
        )
      })}
    </>
  )
}

function SessionDetail({ detail, loadingDetail, bodyH, onBack, onResume }: {
  detail: HistoryDetail | null
  loadingDetail: boolean
  bodyH: number
  onBack: () => void
  onResume: (detail: HistoryDetail) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [briefingExpanded, setBriefingExpanded] = useState(false)
  const [exemplaresMarked, setExemplaresMarked] = useState<Record<string, boolean>>({})

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
  }, [detail?.session_id])

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
            <Stars n={detail.avaliacao} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!isReuniao && (
            <button
              onClick={() => onResume(detail)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-900 text-white text-[9px] font-mono uppercase tracking-widest hover:bg-stone-700 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Retomar
            </button>
          )}
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
                    {detail.avaliacao === 5 && (
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

export default function HistoryPanel({
  sessions, selected, loading, loadingDetail,
  dragControls, onOpen, onSelectSession, onClearSelected, onClose, onResume,
}: Props) {
  const [panelSize, setPanelSize] = useState(() => ({
    w: 760,
    h: typeof window !== 'undefined' ? Math.min(window.innerHeight - 120, 600) : 560,
  }))
  const [minimized, setMinimized] = useState(false)
  const panelSizeRef = useRef(panelSize)
  useEffect(() => { panelSizeRef.current = panelSize }, [panelSize])

  const resizeHandlers = useRef<{ move: ((e: PointerEvent) => void) | null; end: (() => void) | null }>({ move: null, end: null })

  const startResize = (e: React.PointerEvent, edge: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const { w: startW, h: startH } = panelSizeRef.current
    resizeHandlers.current.move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      setPanelSize({
        w: edge.includes('e') ? Math.min(Math.max(500, startW + dx), window.innerWidth - 40)
          : edge.includes('w') ? Math.min(Math.max(500, startW - dx), window.innerWidth - 40)
          : startW,
        h: edge.includes('s') ? Math.min(Math.max(300, startH + dy), window.innerHeight - 80) : startH,
      })
    }
    resizeHandlers.current.end = () => {
      if (resizeHandlers.current.move) window.removeEventListener('pointermove', resizeHandlers.current.move)
      if (resizeHandlers.current.end) window.removeEventListener('pointerup', resizeHandlers.current.end)
      resizeHandlers.current = { move: null, end: null }
    }
    window.addEventListener('pointermove', resizeHandlers.current.move)
    window.addEventListener('pointerup', resizeHandlers.current.end)
  }

  useEffect(() => { onOpen() }, [onOpen])

  const bodyH = panelSize.h - HEADER_H

  return (
    <motion.div
      animate={{ width: panelSize.w, height: minimized ? HEADER_H : panelSize.h }}
      transition={{ type: 'spring', stiffness: 200, damping: 30 }}
      className="flex flex-col glass border border-stone-200/60 rounded-2xl overflow-hidden relative"
    >
      {/* Resize handles */}
      {!minimized && <>
        <div className="absolute left-0 top-6 bottom-6 w-1.5 cursor-ew-resize z-50 hover:bg-stone-300/40 rounded-full transition-colors" onPointerDown={e => startResize(e, 'w')} />
        <div className="absolute right-0 top-6 bottom-6 w-1.5 cursor-ew-resize z-50 hover:bg-stone-300/40 rounded-full transition-colors" onPointerDown={e => startResize(e, 'e')} />
        <div className="absolute bottom-0 left-6 right-6 h-1.5 cursor-ns-resize z-50 hover:bg-stone-300/40 rounded-full transition-colors" onPointerDown={e => startResize(e, 's')} />
        <div className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-50 flex items-end justify-end p-1" onPointerDown={e => startResize(e, 'se')}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <line x1="8" y1="1" x2="1" y2="8" stroke="#a8a29e" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="8" y1="4" x2="4" y2="8" stroke="#a8a29e" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
      </>}

      {/* Header — drag handle */}
      <div
        style={{ height: HEADER_H, flexShrink: 0 }}
        className="flex items-center justify-between px-4 border-b border-stone-200/50 cursor-grab active:cursor-grabbing select-none"
        onPointerDown={e => dragControls.start(e)}
      >
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-700">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <span className="font-display font-semibold text-sm tracking-tight">Histórico</span>
          <span className="text-[9px] font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">{sessions.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMinimized(v => !v)}
            className="w-7 h-7 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 transition-all font-mono text-stone-500 text-sm font-bold">
            {minimized ? '+' : '−'}
          </button>
          <button onClick={onClose}
            className="w-7 h-7 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Body — explicit pixel heights so scroll works */}
      {!minimized && (
        <div style={{ height: bodyH, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          {/* Session list */}
          <div style={{ width: 256, height: bodyH, overflowY: 'auto', flexShrink: 0, borderRight: '1px solid #e7e5e480' }}>
            <SessionList
              sessions={sessions}
              loading={loading}
              selectedId={selected?.session_id ?? null}
              onSelect={onSelectSession}
            />
          </div>

          {/* Detail */}
          <div style={{ flex: 1, height: bodyH, overflow: 'hidden' }}>
            <SessionDetail
              detail={selected}
              loadingDetail={loadingDetail}
              bodyH={bodyH}
              onBack={onClearSelected}
              onResume={onResume}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}
