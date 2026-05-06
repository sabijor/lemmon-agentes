'use client'
import { useState, useRef, useEffect } from 'react'

function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    const fmtDate = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short' })
    const update = () => setTime(`${fmtDate()} · ${fmt()}`)
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return <div className="text-[10px] font-mono text-stone-400 uppercase tracking-widest hidden lg:block">{time}</div>
}
import { motion, AnimatePresence, useMotionValue, useDragControls } from 'framer-motion'
import { AGENTS, type AgentId } from '@/lib/agents'
import { useChat, type ImageData } from '@/lib/useChat'
import { useHistory, type HistoryDetail } from '@/lib/useHistory'
import { useReuniao } from '@/lib/useReuniao'
import Link from 'next/link'
import OfficeScene from '@/components/office/OfficeScene'
import ChatPanel from '@/components/chat/ChatPanel'
import HistoryPanel from '@/components/history/HistoryPanel'

export default function Home() {
  const [inMeeting, setInMeeting] = useState<Set<AgentId>>(new Set())
  const [chatOpen, setChatOpen] = useState(true)
  const [chatMode, setChatMode] = useState<'pipeline' | 'reuniao'>('pipeline')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const { messages, agentStatus, isRunning, sessionId, avaliado, resumedFrom, manualMode, fastTrack, sandbox, awaitingApproval, agentConfig, tagsSugeridas, send, approve, abort, toggleManualMode, toggleFastTrack, toggleSandbox, updateConfig, avaliar, exportar, reset, loadSession } = useChat()
  const { messages: reunMessages, agentStatus: reunAgentStatus, isRunning: reunIsRunning, send: reunSend, reset: reunReset, abort: reunAbort, mesaRedonda: reunMesaRedonda } = useReuniao()
  const { sessions, selected, loading, loadingDetail, fetchSessions, fetchDetail, clearSelected } = useHistory()

  const dragControls = useDragControls()
  const panelX = useMotionValue(0)
  const panelY = useMotionValue(0)

  const historyDragControls = useDragControls()
  const historyPanelX = useMotionValue(0)
  const historyPanelY = useMotionValue(0)

  useEffect(() => {
    panelX.set(Math.max(0, window.innerWidth - 480))
    panelY.set(56)
  }, [panelX, panelY])

  useEffect(() => {
    historyPanelX.set(Math.max(0, (window.innerWidth - 760) / 2))
    historyPanelY.set(40)
  }, [historyPanelX, historyPanelY])

  const prevMsgLen = useRef(0)
  useEffect(() => {
    if (!chatOpen && messages.length > prevMsgLen.current) {
      setUnreadCount(c => c + messages.length - prevMsgLen.current)
    }
    prevMsgLen.current = messages.length
  }, [messages, chatOpen])

  const openChat = () => { setChatOpen(true); setUnreadCount(0) }

  const toggleAgent = (id: AgentId) => {
    setInMeeting(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const callAll = () => setInMeeting(new Set(AGENTS.map(a => a.id)))
  const exitMeeting = () => setInMeeting(new Set())
  const handleSend = (msg: string, image?: ImageData) => send(
    Array.from(inMeeting).filter(id => !AGENTS.find(a => a.id === id)?.reuniaoOnly),
    msg,
    image,
  )

  const handleResume = (detail: HistoryDetail) => {
    loadSession(detail)
    setHistoryOpen(false)
    setChatOpen(true)
    setChatMode('pipeline')
  }

  const handleRemix = (detail: HistoryDetail) => {
    loadSession(detail)
    setInMeeting(new Set(['salles', 'sonia', 'aya'] as AgentId[]))
    setHistoryOpen(false)
    setChatOpen(true)
    setChatMode('pipeline')
  }
  const handleReunSend = (agents: AgentId[], msg: string, manual?: boolean) => reunSend(agents, msg, manual)

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-stone-50">
      {/* Top nav */}
      <header className="flex-shrink-0 h-12 flex items-center justify-between px-6 glass border-b border-stone-200/60 z-50">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-stone-900 rounded-md flex items-center justify-center">
            <span className="text-white text-[10px] font-display font-bold">L</span>
          </div>
          <span className="font-display font-semibold text-sm tracking-tight">
            Lemmon<span className="font-light text-stone-500"> Agentes</span>
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex items-center gap-2">
            {AGENTS.map(agent => {
              const status = agentStatus[agent.id]
              const isIn = inMeeting.has(agent.id)
              const isGuest = !!agent.reuniaoOnly
              return (
                <motion.button
                  key={agent.id}
                  onClick={() => !isRunning && toggleAgent(agent.id)}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  title={isGuest ? `${agent.name} — convidado (só reunião)` : agent.name}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest
                    transition-all duration-200 border
                    ${isIn ? 'text-white border-transparent shadow-sm' : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'}
                    ${isGuest && !isIn ? 'border-dashed' : ''}`}
                  style={isIn ? { background: agent.color, borderColor: agent.color } : {}}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${
                    status === 'speaking' ? 'bg-yellow-400' :
                    status === 'thinking' ? 'bg-purple-400' :
                    status === 'done' ? 'bg-green-400' :
                    status === 'error' ? 'bg-red-400' :
                    isIn ? 'bg-white/60' : 'bg-stone-300'
                  }`}/>
                  {agent.name}
                  {isGuest && !isIn && <span className="text-[7px] opacity-50 ml-0.5">cliente</span>}
                </motion.button>
              )
            })}
          </div>
          <Clock />
          <Link href="/saude" title="Dashboard de Saúde"
            className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all text-stone-500">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </Link>
          <Link href="/hall-of-fame" title="Hall of Fame"
            className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all text-stone-500 text-sm">
            🏆
          </Link>
          <Link href="/briefing-reverso" title="Briefing Reverso"
            className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all text-stone-500 text-sm">
            🔍
          </Link>
          <Link href="/cortes" title="Cortes-Prontos"
            className="w-8 h-8 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all text-stone-500 text-sm">
            ✂️
          </Link>
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all
              ${historyOpen ? 'bg-stone-900 border-stone-900 text-white' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-400'}`}
            title="Histórico"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Office — always full screen */}
      <main className="flex-1 overflow-hidden">
        <OfficeScene
          inMeeting={inMeeting}
          agentStatus={agentStatus}
          onToggleAgent={toggleAgent}
          onCallAll={callAll}
          onExitMeeting={exitMeeting}
          isRunning={isRunning}
        />
      </main>

      {/* Draggable floating chat panel */}
      {chatOpen && (
        <motion.div
          drag
          dragControls={dragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          style={{ x: panelX, y: panelY, position: 'fixed', top: 48, zIndex: 40 }}
          className="shadow-2xl shadow-black/20 rounded-2xl overflow-hidden"
        >
          <ChatPanel
            mode={chatMode}
            onToggleMode={() => setChatMode(m => m === 'pipeline' ? 'reuniao' : 'pipeline')}
            messages={messages}
            agentStatus={agentStatus}
            inMeeting={inMeeting}
            isRunning={isRunning}
            sessionId={sessionId}
            avaliado={avaliado}
            resumedFrom={resumedFrom}
            manualMode={manualMode}
            fastTrack={fastTrack}
            sandbox={sandbox}
            awaitingApproval={awaitingApproval}
            agentConfig={agentConfig}
            dragControls={dragControls}
            onSend={handleSend}
            onReset={reset}
            onAvaliar={avaliar}
            onApprove={approve}
            onAbort={abort}
            onToggleManualMode={toggleManualMode}
            onToggleFastTrack={toggleFastTrack}
            onToggleSandbox={toggleSandbox}
            onUpdateConfig={updateConfig}
            reunMessages={reunMessages}
            reunAgentStatus={reunAgentStatus}
            reunIsRunning={reunIsRunning}
            onReunSend={handleReunSend}
            onReunReset={reunReset}
            onReunAbort={reunAbort}
            onMesaRedonda={reunMesaRedonda}
            onExportar={exportar}
            tagsSugeridas={tagsSugeridas}
            onClose={() => setChatOpen(false)}
          />
        </motion.div>
      )}

      {/* Draggable floating history panel */}
      {historyOpen && (
        <motion.div
          drag
          dragControls={historyDragControls}
          dragListener={false}
          dragMomentum={false}
          dragElastic={0}
          style={{ x: historyPanelX, y: historyPanelY, position: 'fixed', top: 48, zIndex: 40 }}
          className="shadow-2xl shadow-black/20 rounded-2xl overflow-hidden"
        >
          <HistoryPanel
            sessions={sessions}
            selected={selected}
            loading={loading}
            loadingDetail={loadingDetail}
            dragControls={historyDragControls}
            onOpen={fetchSessions}
            onSelectSession={fetchDetail}
            onClearSelected={clearSelected}
            onClose={() => setHistoryOpen(false)}
            onResume={handleResume}
            onRemix={handleRemix}
          />
        </motion.div>
      )}

      {/* Floating button when closed */}
      <AnimatePresence>
        {!chatOpen && (
          <motion.button
            key="chat-btn"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onClick={openChat}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-stone-900 rounded-2xl shadow-2xl shadow-stone-900/25 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
