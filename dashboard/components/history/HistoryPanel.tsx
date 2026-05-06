'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, type DragControls } from 'framer-motion'
import { type HistoryItem, type HistoryDetail } from '@/lib/useHistory'
import { SessionList } from './SessionCard'
import { FilterBar, applyFilter, DEFAULT_FILTER, type FilterState } from './FilterBar'
import { SessionDetail } from './SessionDetail'

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
  onRemix?: (detail: HistoryDetail) => void
}

export default function HistoryPanel({
  sessions, selected, loading, loadingDetail,
  dragControls, onOpen, onSelectSession, onClearSelected, onClose, onResume, onRemix,
}: Props) {
  const [panelSize, setPanelSize] = useState(() => ({
    w: 760,
    h: typeof window !== 'undefined' ? Math.min(window.innerHeight - 120, 600) : 560,
  }))
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const filteredSessions = applyFilter(sessions, filter)
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
          <span className="text-[9px] font-mono text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">
            {filteredSessions.length}{filteredSessions.length !== sessions.length ? `/${sessions.length}` : ''}
          </span>
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
            <FilterBar filter={filter} onChange={patch => setFilter(f => ({ ...f, ...patch }))} sessions={sessions} />
            <SessionList
              sessions={filteredSessions}
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
              onRemix={onRemix}
            />
          </div>
        </div>
      )}
    </motion.div>
  )
}
