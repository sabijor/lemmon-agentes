/**
 * PROD-FIN v1.47 — hook de planilha financeira.
 * Wrappa endpoints do backend (/financeiro/upload, /listar, /resumo, /analisar).
 */
import { useCallback, useState } from 'react'
import { API_URL } from '@/lib/api'

export interface PlanilhaMeta {
  file_id: string
  filename_original: string
  filename_safe: string
  uploaded_at: string
  tamanho_bytes: number
  hash_sha256: string
  cifrado: boolean
  formato: string
  sheet: string
  total_linhas: number
  truncada: boolean
  colunas: string[]
}

export interface ResumoEstrutural {
  formato: string
  sheet: string
  colunas: string[]
  total_linhas: number
  linhas_carregadas: number
  truncada: boolean
  tamanho_bytes: number
  hash_sha256: string
  amostra: Record<string, unknown>[]
  candidatos_colunas: Record<string, string[]>
}

export interface AnaliseResultado {
  ok: boolean
  file_id: string
  analise: string
  custo_usd: number
  meta: PlanilhaMeta
}

interface UploadResposta {
  ok: boolean
  file_id: string
  resumo: ResumoEstrutural
  cifrado: boolean
  aviso: string | null
}

export function useFinanceiro() {
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(async (file: File): Promise<UploadResposta | null> => {
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', file)
      const res = await fetch(`${API_URL}/financeiro/upload`, {
        method: 'POST',
        body: fd,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = (data as { detail?: string }).detail || `HTTP ${res.status}`
        throw new Error(detail)
      }
      return (await res.json()) as UploadResposta
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setUploading(false)
    }
  }, [])

  const listar = useCallback(async (): Promise<PlanilhaMeta[]> => {
    try {
      const res = await fetch(`${API_URL}/financeiro/listar`)
      if (!res.ok) return []
      const data = (await res.json()) as { total: number; planilhas: PlanilhaMeta[] }
      return data.planilhas
    } catch {
      return []
    }
  }, [])

  const analisar = useCallback(async (fileId: string): Promise<AnaliseResultado | null> => {
    setAnalyzing(true)
    setError(null)
    try {
      const res = await fetch(`${API_URL}/financeiro/${fileId}/analisar`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const detail = (data as { detail?: string }).detail || `HTTP ${res.status}`
        throw new Error(detail)
      }
      return (await res.json()) as AnaliseResultado
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setAnalyzing(false)
    }
  }, [])

  return { upload, listar, analisar, uploading, analyzing, error }
}
