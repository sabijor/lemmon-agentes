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
  tipo: 'pergunta' | 'pronto'
  conteudo: string
  briefing_refinado: string | null
  dimensoes_completas: string[]
  dimensoes_faltando: string[]
  agentes_sugeridos: string[]
  razoes_agentes: Record<string, string>
  ferramentas_extras: string[]
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
        const errText = await res.text().catch(() => 'erro desconhecido')
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`)
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
