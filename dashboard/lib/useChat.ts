'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentId } from './agents'
import type { HistoryDetail } from './useHistory'
import { API_URL, WS_URL } from './api'
import { WATCHDOG_TIMEOUT_MIN, PROGRESS_CURVE_POWER } from './config'

export type MessageRole = 'user' | AgentId
export interface Message {
  id: string
  role: MessageRole
  content: string
  done: boolean
  cost?: number
  error?: string
  hasImage?: boolean
}

export interface ImageData {
  base64: string
  mediaType: string
}

export type AgentStatus = 'idle' | 'thinking' | 'speaking' | 'done' | 'error'

export interface ExportResult {
  html_gerado: boolean
  pdf_gerado: boolean
  caminho_html: string | null
  caminho_pdf: string | null
  erros: string[]
}

export interface ApprovalRequest {
  agent: string
  mode: 'approval' | 'retry' | 'confirmar'
  error?: string
  mensagem?: string
}

export interface ProgressMeta {
  mediana: number
  elapsed: number
  amostras: number
}

const FALLBACK_MEDIANAS: Record<AgentId, number> = {
  otto: 20, heitor: 40, salles: 30, sonia: 30, aya: 15, pedro_abrahao: 25, renata: 30,
}

export interface AgentConfig {
  otto: { modo_visual: 'completo' | 'resumo' | 'auto' }
  heitor: { max_buscas: number }
  salles: { formatos_permitidos: string[]; gate_espelho: 'off' | 'auto' | 'manual'; alternativas: 0 | 3 }
  sonia: { com_busca: boolean; usar_tendencias: boolean }
  renata: { incluir: boolean; duracao_dias: number }
}

