'use client'
import { useState, useRef, useEffect } from 'react'
import { useTheme } from 'next-themes'

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-8 h-8" />
  const isDark = resolvedTheme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400"
    >
      {isDark
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  )
}

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
import { useAutoRouter } from '@/lib/useAutoRouter'
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import { notify } from '@/lib/toast'
import Link from 'next/link'
import OfficeScene from '@/components/office/OfficeScene'
import ChatPanel from '@/components/chat/ChatPanel'
import HistoryPanel from '@/components/history/HistoryPanel'

function AutoModeToggle({ autoMode, setAutoMode, disabled }: { autoMode: boolean; setAutoMode: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && setAutoMode(!autoMode)}
      disabled={disabled}
      title={autoMode ? 'Modo Auto — IA escolhe os agentes' : 'Modo Expert — você escolhe manualmente'}
      className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[10px] font-mono uppercase tracking-widest transition-all
        ${autoMode
          ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
          : 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className="text-sm leading-none">{autoMode ? '🤖' : '🔧'}</span>
      <span>{autoMode ? 'Auto' : 'Expert'}</span>
    </button>
  )
}

export default function Home() {
  const [inMeeting, setInMeeting] = useState<Set<AgentId>>(new Set())
  const [chatOpen, setChatOpen] = useState(true)
  const [chatMode, setChatMode] = useState<'pipeline' | 'reuniao'>('pipeline')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  // T139 Sprint 2 — Modo Auto (default ligado): IA escolhe os agentes ao enviar briefing.
  // Modo Expert: cliente avançado convoca manualmente (pills no header).
  const [autoMode, setAutoMode] = useLocalStorage<boolean>('lemmon-auto-mode', true)
  const { sugerir: sugerirPipeline } = useAutoRouter()
  const { messages, agentStatus, isRunning, sessionId, favoritado, resumedFrom, manualMode, fastTrack, sandbox, custoCap, custoCapAtingido, custoAviso, awaitingApproval, agentConfig, tagsSugeridas, agentProgress, agentProgressMeta, send, approve, abort, toggleManualMode, toggleFastTrack, toggleSandbox, setCustoCap, autorizarCusto, recusarCustoExtra, updateConfig, favoritar, exportar, reset, loadSession } = useChat()
  const {
    messages: reunMessages, agentStatus: reunAgentStatus, isRunning: reunIsRunning,
    agentProgress: reunAgentProgress, agentProgressMeta: reunAgentProgressMeta,
    loopMode, setLoopMode, loopMaxTurnos, setLoopMaxTurnos, loopCustoCap, setLoopCustoCap,
    loopActive, loopTurn, loopCost, loopStatus, loopStop,
    send: reunSend, reset: reunReset, abort: reunAbort, mesaRedonda: reunMesaRedonda,
  } = useReuniao()
  const { sessions, selected, loading, loadingDetail, fetchSessions, fetchDetail, clearSelected } = useHistory()

  const dragControls = useDragControls()
  const panelX = useMotionValue(0)
  const panelY = useMotionValue(0)

  const historyDragControls = useDragControls()
  const historyPanelX = useMotionValue(0)
  const historyPanelY = useMotionValue(0)

  useEffect(() => {
    const PANEL_W = 540
    const PANEL_H = 640
    const TOP_OFFSET = 48
    const clamp = (x: number, y: number) => ({
      x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - PANEL_W)),
      y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - TOP_OFFSET - PANEL_H)),
    })

    try {
      const saved = localStorage.getItem('chatPanelPos')
      if (saved) {
        const { x, y } = JSON.parse(saved) as { x: number; y: number }
        const { x: cx, y: cy } = clamp(x, y)
        panelX.set(cx)
        panelY.set(cy)
      } else {
        panelX.set(Math.max(0, window.innerWidth - 480))
        panelY.set(56)
      }
    } catch {
      panelX.set(Math.max(0, window.innerWidth - 480))
      panelY.set(56)
    }

    const onResize = () => {
      const { x, y } = clamp(panelX.get(), panelY.get())
      panelX.set(x)
      panelY.set(y)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
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

  const handleSend = async (msg: string, image?: ImageData) => {
    if (autoMode) {
      // T139 Sprint 2 — auto-roteador escolhe os agentes pela IA antes de rodar
      const sugestao = await sugerirPipeline(msg)
      if (!sugestao) {
        notify.error('Não consegui consultar o roteador. Tente de novo.')
        return
      }
      if (sugestao.agentes.length === 0) {
        notify.warning(sugestao.motivo_vazio || 'Pedido muito vago — adicione mais contexto e tente de novo.')
        return
      }
      const ids = sugestao.agentes.filter(id => !AGENTS.find(a => a.id === id)?.reuniaoOnly)
      setInMeeting(new Set(ids))
      const nomes = ids.map(id => AGENTS.find(a => a.id === id)?.name ?? id).join(' · ')
      const custoTxt = sugestao.custo_estimado_usd != null
        ? ` (~$${sugestao.custo_estimado_usd.toFixed(2)})`
        : ''
      notify.info(`🤖 IA escolheu: ${nomes}${custoTxt}`)
      send(ids, msg, image)
      return
    }
    // Modo Expert — comportamento original (cliente convocou os agentes manualmente)
    send(
      Array.from(inMeeting).filter(id => !AGENTS.find(a => a.id === id)?.reuniaoOnly),
      msg,
      image,
    )
  }

  const handleResume = (detail: HistoryDetail) => {
    loadSession(detail)
    setHistoryOpen(false)
    setChatOpen(true)
    setChatMode('pipeline')
  }

  const handleRemix = (detail: HistoryDetail) => {
    loadSession(detail)
    const activeIds = detail.agentes_usados.filter(
      id => AGENTS.find(a => a.id === id && !a.reuniaoOnly)
    ) as AgentId[]
    setInMeeting(new Set(activeIds.length ? activeIds : (['salles', 'sonia', 'aya'] as AgentId[])))
    setHistoryOpen(false)
    setChatOpen(true)
    setChatMode('pipeline')
  }
  const handleReunSend = (agents: AgentId[], msg: string, manual?: boolean) => reunSend(agents, msg, manual)

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-stone-50 dark:bg-stone-950">
      {/* Top nav */}
      <header className="flex-shrink-0 h-12 flex items-center justify-between px-6 glass border-b border-stone-200/60 dark:border-stone-800/60 z-50">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-stone-900 dark:bg-stone-100 rounded-md flex items-center justify-center">
            <span className="text-white dark:text-stone-900 text-[10px] font-display font-bold">L</span>
          </div>
          <span className="font-display font-semibold text-sm tracking-tight text-stone-900 dark:text-stone-100">
            Lemmon<span className="font-light text-stone-500 dark:text-stone-400"> Agentes</span>
          </span>
        </div>

        <div className="flex items-center gap-6">
          <div className={`hidden md:flex items-center gap-2 transition-opacity ${autoMode ? 'opacity-0 pointer-events-none w-0 overflow-hidden' : 'opacity-100'}`}>
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
                    ${isIn ? 'text-white border-transparent shadow-sm' : 'bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 border-stone-200 dark:border-stone-700 hover:border-stone-400 dark:hover:border-stone-500'}
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
          <AutoModeToggle autoMode={autoMode} setAutoMode={setAutoMode} disabled={isRunning || reunIsRunning} />
          <Clock />
          <Link href="/saude" title="Dashboard de Saúde"
            className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </Link>
          <Link href="/hall-of-fame" title="Hall of Fame"
            className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400 text-sm">
            🏆
          </Link>
          <Link href="/briefing-reverso" title="Briefing Reverso"
            className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400 text-sm">
            🔍
          </Link>
          <Link href="/cortes" title="Cortes-Prontos"
            className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400 text-sm">
            ✂️
          </Link>
          <Link href="/calibragem" title="Calibragem Pedro"
            className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400 text-sm">
            🎯
          </Link>
          <ThemeToggle />
          <button
            onClick={() => setHistoryOpen(v => !v)}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all
              ${historyOpen ? 'bg-stone-900 dark:bg-stone-100 border-stone-900 dark:border-stone-100 text-white dark:text-stone-900' : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500'}`}
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
          messages={messages}
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
          className="shadow-2xl shadow-black/20 rounded-2xl"
          onDragEnd={() => {
            const PANEL_W = 540, PANEL_H = 640, TOP_OFFSET = 48
            const x = Math.min(Math.max(0, panelX.get()), Math.max(0, window.innerWidth - PANEL_W))
            const y = Math.min(Math.max(0, panelY.get()), Math.max(0, window.innerHeight - TOP_OFFSET - PANEL_H))
            panelX.set(x); panelY.set(y)
            try { localStorage.setItem('chatPanelPos', JSON.stringify({ x, y })) } catch {}
          }}
        >
          <ChatPanel
            mode={chatMode}
            onToggleMode={() => setChatMode(m => m === 'pipeline' ? 'reuniao' : 'pipeline')}
            messages={messages}
            agentStatus={agentStatus}
            agentProgress={agentProgress}
            agentProgressMeta={agentProgressMeta}
            inMeeting={inMeeting}
            isRunning={isRunning}
            sessionId={sessionId}
            favoritado={favoritado}
            resumedFrom={resumedFrom}
            manualMode={manualMode}
            fastTrack={fastTrack}
            sandbox={sandbox}
            custoCap={custoCap}
            custoCapAtingido={custoCapAtingido}
            custoAviso={custoAviso}
            awaitingApproval={awaitingApproval}
            agentConfig={agentConfig}
            dragControls={dragControls}
            autoMode={autoMode}
            onSend={handleSend}
            onReset={reset}
            onFavoritar={favoritar}
            onApprove={approve}
            onAbort={abort}
            onToggleManualMode={toggleManualMode}
            onToggleFastTrack={toggleFastTrack}
            onToggleSandbox={toggleSandbox}
            onSetCustoCap={setCustoCap}
            onAutorizarCusto={autorizarCusto}
            onRecusarCustoExtra={recusarCustoExtra}
            onUpdateConfig={updateConfig}
            reunMessages={reunMessages}
            reunAgentStatus={reunAgentStatus}
            reunIsRunning={reunIsRunning}
            reunAgentProgress={reunAgentProgress}
            reunAgentProgressMeta={reunAgentProgressMeta}
            onReunSend={handleReunSend}
            onReunReset={reunReset}
            onReunAbort={reunAbort}
            onMesaRedonda={reunMesaRedonda}
            loopMode={loopMode}
            onSetLoopMode={setLoopMode}
            loopMaxTurnos={loopMaxTurnos}
            onSetLoopMaxTurnos={setLoopMaxTurnos}
            loopCustoCap={loopCustoCap}
            onSetLoopCustoCap={setLoopCustoCap}
            loopActive={loopActive}
            loopTurn={loopTurn}
            loopCost={loopCost}
            loopStatus={loopStatus}
            onLoopStop={loopStop}
            onExportar={exportar}
            tagsSugeridas={tagsSugeridas}
            onSetInMeeting={ids => setInMeeting(new Set(ids))}
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
