'use client'
/**
 * T139 Sprint 2 — Hook do auto-roteador.
 *
 * Chama GET /sugerir_pipeline?briefing=... e expõe a sugestão da IA pro caller.
 * Quem chama (page.tsx) usa essa sugestão pra popular o set de agentes e
 * disparar o pipeline automaticamente — sem o cliente ter que escolher.
 *
 * T156: discriminated union no retorno pra distinguir erro de rede (backend
 * offline) de erro de aplicação (HTTP 5xx). UI mostra mensagens diferentes
 * pra cada caso — leigo precisa saber que pode resolver reabrindo o sistema.
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

export type SugerirResult =
  | { ok: true; sugestao: SugestaoPipeline }
  | { ok: false; kind: 'network' | 'http' | 'unknown'; message: string }

export function useAutoRouter() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sugerir = useCallback(async (briefing: string): Promise<SugerirResult | null> => {
    if (!briefing.trim()) return null
    setLoading(true)
    setError(null)
    try {
      const url = `${API_URL}/sugerir_pipeline?briefing=${encodeURIComponent(briefing)}`
      let resp: Response
      try {
        resp = await fetch(url)
      } catch (netErr: any) {
        // TypeError do fetch = falha de rede (backend caiu, sem internet, CORS, etc.)
        const msg = 'O servidor do sistema parece estar fora do ar. Verifique se a janela do Terminal "Iniciar Agentes de Conteúdo" ainda está aberta — se não, abra de novo pelo Desktop.'
        setError(msg)
        return { ok: false, kind: 'network', message: msg }
      }
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({}))
        const msg = detail.detail || `Erro do servidor (HTTP ${resp.status}). Tente em alguns segundos.`
        setError(msg)
        return { ok: false, kind: 'http', message: msg }
      }
      const data = await resp.json()
      return {
        ok: true,
        sugestao: {
          agentes: (data.agentes ?? []) as AgentId[],
          razoes: data.razoes ?? {},
          custo_estimado_usd: data.custo_estimado_usd ?? null,
          motivo_vazio: data.motivo_vazio ?? '',
        },
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Falha inesperada ao consultar o roteador. Tente de novo.'
      setError(msg)
      return { ok: false, kind: 'unknown', message: msg }
    } finally {
      setLoading(false)
    }
  }, [])

  return { sugerir, loading, error }
}
