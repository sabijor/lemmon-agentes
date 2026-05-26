'use client'
/**
 * T139 Sprint 2 — Hook do auto-roteador.
 *
 * Chama GET /sugerir_pipeline?briefing=... e expõe a sugestão da IA pro caller.
 * Quem chama (page.tsx) usa essa sugestão pra popular o set de agentes e
 * disparar o pipeline automaticamente — sem o cliente ter que escolher.
 */
import { useCallback, useState } from 'react'

import { API_URL } from '@/lib/api'
import type { AgentId } from '@/lib/agents'

export interface SugestaoPipeline {
  agentes: AgentId[]
  razoes: Record<string, string>
  custo_estimado_usd: number | null
  motivo_vazio: string
}

export function useAutoRouter() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sugerir = useCallback(async (briefing: string): Promise<SugestaoPipeline | null> => {
    if (!briefing.trim()) return null
    setLoading(true)
    setError(null)
    try {
      const url = `${API_URL}/sugerir_pipeline?briefing=${encodeURIComponent(briefing)}`
      const resp = await fetch(url)
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}))
        throw new Error(detail.detail || `Erro HTTP ${resp.status}`)
      }
      const data = await resp.json()
      return {
        agentes: (data.agentes ?? []) as AgentId[],
        razoes: data.razoes ?? {},
        custo_estimado_usd: data.custo_estimado_usd ?? null,
        motivo_vazio: data.motivo_vazio ?? '',
      }
    } catch (e: any) {
      setError(e?.message ?? 'Falha ao consultar o roteador')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { sugerir, loading, error }
}