const DEFAULT_CONFIG: AgentConfig = {
  otto: { modo_visual: 'auto' },
  heitor: { max_buscas: 3 },
  salles: { formatos_permitidos: [], gate_espelho: 'off', alternativas: 0 },
  sonia: { com_busca: false, usar_tendencias: true },
  renata: { incluir: false, duracao_dias: 14 },
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [agentStatus, setAgentStatus] = useState<Record<AgentId, AgentStatus>>({
    otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle', pedro_abrahao: 'idle', renata: 'idle',
  })
  const [isRunning, setIsRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [favoritado, setFavoritado] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [awaitingApproval, setAwaitingApproval] = useState<ApprovalRequest | null>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_CONFIG)
  const [resumedFrom, setResumedFrom] = useState<string | null>(null)
  const [tagsSugeridas, setTagsSugeridas] = useState<string[]>([])
  const [fastTrack, setFastTrack] = useState(false)
  const [sandbox, setSandbox] = useState(false)
  const [custoCap, setCustoCap] = useState<number | null>(null)
  const [custoCapAtingido, setCustoCapAtingido] = useState<{ total: number; cap: number } | null>(null)
  const [custoAviso, setCustoAviso] = useState<{ total: number; cap: number; pct: number } | null>(null)
  const [agentProgress, setAgentProgress] = useState<Record<string, number>>({})
  const [agentProgressMeta, setAgentProgressMeta] = useState<Record<string, ProgressMeta>>({})
  const wsRef = useRef<WebSocket | null>(null)
  const currentMsgId = useRef<Record<string, string>>({})
  const resumeContextRef = useRef<Record<string, unknown> | null>(null)
  const progressIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const activeAgentsRef = useRef<Set<string>>(new Set())
  const watchdogTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const timedOutAgentsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    return () => {
      Object.values(progressIntervalsRef.current).forEach(clearInterval)
      Object.values(watchdogTimersRef.current).forEach(clearTimeout)
      progressIntervalsRef.current = {}
      watchdogTimersRef.current = {}
    }
  }, [])

  const updateConfig = useCallback(<K extends keyof AgentConfig>(
    agent: K,
    patch: Partial<AgentConfig[K]>,
  ) => {
    setAgentConfig(prev => ({ ...prev, [agent]: { ...prev[agent], ...patch } }))
  }, [])

  const loadSession = useCallback((detail: HistoryDetail) => {
    wsRef.current?.close()
    const msgs: Message[] = [
      { id: 'resume-user', role: 'user', content: detail.briefing, done: true },
      ...detail.agentes_usados
        .filter(a => detail.respostas[a])
        .map(agentId => ({
          id: `resume-${agentId}`,
          role: agentId as AgentId,
          content: detail.respostas[agentId],
          done: true,
          cost: detail.custos_usd?.[agentId],
        })),
    ]
    setMessages(msgs)
    setSessionId(detail.session_id)
    setFavoritado(detail.favorito ?? false)
    setIsRunning(false)
    setAwaitingApproval(null)
    setAgentStatus({ otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle', pedro_abrahao: 'idle', renata: 'idle' })
    setResumedFrom(detail.session_id)
    currentMsgId.current = {}
    resumeContextRef.current = (detail as HistoryDetail & { contexto_tecnico?: Record<string, unknown> }).contexto_tecnico ?? {
      briefing: detail.briefing,
      respostas: detail.respostas,
      custos_usd: detail.custos_usd,
      agentes_usados: detail.agentes_usados,
    }
  }, [])

  const send = useCallback((agents: AgentId[], userMessage: string, image?: ImageData) => {
    if (isRunning || !userMessage.trim() || agents.length === 0) return

    setSessionId(null)
    setFavoritado(false)
    setAwaitingApproval(null)
    setTagsSugeridas([])
    setCustoCapAtingido(null)
    setCustoAviso(null)
    setAgentProgress({})
    setAgentProgressMeta({})

    const userId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: userId, role: 'user', content: userMessage, done: true, hasImage: !!image }])
    setAgentStatus(prev => {
      const next = { ...prev }
      agents.forEach(a => { next[a] = 'thinking' })
      return next
    })
    setIsRunning(true)

    const ws = new WebSocket(`${WS_URL}/ws/chat`)
    wsRef.current = ws

    const resumeCtx = resumeContextRef.current
    resumeContextRef.current = null

    ws.onopen = () => ws.send(JSON.stringify({
      agents,
      message: userMessage,
      manual_mode: manualMode,
      fast_track: fastTrack,
      sandbox,
      custo_cap_usd: custoCap ?? undefined,
      config: agentConfig,
      ...(resumeCtx && { resume_context: resumeCtx }),
      ...(image && { image_base64: image.base64, image_media_type: image.mediaType }),
    }))

    ws.onmessage = (ev) => {
      const data = JSON.parse(ev.data)

      if (data.type === 'agent_start') {
        const msgId = crypto.randomUUID()
        currentMsgId.current[data.agent] = msgId
        setMessages(prev => [...prev, { id: msgId, role: data.agent as AgentId, content: '', done: false }])
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'speaking' }))
        setAwaitingApproval(null)

        const agentId = data.agent as AgentId
        const startTime = Date.now()
        activeAgentsRef.current.add(agentId)

        fetch(`${API_URL}/sessoes/medianas?agente=${agentId}`)
          .then(r => r.json())
          .then((res: { mediana_segundos: number | null; amostras: number }) => {
            if (!activeAgentsRef.current.has(agentId)) return
            let mediana = res.mediana_segundos ?? FALLBACK_MEDIANAS[agentId]
            const amostras = res.amostras ?? 0
            if (agentId === 'salles' && agentConfig.salles.alternativas === 3) mediana *= 3
            const iv = setInterval(() => {
              const elapsed = (Date.now() - startTime) / 1000
              setAgentProgress(prev => ({ ...prev, [agentId]: Math.min(95, Math.pow(Math.min(elapsed / mediana, 1), PROGRESS_CURVE_POWER) * 100) }))
              setAgentProgressMeta(prev => ({ ...prev, [agentId]: { mediana, elapsed, amostras } }))
            }, 200)
            progressIntervalsRef.current[agentId] = iv
            const timeoutMs = WATCHDOG_TIMEOUT_MIN * 60 * 1000
            watchdogTimersRef.current[agentId] = setTimeout(() => {
              if (!activeAgentsRef.current.has(agentId)) return
              timedOutAgentsRef.current.add(agentId)
              clearInterval(progressIntervalsRef.current[agentId])
              delete progressIntervalsRef.current[agentId]
              delete watchdogTimersRef.current[agentId]
              activeAgentsRef.current.delete(agentId)
              setAgentProgress(prev => { const n = { ...prev }; delete n[agentId]; return n })
              setAgentProgressMeta(prev => { const n = { ...prev }; delete n[agentId]; return n })
              setAgentStatus(prev => ({ ...prev, [agentId]: 'error' }))
              const msgId = currentMsgId.current[agentId]
              if (msgId) setMessages(prev => prev.map(m => m.id === msgId
                ? { ...m, done: true, error: `Agente travou (timeout ${WATCHDOG_TIMEOUT_MIN}min). Provável overloaded da API. Tente reenviar.` }
                : m
              ))
            }, timeoutMs)
          })
          .catch(() => {
            if (!activeAgentsRef.current.has(agentId)) return
            let mediana = FALLBACK_MEDIANAS[agentId]
            if (agentId === 'salles' && agentConfig.salles.alternativas === 3) mediana *= 3
            const iv = setInterval(() => {
              const elapsed = (Date.now() - startTime) / 1000
              setAgentProgress(prev => ({ ...prev, [agentId]: Math.min(95, Math.pow(Math.min(elapsed / mediana, 1), PROGRESS_CURVE_POWER) * 100) }))
              setAgentProgressMeta(prev => ({ ...prev, [agentId]: { mediana, elapsed, amostras: 0 } }))
            }, 200)
            progressIntervalsRef.current[agentId] = iv
            const timeoutMs2 = WATCHDOG_TIMEOUT_MIN * 60 * 1000
            watchdogTimersRef.current[agentId] = setTimeout(() => {
              if (!activeAgentsRef.current.has(agentId)) return
              timedOutAgentsRef.current.add(agentId)
              clearInterval(progressIntervalsRef.current[agentId])
              delete progressIntervalsRef.current[agentId]
              delete watchdogTimersRef.current[agentId]
              activeAgentsRef.current.delete(agentId)
              setAgentProgress(prev => { const n = { ...prev }; delete n[agentId]; return n })
              setAgentProgressMeta(prev => { const n = { ...prev }; delete n[agentId]; return n })
              setAgentStatus(prev => ({ ...prev, [agentId]: 'error' }))
              const msgId = currentMsgId.current[agentId]
              if (msgId) setMessages(prev => prev.map(m => m.id === msgId
                ? { ...m, done: true, error: `Agente travou (timeout ${WATCHDOG_TIMEOUT_MIN}min). Provável overloaded da API. Tente reenviar.` }
                : m
              ))
            }, timeoutMs2)
          })
      }

      if (data.type === 'token') {
        if (timedOutAgentsRef.current.has(data.agent)) return
        const msgId = currentMsgId.current[data.agent]
        if (!msgId) return
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: m.content + data.content } : m))
      }

      if (data.type === 'agent_done') {
        if (timedOutAgentsRef.current.has(data.agent)) return
        const msgId = currentMsgId.current[data.agent]
        if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, done: true, cost: data.cost } : m))
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'done' }))
        if (data.awaiting_approval) {
          setAwaitingApproval({ agent: data.agent, mode: 'approval' })
        }
        const agentId = data.agent as AgentId
        activeAgentsRef.current.delete(agentId)
        if (progressIntervalsRef.current[agentId]) {
          clearInterval(progressIntervalsRef.current[agentId])
          delete progressIntervalsRef.current[agentId]
        }
        if (watchdogTimersRef.current[agentId]) {
          clearTimeout(watchdogTimersRef.current[agentId])
          delete watchdogTimersRef.current[agentId]
        }
        setAgentProgress(prev => ({ ...prev, [agentId]: 100 }))
      }

      if (data.type === 'agent_error') {
        const msgId = currentMsgId.current[data.agent]
        if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, done: true, error: data.error } : m))
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'error' }))
        if (data.awaiting_retry) {
          setAwaitingApproval({ agent: data.agent, mode: 'retry', error: data.error })
        }
        const agentId = data.agent as AgentId
        activeAgentsRef.current.delete(agentId)
        if (progressIntervalsRef.current[agentId]) {
          clearInterval(progressIntervalsRef.current[agentId])
          delete progressIntervalsRef.current[agentId]
        }
        if (watchdogTimersRef.current[agentId]) {
          clearTimeout(watchdogTimersRef.current[agentId])
          delete watchdogTimersRef.current[agentId]
        }
        setAgentProgress(prev => { const n = { ...prev }; delete n[agentId]; return n })
      }

      if (data.type === 'gate_espelho_result') {
        // Prepend veredicto badge to the gate message content
        const badge = data.veredicto === 'vermelho' ? '🔴 VETO' : data.veredicto === 'amarelo' ? '🟡 ALERTA' : '🟢 OK'
        const msgId = currentMsgId.current['gate_espelho']
        if (msgId) {
          setMessages(prev => prev.map(m => m.id === msgId
            ? { ...m, content: `**Gate Espelho — ${badge}**\n\n` + m.content }
            : m
          ))
        }
      }

      if (data.type === 'confirmar') {
        setAwaitingApproval({ agent: data.agent, mode: 'confirmar', mensagem: data.mensagem })
      }

      if (data.type === 'routing_condicional') {
        // T29: show as system message
        const msgId = crypto.randomUUID()
        setMessages(prev => [...prev, { id: msgId, role: 'aya' as AgentId, content: data.mensagem, done: true }])
      }

      if (data.type === 'custo_aviso') {
        // T30: low warning
        setCustoAviso({ total: data.total_atual, cap: data.cap, pct: data.pct })
      }

      if (data.type === 'custo_cap_atingido') {
        // T30: cap hit — show block dialog
        setCustoCapAtingido({ total: data.total_atual, cap: data.cap })
      }

      if (data.type === 'tags_sugeridas') {
        setTagsSugeridas(data.tags ?? [])
      }

      if (data.type === 'pipeline_done') {
        setIsRunning(false)
        setAwaitingApproval(null)
        if (data.session_id) setSessionId(data.session_id)
        setResumedFrom(null)
        ws.close()
      }
    }

    ws.onerror = () => {
      setIsRunning(false)
      setAwaitingApproval(null)
      setAgentStatus(prev => {
        const next = { ...prev }
        agents.forEach(a => { if (next[a] !== 'done') next[a] = 'error' })
        return next
      })
    }

    ws.onclose = () => {
      setIsRunning(false)
      setAwaitingApproval(null)
      Object.values(progressIntervalsRef.current).forEach(clearInterval)
      Object.values(watchdogTimersRef.current).forEach(clearTimeout)
      progressIntervalsRef.current = {}
      watchdogTimersRef.current = {}
      activeAgentsRef.current.clear()
      timedOutAgentsRef.current.clear()
    }
  }, [isRunning, manualMode, agentConfig])

  const approve = useCallback((action: 'approve' | 'retry' | 'skip' | 'cancel' | 'confirmar_sim' | 'confirmar_nao') => {
    wsRef.current?.send(JSON.stringify({ type: action }))
    setAwaitingApproval(null)
    if (action === 'cancel') {
      setIsRunning(false)
    }
  }, [])

  const toggleManualMode = useCallback(() => setManualMode(v => !v), [])
  const toggleFastTrack = useCallback(() => setFastTrack(v => !v), [])
  const toggleSandbox = useCallback(() => setSandbox(v => !v), [])
  const autorizarCusto = useCallback((valor: number) => {
    wsRef.current?.send(JSON.stringify({ type: 'autorizar_custo', valor }))
    setCustoCapAtingido(null)
    setCustoAviso(null)
  }, [])
  const recusarCustoExtra = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }))
    setCustoCapAtingido(null)
    setIsRunning(false)
  }, [])

  const favoritar = useCallback(async (novoEstado?: boolean) => {
    if (!sessionId) return
    const next = novoEstado !== undefined ? novoEstado : !favoritado
    try {
      await fetch(`${API_URL}/favoritar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, favorito: next }),
      })
      setFavoritado(next)
    } catch {
      // silencia — não bloqueia o usuário
    }
  }, [sessionId, favoritado])

  const exportar = useCallback(async (sid: string, agente = 'aya'): Promise<ExportResult> => {
    const res = await fetch(`${API_URL}/exportar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, agente }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro desconhecido' }))
      throw new Error((err as { detail?: string }).detail ?? 'Erro ao exportar')
    }
    return res.json() as Promise<ExportResult>
  }, [])

  const abort = useCallback(() => {
    wsRef.current?.close()
    setIsRunning(false)
    setAwaitingApproval(null)
    Object.values(progressIntervalsRef.current).forEach(clearInterval)
    Object.values(watchdogTimersRef.current).forEach(clearTimeout)
    progressIntervalsRef.current = {}
    watchdogTimersRef.current = {}
    activeAgentsRef.current.clear()
    timedOutAgentsRef.current.clear()
    setAgentStatus(prev => {
      const next = { ...prev }
      ;(Object.keys(next) as AgentId[]).forEach(k => {
        if (next[k] === 'thinking' || next[k] === 'speaking') next[k] = 'error'
      })
      return next
    })
  }, [])

  const reset = useCallback(() => {
    wsRef.current?.close()
    setMessages([])
    setAgentStatus({ otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle', pedro_abrahao: 'idle', renata: 'idle' })
    setIsRunning(false)
    setSessionId(null)
    setFavoritado(false)
    setAwaitingApproval(null)
    setResumedFrom(null)
    setTagsSugeridas([])
    setCustoCapAtingido(null)
    setCustoAviso(null)
    resumeContextRef.current = null
    currentMsgId.current = {}
    Object.values(progressIntervalsRef.current).forEach(clearInterval)
    Object.values(watchdogTimersRef.current).forEach(clearTimeout)
    progressIntervalsRef.current = {}
    watchdogTimersRef.current = {}
    activeAgentsRef.current.clear()
    timedOutAgentsRef.current.clear()
    setAgentProgress({})
    setAgentProgressMeta({})
  }, [])

  return {
    messages, agentStatus, isRunning, sessionId, favoritado, resumedFrom,
    manualMode, fastTrack, sandbox, custoCap, custoCapAtingido, custoAviso,
    awaitingApproval, agentConfig, tagsSugeridas, agentProgress, agentProgressMeta,
    send, approve, abort, toggleManualMode, toggleFastTrack, toggleSandbox,
    setCustoCap, autorizarCusto, recusarCustoExtra,
    updateConfig, favoritar, exportar, reset, loadSession,
  }
}
