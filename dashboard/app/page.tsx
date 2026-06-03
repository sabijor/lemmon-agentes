'use client'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence, useMotionValue, useDragControls } from 'framer-motion'
// T178 (2026-05-28) — ChatPanel voltou a ser FIXO à direita. Removidos:
// useMotionValue/useDragControls do panel principal, clamp() do localStorage
// (`chatPanelPos`, `lemmon-chat-pinned`, `lemmon-chat-position`), onDragEnd.
// `motion`+`useDragControls` continuam importados porque o HistoryPanel ainda
// é arrastável e os pills do header usam motion.button.
import { AGENTS, type AgentId } from '@/lib/agents'
import { useChat, type ImageData } from '@/lib/useChat'
import { useHistory, type HistoryDetail } from '@/lib/useHistory'
import { useReuniao } from '@/lib/useReuniao'
import { useAutoRouter } from '@/lib/useAutoRouter'
import { useConcierge, type ConciergeMsg } from '@/lib/useConcierge'
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import { notify } from '@/lib/toast'
import Link from 'next/link'
import PixelOfficeScene from '@/components/office-pixel/PixelOfficeScene'
import ChatPanel from '@/components/chat/ChatPanel'
import HistoryPanel from '@/components/history/HistoryPanel'
import { ThemeToggle, Clock, AutoModeToggle, ComplianceToggle, RoomToggle, type ComplianceMode, type ActiveRoom } from '@/components/header/HeaderControls'
import WelcomeModal from '@/components/onboarding/WelcomeModal'
import { uuid } from '@/lib/uuid'

