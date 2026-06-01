/**
 * T186.b — Hook do Concierge (orquestrador conversacional).
 *
 * Diferente do useAutoRouter (que chama /sugerir_pipeline direto), este hook
 * conversa com o Concierge ANTES de mobilizar a equipe:
 *  - Manda histórico de mensagens pra POST /concierge/conversar
 *  - Se tipo=pergunta: mostra pergunta no chat, espera resposta do user
 *  - Se tipo=pronto: dispara pipeline com briefing_refinado + agentes_sugeridos
 */
import { useCallback, useState } from 'react'
import { API_URL } from '@/lib/api'

export interface ConciergeMsg {
  role: 'user' | 'concierge'
  content: string
  // T186.c — imagem opcional anexa (base64 + media type)
  image_base64?: string
  image_media_type?: string
}

export interface ConciergeResposta {
  // T188.a — "confirmar" é o estado intermediário entre pergunta e pronto.
  // Concierge propõe equipe + razões e espera o user dizer "OK" antes de mobilizar.
  tipo: 'pergunta' | 'confirmar' | 'pronto'
  conteudo: string
  briefing_refinado: string | null
  dimensoes_completas: string[]
  dimensoes_faltando: string[]
  agentes_sugeridos: string[]
  razoes_agentes: Record<string, string>
  ferramentas_extras: string[]
  // T188.e — custo estimado em USD (soma custo_medio_usd dos sugeridos)
  custo_estimado_usd?: number
}

export function useConcierge() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conversar = useCallback(async (historico: ConciergeMsg[]): Promise<ConciergeResposta | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/concierge/conversar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico }),
      })
      if (!res.ok) {
        // T193.b — backend agora retorna status apropriado (402/429/401/503) +
        // mensagem amigável em `detail`. Extrai e propaga em vez de stringificar HTTP.
        const data = await res.json().catch(() => ({}))
        const detail = (data as { detail?: string }).detail || `HTTP ${res.status}`
        // Anexa código pro caller decidir se mostra ação específica
        // (ex: 402 → link pra console.anthropic.com).
        const err = new Error(detail) as Error & { status?: number; kind?: string }
        err.status = res.status
        err.kind = res.status === 402 ? 'sem_credito'
                 : res.status === 429 ? 'rate_limit'
                 : res.status === 401 ? 'auth'
                 : res.status === 503 ? 'conexao'
                 : 'outro'
        throw err
      }
      return (await res.json()) as ConciergeResposta
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { conversar, loading, error }
}
