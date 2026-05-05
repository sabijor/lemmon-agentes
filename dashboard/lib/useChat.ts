'use client'
import { useCallback, useRef, useState } from 'react'
import type { AgentId } from './agents'
import type { HistoryDetail } from './useHistory'
import { API_URL, WS_URL } from './api'

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

export interface ApprovalRequest {
  agent: string
  mode: 'approval' | 'retry' | 'confirmar'
  error?: string
  mensagem?: string
}

export interface AgentConfig {
  otto: { modo_visual: 'completo' | 'resumido' | 'minimo' }
  heitor: { max_buscas: number }
  salles: { formato: 'auto' | 'reels' | 'documental' | 'mini-doc' | 'tese' | 'aftermovie' }
  sonia: { com_busca: boolean; usar_tendencias: boolean }
}

const DEFAULT_CONFIG: AgentConfig = {
  otto: { modo_visual: 'completo' },
  heitor: { max_buscas: 3 },
  salles: { formato: 'auto' },
  sonia: { com_busca: false, usar_tendencias: true },
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [agentStatus, setAgentStatus] = useState<Record<AgentId, AgentStatus>>({
    otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle',
  })
  const [isRunning, setIsRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [avaliado, setAvaliado] = useState(false)
  const [manualMode, setManualMode] = useState(false)
  const [awaitingApproval, setAwaitingApproval] = useState<ApprovalRequest | null>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(DEFAULT_CONFIG)
  const [resumedFrom, setResumedFrom] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const currentMsgId = useRef<Record<string, string>>({})
  const resumeContextRef = useRef<Record<string, unknown> | null>(null)

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
    setAvaliado(detail.avaliacao !== null)
    setIsRunning(false)
    setAwaitingApproval(null)
    setAgentStatus({ otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle' })
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
    setAvaliado(false)
    setAwaitingApproval(null)

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
      }

      if (data.type === 'token') {
        const msgId = currentMsgId.current[data.agent]
        if (!msgId) return
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: m.content + data.content } : m))
      }

      if (data.type === 'agent_done') {
        const msgId = currentMsgId.current[data.agent]
        if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, done: true, cost: data.cost } : m))
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'done' }))
        if (data.awaiting_approval) {
          setAwaitingApproval({ agent: data.agent, mode: 'approval' })
        }
      }

      if (data.type === 'agent_error') {
        const msgId = currentMsgId.current[data.agent]
        if (msgId) setMessages(prev => prev.map(m => m.id === msgId ? { ...m, done: true, error: data.error } : m))
        setAgentStatus(prev => ({ ...prev, [data.agent]: 'error' }))
        if (data.awaiting_retry) {
          setAwaitingApproval({ agent: data.agent, mode: 'retry', error: data.error })
        }
      }

      if (data.type === 'confirmar') {
        setAwaitingApproval({ agent: data.agent, mode: 'confirmar', mensagem: data.mensagem })
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

  const avaliar = useCallback(async (nota: number, observacoes = '') => {
    if (!sessionId || avaliado) return
    try {
      await fetch(`${API_URL}/avaliar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, nota, observacoes }),
      })
      setAvaliado(true)
    } catch {
      // silencia — não bloqueia o usuário
    }
  }, [sessionId, avaliado])

  const abort = useCallback(() => {
    wsRef.current?.close()
    setIsRunning(false)
    setAwaitingApproval(null)
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
    setAgentStatus({ otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle' })
    setIsRunning(false)
    setSessionId(null)
    setAvaliado(false)
    setAwaitingApproval(null)
    setResumedFrom(null)
    resumeContextRef.current = null
    currentMsgId.current = {}
  }, [])

  return {
    messages, agentStatus, isRunning, sessionId, avaliado, resumedFrom,
    manualMode, awaitingApproval, agentConfig,
    send, approve, abort, toggleManualMode, updateConfig, avaliar, reset, loadSession,
  }
}
