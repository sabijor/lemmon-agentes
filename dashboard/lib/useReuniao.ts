'use client'
import { useCallback, useRef, useState } from 'react'
import { type AgentId } from './agents'
import { type Message, type AgentStatus } from './useChat'
import { WS_URL } from './api'

const DEFAULT_STATUS = (): Record<AgentId, AgentStatus> => ({
  otto: 'idle', heitor: 'idle', salles: 'idle', sonia: 'idle', aya: 'idle',
})

export function useReuniao() {
  const [messages, setMessages] = useState<Message[]>([])
  const [agentStatus, setAgentStatus] = useState<Record<AgentId, AgentStatus>>(DEFAULT_STATUS())
  const [isRunning, setIsRunning] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const streamBufRef = useRef<Record<string, string>>({})
  // Client-side history — survives WS reconnections
  const histRef = useRef<Array<{ role: string; content: string }>>([])

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
          // Add thinking placeholder immediately so user sees something
          streamBufRef.current[msg.agent] = ''
          setAgentStatus(s => ({ ...s, [msg.agent]: 'thinking' }))
          setMessages(prev => [...prev, {
            id: `thinking-${msg.agent}`,
            role: msg.agent as AgentId,
            content: '',
            done: false,
          }])

        } else if (msg.type === 'token') {
          const buf = (streamBufRef.current[msg.agent] ?? '') + msg.content
          streamBufRef.current[msg.agent] = buf
          setAgentStatus(s => ({ ...s, [msg.agent]: 'speaking' }))
          setMessages(prev => {
            const idx = prev.findIndex(m => m.id === `thinking-${msg.agent}`)
            if (idx !== -1) {
              const updated = [...prev]
              updated[idx] = { ...updated[idx], content: buf }
              return updated
            }
            // fallback
            let sIdx = -1
            for (let i = prev.length - 1; i >= 0; i--) {
              if (prev[i].role === msg.agent && !prev[i].done) { sIdx = i; break }
            }
            if (sIdx !== -1) {
              const updated = [...prev]
              updated[sIdx] = { ...updated[sIdx], content: buf }
              return updated
            }
            return [...prev, {
              id: `reun-${msg.agent}-${Date.now()}`,
              role: msg.agent as AgentId,
              content: buf,
              done: false,
            }]
          })

        } else if (msg.type === 'agent_done') {
          const finalText = streamBufRef.current[msg.agent] ?? ''
          // Persist agent response in client-side history
          histRef.current = [...histRef.current, { role: msg.agent, content: finalText }]
          setAgentStatus(s => ({ ...s, [msg.agent]: 'done' }))
          setMessages(prev => prev.map(m =>
            m.id === `thinking-${msg.agent}` || (m.role === msg.agent && !m.done)
              ? { ...m, done: true, cost: msg.cost }
              : m
          ))
          delete streamBufRef.current[msg.agent]

        } else if (msg.type === 'agent_error') {
          setAgentStatus(s => ({ ...s, [msg.agent]: 'error' }))
          setMessages(prev => {
            // Remove thinking placeholder and replace with error
            const filtered = prev.filter(m => m.id !== `thinking-${msg.agent}`)
            return [...filtered, {
              id: `err-${msg.agent}-${Date.now()}`,
              role: msg.agent as AgentId,
              content: '',
              done: true,
              error: msg.error,
            }]
          })

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

      ws.onclose = () => { setIsRunning(false) }
      wsRef.current = ws
      if (ws.readyState === WebSocket.OPEN) resolve(ws)
      else ws.onopen = () => resolve(ws)
    })
  }, [])

  const send = useCallback(async (agents: AgentId[], message: string, manual = false) => {
    setIsRunning(true)
    setMessages(prev => [...prev, {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      done: true,
    }])

    const historico_anterior = [...histRef.current]
    histRef.current = [...histRef.current, { role: 'user', content: message }]

    const ws = await getOrCreateWs()
    ws.send(JSON.stringify({ agents, message, historico_anterior, manual }))
  }, [getOrCreateWs])

  const reset = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'reset' }))
    }
    histRef.current = []
    setMessages([])
    setAgentStatus(DEFAULT_STATUS())
    setIsRunning(false)
  }, [])

  const abort = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setIsRunning(false)
    setAgentStatus(s => {
      const next = { ...s }
      for (const k of Object.keys(next) as AgentId[]) {
        if (next[k] === 'thinking' || next[k] === 'speaking') next[k] = 'error'
      }
      return next
    })
  }, [])

  return { messages, agentStatus, isRunning, send, reset, abort }
}
