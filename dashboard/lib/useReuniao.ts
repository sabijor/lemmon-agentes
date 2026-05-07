'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type AgentId } from './agents'
import { type Message, type AgentStatus, type ProgressMeta } from './useChat'
import { API_URL, WS_URL } from './api'
import { WATCHDOG_TIMEOUT_MIN, PROGRESS_CURVE_POWER } from './config'

const DEFAULT_STATUS = (): Record<AgentId, AgentStatus> => ({
  otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle', pedro_abrahao: 'idle', renata: 'idle',
})

const FALLBACK_MEDIANAS: Record<AgentId, number> = {
  otto: 20, heitor: 40, salles: 30, sonia: 30, aya: 15, pedro_abrahao: 25, renata: 30,
}

export interface LoopStatus {
  motivo: 'final' | 'ayuda' | 'turnos_max' | 'stagnacao' | 'operador' | 'custo_max'
  nTurnos: number
  custoTotal: number
  agenteFinal?: string
}

export function useReuniao() {
  const [messages, setMessages] = useState<Message[]>([])
  const [agentStatus, setAgentStatus] = useState<Record<AgentId, AgentStatus>>(DEFAULT_STATUS())
  const [isRunning, setIsRunning] = useState(false)
  const [agentProgress, setAgentProgress] = useState<Record<string, number>>({})
  const [agentProgressMeta, setAgentProgressMeta] = useState<Record<string, ProgressMeta>>({})

  // Loop state
  const [loopMode, setLoopMode] = useState(false)
  const [loopMaxTurnos, setLoopMaxTurnos] = useState(5)
  const [loopCustoCap, setLoopCustoCap] = useState(1.50)
  const [loopActive, setLoopActive] = useState(false)
  const [loopTurn, setLoopTurn] = useState(0)
  const [loopCost, setLoopCost] = useState(0)
  const [loopStatus, setLoopStatus] = useState<LoopStatus | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamBufRef = useRef<Record<string, string>>({})
  const histRef = useRef<Array<{ role: string; content: string }>>([])
  const progressIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})
  const watchdogTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const activeAgentsRef = useRef<Set<string>>(new Set())
  const timedOutAgentsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    return () => {
      Object.values(progressIntervalsRef.current).forEach(clearInterval)
      Object.values(watchdogTimersRef.current).forEach(clearTimeout)
    }
  }, [])

  const _clearAgent = useCallback((agentId: string) => {
    clearInterval(progressIntervalsRef.current[agentId])
    delete progressIntervalsRef.current[agentId]
    clearTimeout(watchdogTimersRef.current[agentId])
    delete watchdogTimersRef.current[agentId]
    activeAgentsRef.current.delete(agentId)
  }, [])

  const _clearAllProgress = useCallback(() => {
    Object.values(progressIntervalsRef.current).forEach(clearInterval)
    Object.values(watchdogTimersRef.current).forEach(clearTimeout)
    progressIntervalsRef.current = {}
    watchdogTimersRef.current = {}
    activeAgentsRef.current.clear()
    timedOutAgentsRef.current.clear()
  }, [])

  const _startProgress = useCallback((agentId: AgentId, startTime: number, mediana: number, amostras: number) => {
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
      _clearAgent(agentId)
      setAgentProgress(prev => { const n = { ...prev }; delete n[agentId]; return n })
      setAgentProgressMeta(prev => { const n = { ...prev }; delete n[agentId]; return n })
      setAgentStatus(s => ({ ...s, [agentId]: 'error' }))
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== `thinking-${agentId}`)
        return [...filtered, {
          id: `timeout-${agentId}-${Date.now()}`,
          role: agentId,
          content: '',
          done: true,
          error: `Agente travou (timeout ${WATCHDOG_TIMEOUT_MIN}min). Provável overloaded da API. Tente reenviar.`,
        }]
      })
    }, timeoutMs)
  }, [_clearAgent])

  const getOrCreateWs = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        resolve(wsRef.current)
        return
      }
      const ws = new WebSocket(`${WS_URL}/ws/reuniao`)

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)

        if (msg.type === 'agent_start') {
          const agentId = msg.agent as AgentId
          streamBufRef.current[agentId] = ''
          activeAgentsRef.current.add(agentId)
          timedOutAgentsRef.current.delete(agentId)
          setAgentStatus(s => ({ ...s, [agentId]: 'thinking' }))
          setMessages(prev => [...prev, {
            id: `thinking-${agentId}`,
            role: agentId,
            content: '',
            done: false,
          }])

          const startTime = Date.now()
          fetch(`${API_URL}/sessoes/medianas?agente=${agentId}`)
            .then(r => r.json())
            .then((res: { mediana_segundos: number | null; amostras: number }) => {
              if (!activeAgentsRef.current.has(agentId)) return
              const mediana = res.mediana_segundos ?? FALLBACK_MEDIANAS[agentId]
              const amostras = res.amostras ?? 0
              _startProgress(agentId, startTime, mediana, amostras)
            })
            .catch(() => {
              if (!activeAgentsRef.current.has(agentId)) return
              _startProgress(agentId, startTime, FALLBACK_MEDIANAS[agentId], 0)
            })

        } else if (msg.type === 'token') {
          if (timedOutAgentsRef.current.has(msg.agent)) return
          const agentId = msg.agent as AgentId
          const buf = (streamBufRef.current[agentId] ?? '') + msg.content
          streamBufRef.current[agentId] = buf
          setAgentStatus(s => ({ ...s, [agentId]: 'speaking' }))
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === `thinking-${agentId}`)
            if (idx !== -1) {
              const updated = [...prev]
              updated[idx] = { ...updated[idx], content: buf }
              return updated
            }
            let sIdx = -1
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === agentId && !prev[i].done) { sIdx = i; break }
            }
            if (sIdx !== -1) {
              const updated = [...prev]
              updated[sIdx] = { ...updated[sIdx], content: buf }
              return updated
            }
            return [...prev, {
              id: `reun-${agentId}-${Date.now()}`,
              role: agentId,
              content: buf,
              done: false,
            }]
          })

        } else if (msg.type === 'agent_done') {
          if (timedOutAgentsRef.current.has(msg.agent)) return
          const agentId = msg.agent as AgentId
          const finalText = streamBufRef.current[agentId] ?? ''
          histRef.current = [...histRef.current, { role: agentId, content: finalText }]
          _clearAgent(agentId)
          setAgentProgress(prev => ({ ...prev, [agentId]: 100 }))
          setAgentStatus(s => ({ ...s, [agentId]: 'done' }))
          setMessages(prev => prev.map(m =>
            m.id === `thinking-${agentId}` || (m.role === agentId && !m.done)
              ? { ...m, done: true, cost: msg.cost }
              : m
          ))
          delete streamBufRef.current[agentId]

        } else if (msg.type === 'agent_error') {
          const agentId = msg.agent as AgentId
          _clearAgent(agentId)
          setAgentProgress(prev => { const n = { ...prev }; delete n[agentId]; return n })
          setAgentProgressMeta(prev => { const n = { ...prev }; delete n[agentId]; return n })
          setAgentStatus(s => ({ ...s, [agentId]: 'error' }))
          setMessages(prev => {
            const filtered = prev.filter(m => m.id !== `thinking-${agentId}`)
            return [...filtered, {
              id: `err-${agentId}-${Date.now()}`,
              role: agentId,
              content: '',
              done: true,
              error: msg.error,
            }]
          })

        } else if (msg.type === 'turn_iteration') {
          setLoopTurn(msg.n)
          setLoopCost(msg.custo_total ?? 0)
          setLoopActive(true)

        } else if (msg.type === 'loop_stopped') {
          setLoopActive(false)
          setIsRunning(false)
          setLoopStatus({
            motivo: msg.motivo,
            nTurnos: msg.n_turnos,
            custoTotal: msg.custo_total,
            agenteFinal: msg.agente_final,
          })
          setTimeout(() => {
            setAgentStatus(s => {
              const next = { ...s }
              for (const k of Object.keys(next) as AgentId[]) {
                if (next[k] === 'done') next[k] = 'idle'
              }
              return next
            })
          }, 1500)

        } else if (msg.type === 'turn_done') {
          setIsRunning(false)
          setTimeout(() => {
            setAgentStatus(s => {
              const next = { ...s }
              for (const k of Object.keys(next) as AgentId[]) {
                if (next[k] === 'done') next[k] = 'idle'
              }
              return next
            })
          }, 1500)
        }
      }

      ws.onclose = () => {
        setIsRunning(false)
        setLoopActive(false)
        _clearAllProgress()
      }
      ws.onerror = () => {
        _clearAllProgress()
      }
      wsRef.current = ws
      if (ws.readyState === WebSocket.OPEN) resolve(ws)
      else ws.onopen = () => resolve(ws)
    })
  }, [_clearAgent, _clearAllProgress, _startProgress])

  const send = useCallback(async (agents: AgentId[], message: string, manual = false) => {
    setIsRunning(true)
    setLoopStatus(null)
    setLoopTurn(0)
    setLoopCost(0)
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      done: true,
    }])

    const historico_anterior = [...histRef.current]
    histRef.current = [...histRef.current, { role: 'user', content: message }]

    const ws = await getOrCreateWs()
    const payload: Record<string, unknown> = { agents, message, historico_anterior }

    if (loopMode) {
      payload.modo = 'loop'
      payload.loop_config = { max_turnos: loopMaxTurnos, custo_cap: loopCustoCap }
    } else {
      payload.modo = manual ? 'manual' : 'auto'
      payload.manual = manual
    }

    ws.send(JSON.stringify(payload))
  }, [getOrCreateWs, loopMode, loopMaxTurnos, loopCustoCap])

  const loopStop = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'loop_stop' }))
  }, [])

  const reset = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'reset' }))
    }
    histRef.current = []
    _clearAllProgress()
    setMessages([])
    setAgentStatus(DEFAULT_STATUS())
    setAgentProgress({})
    setAgentProgressMeta({})
    setIsRunning(false)
    setLoopActive(false)
    setLoopTurn(0)
    setLoopCost(0)
    setLoopStatus(null)
  }, [_clearAllProgress])

  const abort = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    _clearAllProgress()
    setAgentProgress({})
    setAgentProgressMeta({})
    setIsRunning(false)
    setLoopActive(false)
    setLoopStatus(null)
    setAgentStatus(s => {
      const next = { ...s }
      for (const k of Object.keys(next) as AgentId[]) {
        if (next[k] === 'thinking' || next[k] === 'speaking') next[k] = 'error'
      }
      return next
    })
  }, [_clearAllProgress])

  const mesaRedonda = useCallback(async (agents: AgentId[], tese: string, briefing: string) => {
    setIsRunning(true)
    setMessages(prev => [...prev, {
      id: `user-mesa-${Date.now()}`,
      role: 'user',
      content: `🔴 Mesa Redonda — tese em debate: "${tese}"`,
      done: true,
    }])

    const ws = new WebSocket(`${WS_URL}/ws/mesa_redonda`)
    await new Promise<void>(resolve => { ws.onopen = () => resolve() })

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'agent_start') {
        streamBufRef.current[msg.agent] = ''
        setAgentStatus(s => ({ ...s, [msg.agent]: 'thinking' }))
        setMessages(prev => [...prev, { id: `mr-${msg.agent}`, role: msg.agent as AgentId, content: '', done: false }])
      } else if (msg.type === 'token') {
        const buf = (streamBufRef.current[msg.agent] ?? '') + msg.content
        streamBufRef.current[msg.agent] = buf
        setAgentStatus(s => ({ ...s, [msg.agent]: 'speaking' }))
        setMessages(prev => prev.map(m => m.id === `mr-${msg.agent}` ? { ...m, content: buf } : m))
      } else if (msg.type === 'agent_done') {
        setAgentStatus(s => ({ ...s, [msg.agent]: 'done' }))
        setMessages(prev => prev.map(m => m.id === `mr-${msg.agent}` ? { ...m, done: true, cost: msg.cost } : m))
        delete streamBufRef.current[msg.agent]
      } else if (msg.type === 'agent_error') {
        setAgentStatus(s => ({ ...s, [msg.agent]: 'error' }))
        setMessages(prev => prev.filter(m => m.id !== `mr-${msg.agent}`).concat([{
          id: `mr-err-${msg.agent}`, role: msg.agent as AgentId, content: '', done: true, error: msg.error,
        }]))
      } else if (msg.type === 'mesa_redonda_done') {
        setIsRunning(false)
        ws.close()
        setTimeout(() => {
          setAgentStatus(s => {
            const next = { ...s }
            for (const k of Object.keys(next) as AgentId[]) {
              if (next[k] === 'done') next[k] = 'idle'
            }
            return next
          })
        }, 1500)
      }
    }
    ws.onclose = () => setIsRunning(false)
    ws.send(JSON.stringify({ tese, briefing, agents }))
  }, [])

  return {
    messages, agentStatus, isRunning, agentProgress, agentProgressMeta,
    loopMode, setLoopMode, loopMaxTurnos, setLoopMaxTurnos,
    loopCustoCap, setLoopCustoCap, loopActive, loopTurn, loopCost, loopStatus,
    send, reset, abort, loopStop, mesaRedonda,
  }
}