export default function Home() {
  const [inMeeting, setInMeeting] = useState<Set<AgentId>>(new Set())
  const [chatOpen, setChatOpen] = useState(true)
  const [chatMode, setChatMode] = useState<'pipeline' | 'reuniao'>('pipeline')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  // v1.47 A4a-002 — briefing pendente pra preencher input do chat (sem enviar).
  // WelcomeModal "Experimentar" agora usa isso em vez de handleSend direto.
  const [prefillBriefing, setPrefillBriefing] = useState<string | undefined>(undefined)
  // T192 — Layout SVG isométrico removido em 2026-06-01 (pedido Calebe pós-teste Pedro).
  // Mantemos só PixelOfficeScene (top-down pixel art).
  // T139 Sprint 2 — Modo Auto (default ligado): IA escolhe os agentes ao enviar briefing.
  // Modo Expert: cliente avançado convoca manualmente (pills no header).
  const [autoMode, setAutoMode] = useLocalStorage<boolean>('lemmon-auto-mode', true)
  // PROD-13 — Modo Imersivo: pixel office. Por padrão OFF (cliente leigo confunde).
  // Ativa via toggle no header (depois de 1ª sessão).
  const [imersivo, setImersivo] = useLocalStorage<boolean>('lemmon-imersivo', false)
  // T160 — Compliance mode: 'auto' (IA decide), 'sempre' (força Heitor), 'nunca' (remove Heitor).
  const [complianceMode, setComplianceMode] = useLocalStorage<ComplianceMode>('lemmon-compliance-mode', 'auto')
  // T171-T173 — sala ativa: criativo (Lemmon) ou admin (Hator). Persistida.
  const [activeRoom, setActiveRoom] = useLocalStorage<ActiveRoom>('lemmon-active-room', 'creative')
  const { sugerir: sugerirPipeline } = useAutoRouter()
  // T186.b — Concierge orquestrador: conversa pra refinar briefing antes de mobilizar equipe
  // T193.b — também precisa do `error` pra distinguir sem-crédito/auth/rate-limit
  const { conversar: conciergeConversar, error: conciergeError, loading: conciergeLoading } = useConcierge()
  // T188.i — histórico Concierge persiste em refresh (em vez de zerar via useState)
  const [conciergeHistory, setConciergeHistory] = useLocalStorage<ConciergeMsg[]>('lemmon-concierge-history', [])
  // T148 — flag pra mostrar "recomendado" no Auto Mode até 1ª sessão concluir
  const [hasCompletedFirstSession, setHasCompletedFirstSession] = useLocalStorage<boolean>('lemmon-first-session-done', false)
  const { messages, agentStatus, isRunning, sessionId, favoritado, resumedFrom, manualMode, fastTrack, sandbox, custoCap, custoCapAtingido, custoAviso, awaitingApproval, agentConfig, tagsSugeridas, agentProgress, agentProgressMeta, send, approve, abort, toggleManualMode, toggleFastTrack, toggleSandbox, setCustoCap, autorizarCusto, recusarCustoExtra, updateConfig, favoritar, exportar, reset, loadSession, setMessages } = useChat()
  const {
    messages: reunMessages, agentStatus: reunAgentStatus, isRunning: reunIsRunning,
    agentProgress: reunAgentProgress, agentProgressMeta: reunAgentProgressMeta,
    loopMode, setLoopMode, loopMaxTurnos, setLoopMaxTurnos, loopCustoCap, setLoopCustoCap,
    loopActive, loopTurn, loopCost, loopStatus, loopStop,
    send: reunSend, reset: reunReset, abort: reunAbort, mesaRedonda: reunMesaRedonda,
  } = useReuniao()
  const { sessions, selected, loading, loadingDetail, fetchSessions, fetchDetail, clearSelected } = useHistory()

  // T178 — Chat fixo à direita; HistoryPanel segue arrastável.
  const historyDragControls = useDragControls()
  const historyPanelX = useMotionValue(0)
  const historyPanelY = useMotionValue(0)

  // T178 — limpa chaves antigas do chat draggable (uma vez por load)
  // T192 — também limpa 'lemmon-office-mode' (toggle SVG/PIX removido)
  useEffect(() => {
    try {
      localStorage.removeItem('chatPanelPos')
      localStorage.removeItem('lemmon-chat-pinned')
      localStorage.removeItem('lemmon-chat-position')
      localStorage.removeItem('lemmon-office-mode')
    } catch {}
  }, [])

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

  // T148 — marca primeira sessão concluída quando recebemos sessionId + isRunning false
  useEffect(() => {
    if (sessionId && !isRunning && !hasCompletedFirstSession) {
      setHasCompletedFirstSession(true)
    }
  }, [sessionId, isRunning, hasCompletedFirstSession, setHasCompletedFirstSession])

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

  // T190.A11 — guard de double-send. Pedro pode clicar 2x ou apertar Enter
  // várias vezes enquanto Concierge responde (~3-5s). Sem guard, cada clique
  // dispara um fluxo paralelo, somando custo + bagunçando o histórico.
  const submittingRef = useRef(false)

  const handleSend = async (msg: string, image?: ImageData) => {
    if (submittingRef.current) {
      // Já tem um envio rolando — ignora cliques extras silenciosamente.
      // Se quisermos feedback visual, dá pra chamar notify.info aqui.
      return
    }
    submittingRef.current = true
    try {
      await _handleSendInternal(msg, image)
    } finally {
      submittingRef.current = false
    }
  }

  const _handleSendInternal = async (msg: string, image?: ImageData) => {
    if (autoMode) {
      // T186.b/c — Em modo Auto, Concierge orquestra. Constrói histórico novo
      // mas NÃO grava ainda — esperamos resposta da API antes (T188.p: evitar
      // histórico desbalanceado se API falhar).
      const userMsg: ConciergeMsg = {
        role: 'user',
        content: msg,
        ...(image && { image_base64: image.base64, image_media_type: image.mediaType }),
      }
      // T188.j — usa snapshot funcional pra evitar closure stale em envios rápidos
      const historicoSnapshot = conciergeHistory
      const novoHistorico: ConciergeMsg[] = [...historicoSnapshot, userMsg]

      // T188.k — Mostra a msg do user no chat. Se vazio + imagem, usa placeholder
      // pra não aparecer bolha em branco.
      const userId = uuid()
      const contentExibido = msg.trim() || (image ? '📷 imagem anexada' : '')
      setMessages(prev => [...prev, { id: userId, role: 'user', content: contentExibido, done: true, hasImage: !!image }])

      // Chama Concierge ANTES de gravar no histórico persistido (T188.p)
      const resp = await conciergeConversar(novoHistorico)
      if (!resp) {
        // T193.b + v1.46.2 A4a-007 — wrap em PT amigável.
        // Antes erros técnicos em inglês (ex: "Internal server error", "Failed to fetch")
        // chegavam crus pro Pedro, que abandonava ao não entender. Agora detecta
        // padrões conhecidos e formata. Fallback genérico também em PT.
        const errMsgRaw = conciergeError || ''
        const lower = errMsgRaw.toLowerCase()

        // Detecção por palavra-chave conhecida do backend (que JÁ vem em PT)
        if (errMsgRaw.includes('Sem crédito')) {
          notify.error(`💳 ${errMsgRaw}`)
        } else if (errMsgRaw.includes('Chave da API')) {
          notify.error(`🔑 ${errMsgRaw}`)
        } else if (errMsgRaw.includes('Limite de chamadas')) {
          notify.warning(`⏳ ${errMsgRaw}`)
        } else if (errMsgRaw.includes('Sem conexão')) {
          notify.error(`🌐 ${errMsgRaw}`)
        }
        // Detecção por erros técnicos em inglês — wrap em PT
        else if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('econn')) {
          notify.error('🌐 Não foi possível conectar ao servidor. O backend tá no ar? Tente recarregar a página.')
        } else if (lower.includes('timeout') || lower.includes('timed out')) {
          notify.warning('⏱️ A resposta demorou demais. Tente de novo — se persistir, o Concierge pode estar sobrecarregado.')
        } else if (lower.includes('json') || lower.includes('parse')) {
          notify.error('⚠️ Resposta inválida do servidor. Recarregue a página e tente de novo.')
        } else if (lower.includes('500') || lower.includes('internal server')) {
          notify.error('🛠️ Erro interno no servidor. Calebe (suporte) recebeu o aviso. Tente em alguns minutos.')
        } else if (lower.includes('404')) {
          notify.error('🤔 Endpoint do Concierge não encontrado. Backend está rodando a versão certa?')
        } else if (errMsgRaw) {
          // Mensagem desconhecida: mostra mas com prefixo amigável
          notify.error(`⚠️ Algo deu errado: ${errMsgRaw.slice(0, 120)}${errMsgRaw.length > 120 ? '…' : ''}`)
        } else {
          // Fallback genérico
          notify.error('⚠️ Não consegui falar com o Concierge agora. Recarregue a página e tente de novo.')
        }
        // T188.p — NÃO atualiza histórico se API falhou. Próximo envio reaproveita
        // contexto anterior. Caso contrário ficaria 2x user seguidos no histórico.
        return
      }

      // T188.p — agora que tem resposta, atualiza histórico (user + concierge juntos)
      // T188.j — usa functional setState pra ser robusto a race condition
      setConciergeHistory(prev => {
        // Se prev divergiu do snapshot, alguém apertou enter 2x — pega a referência mais nova
        const base = prev === historicoSnapshot ? prev : prev
        return [...base, userMsg, { role: 'concierge', content: resp.conteudo }]
      })

      // Adiciona resposta do Concierge no chat
      // Refinamento — se for "confirmar", anexa metadata pro ConciergeConfirmCard renderizar
      const conciergeId = uuid()
      const novaMensagem = {
        id: conciergeId,
        role: 'concierge' as AgentId,
        content: resp.conteudo,
        done: true,
        ...(resp.tipo === 'confirmar' && {
          conciergeConfirmar: {
            agentes: resp.agentes_sugeridos as AgentId[],
            razoes: resp.razoes_agentes,
            ferramentas: resp.ferramentas_extras,
            custoEstimadoUsd: resp.custo_estimado_usd ?? 0,
            briefingRefinado: resp.briefing_refinado,
          },
        }),
      }
      setMessages(prev => [...prev, novaMensagem])

      if (resp.tipo === 'pergunta' || resp.tipo === 'confirmar') {
        // T188.a — pergunta E confirmar funcionam igual no fluxo: espera próximo
        // input do user (que pode ser "OK" pra confirmar OU mais info pra pergunta).
        // T188.e — se "confirmar", mostra custo estimado no toast
        if (resp.tipo === 'confirmar' && resp.custo_estimado_usd && resp.custo_estimado_usd > 0) {
          const custoBRL = (resp.custo_estimado_usd * 5.50).toFixed(2).replace('.', ',')
          notify.info(`💰 Custo estimado dessa execução: R$ ${custoBRL}`)
        }
        return
      }

      // tipo === 'pronto': cliente confirmou. Pipeline com agentes escolhidos pelo Concierge
      let ids = resp.agentes_sugeridos.filter(id => {
        const agent = AGENTS.find(a => a.id === id)
        return agent && !agent.reuniaoOnly
      }) as AgentId[]
      // T-bug-Hator-#5/#8 — Concierge agora é fonte única da verdade pra equipe.
      // ANTES: complianceMode='sempre' INJETAVA Heitor escondido (sem aparecer no card),
      // o cliente clicava OK achando que aprovou X agentes e o pipeline rodava X+heitor.
      // Quebra de promessa visual + custo extra. AGORA: 'sempre' é no-op, 'nunca' ainda
      // remove Heitor (kill switch transparente: cliente vê Heitor no card e pode ter
      // configurado 'nunca' antes — respeitamos a preferência explícita de remover).
      if (complianceMode === 'nunca' && ids.includes('heitor')) {
        ids = ids.filter(id => id !== 'heitor')
        notify.warning('🚫 Compliance removido conforme sua preferência (toggle 🛡️ Nunca).')
      }
      if (ids.length === 0) {
        notify.warning('Concierge não conseguiu escolher agentes. Tente reformular.')
        return
      }
      setInMeeting(new Set(ids))
      const nomes = ids.map(id => AGENTS.find(a => a.id === id)?.name ?? id).join(' · ')
      notify.info(`🎯 Concierge ativou: ${nomes}`)
      // Limpa histórico do Concierge — próxima conversa começa fresh
      setConciergeHistory([])
      // Dispara pipeline com briefing refinado pelo Concierge
      const briefingFinal = resp.briefing_refinado || msg
      send(ids, briefingFinal, image)
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
      {/* T147 — modal de boas-vindas na 1ª visita; quando clica "experimentar", já manda o briefing exemplo */}
      <WelcomeModal onTryExample={(b) => { setPrefillBriefing(b) }} />
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
            {AGENTS.filter(agent => {
              // T172 — filtra pills pela sala ativa. Admin = só os 4 admin Hator;
              // Criativo = todo o resto (criativos + espelhos cliente).
              const ADMIN_IDS = new Set(['ana_maria', 'prichina', 'caito', 'kelly'])
              return activeRoom === 'admin' ? ADMIN_IDS.has(agent.id) : !ADMIN_IDS.has(agent.id)
            }).map(agent => {
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
          <RoomToggle
            activeRoom={activeRoom}
            setActiveRoom={setActiveRoom}
            disabled={isRunning || reunIsRunning}
          />
          <AutoModeToggle
            autoMode={autoMode}
            setAutoMode={setAutoMode}
            disabled={isRunning || reunIsRunning}
            showRecommended={!hasCompletedFirstSession}
          />
          {/* T190.A13 — Compliance toggle escondido no 1º acesso. Cliente Hator
              não deve poder desativar compliance acidentalmente (risco ban Meta).
              Default "auto" (IA decide) é mantido. Após 1ª sessão, toggle volta. */}
          {hasCompletedFirstSession && (
            <ComplianceToggle
              value={complianceMode}
              setValue={setComplianceMode}
              disabled={isRunning || reunIsRunning}
            />
          )}
          <Clock />
          <Link href="/saude" title="Dashboard de Saúde"
            className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </Link>
          {/* PROD-FIN v1.47 — atalho pra Análise Financeira (Ana Maria + planilha XLSX) */}
          <Link href="/financeiro" title="Análise Financeira (Ana Maria)"
            className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400 text-xs">
            💼
          </Link>
          {/* T190.A3 — esconde toggles avançados até cliente completar 1ª sessão.
              Hall of Fame, Briefing Reverso, Cortes, Calibragem e SVG/PIX só aparecem
              depois do onboarding pra evitar paralisia em leigo no 1º acesso. */}
          {hasCompletedFirstSession && imersivo && (
            <button
              onClick={() => setImersivo(false)}
              title="Sair do modo imersivo (esconder escritório)"
              className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 text-sm"
            >
              🎮
            </button>
          )}
          {hasCompletedFirstSession && (
            <>
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
              {/* T192 — toggle SVG/PIX removido. Sistema agora roda só com PixelOfficeScene. */}
            </>
          )}
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

      {/* T185.6 — Split layout: escritorio (flex-1) + chat (largura fixa) lado a lado.
          T192 — SVG isométrico removido. Apenas PixelOfficeScene em produção. */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        <main className="flex-1 overflow-hidden bg-gradient-to-br from-stone-50 to-stone-100 dark:from-stone-900 dark:to-stone-950">
          {imersivo ? (
            <PixelOfficeScene
              inMeeting={inMeeting}
              agentStatus={agentStatus}
              onToggleAgent={toggleAgent}
              onCallAll={callAll}
              onExitMeeting={exitMeeting}
              isRunning={isRunning}
              messages={messages}
              activeRoom={activeRoom}
            />
          ) : (
            // PROD-13 — sem pixel office: tela limpa, focada no chat.
            // Cliente leigo não se distrai com escritório.
            <div className="h-full flex flex-col items-center justify-center px-8 text-center max-w-xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-stone-900 dark:bg-stone-100 flex items-center justify-center mb-6">
                <span className="text-white dark:text-stone-900 text-xl font-display font-bold">L</span>
              </div>
              <h1 className="text-2xl font-display font-bold text-stone-900 dark:text-stone-100 mb-3">
                Time IA da Lemmon
              </h1>
              <p className="text-stone-600 dark:text-stone-300 leading-relaxed">
                {isRunning
                  ? 'O time está trabalhando — acompanha no painel à direita.'
                  : 'Descreva o que você precisa no chat. O Concierge entrevista e mobiliza o time certo pra você.'}
              </p>
              {!isRunning && hasCompletedFirstSession && (
                <button
                  onClick={() => setImersivo(true)}
                  className="mt-6 text-xs font-mono uppercase tracking-widest text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
                >
                  🎮 Modo Imersivo (escritório pixel)
                </button>
              )}
            </div>
          )}
        </main>

        {/* T185.6/7 - Chat split coluna direita, ocupa 100% altura disponivel. */}
        <aside
          className="flex-shrink-0 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 overflow-hidden h-full flex flex-col"
          aria-label="Painel do chat"
        >
          <div className="flex-1 min-h-0 overflow-visible">
            <ChatPanel
              mode={chatMode}
              onToggleMode={() => setChatMode(m => m === 'pipeline' ? 'reuniao' : 'pipeline')}
              messages={messages}
              agentStatus={agentStatus}
              agentProgress={agentProgress}
              agentProgressMeta={agentProgressMeta}
              inMeeting={inMeeting}
              isRunning={isRunning}
              conciergeLoading={conciergeLoading}
              onConfirmConcierge={(approve) => {
                // Reaproveita handleSend — manda "sim" ou "edita" pro Concierge.
                handleSend(approve ? 'ok pode rodar' : 'edita a equipe')
              }}
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
              autoMode={autoMode}
              hideAdvancedToggles={!hasCompletedFirstSession}
              prefillInput={prefillBriefing}
              onPrefillConsumed={() => setPrefillBriefing(undefined)}
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
            />
          </div>
        </aside>
      </div>

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

      {/* T185.5 — Floating button REMOVIDO: chat sempre visível, não pode fechar. */}
    </div>
  )
}
