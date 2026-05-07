'use client'
import { useCallback, useState } from 'react'
import { API_URL } from './api'

export interface HistoryItem {
  session_id: string
  timestamp: string
  briefing: string
  agentes_usados: string[]
  custo_total_usd: number
  avaliacao: number | null
  favorito?: boolean
  origem?: 'dashboard' | 'reuniao'
}

export interface HistoryDetail extends HistoryItem {
  origem?: 'dashboard' | 'reuniao'
  respostas: Record<string, string>
  custos_usd: Record<string, number>
  duracoes_segundos?: Record<string, number>
  observacoes_operador: string
  tags: string[]
  historico?: Array<{ role: string; content: string }>
}

export function useHistory() {
  const [sessions, setSessions] = useState<HistoryItem[]>([])
  const [selected, setSelected] = useState<HistoryDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/historico`)
      setSessions(await res.json())
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (sessionId: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`${API_URL}/historico/${sessionId}`)
      setSelected(await res.json())
    } catch {
      // silencioso
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const clearSelected = useCallback(() => setSelected(null), [])

  return { sessions, selected, loading, loadingDetail, fetchSessions, fetchDetail, clearSelected }
}
