import { API_URL } from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface BriefingReversoResponse {
  resultado: string
  custo_total_usd: number
}

export interface CortesResponse {
  cortes: string
  custo_total_usd: number
}

export interface Session {
  session_id: string
  timestamp: string
  briefing: string
  agentes_usados: string[]
  custo_total_usd: number
  avaliacao: number | null
  origem: string
}

export interface SessionOption {
  session_id: string
  briefing: string
}

export interface FeedbackEntry {
  id: string
  session_id: string
  elemento: string
  predicao_ia: string
  feedback_real: string
  nota_acerto: number
  created_at: string
}

export interface CalibragensData {
  registros: FeedbackEntry[]
  media_acerto: number | null
  total: number
}

export interface CalibragensPayload {
  session_id: string
  elemento: string
  predicao_ia: string
  feedback_real: string
  nota_acerto: number
}

export interface ShareData {
  token: string
  session_id: string
  briefing: string
  agentes_usados: string[]
  respostas: Record<string, string>
  comentarios: Array<{ autor: string; texto: string; created_at: string }>
}

export interface ComentarPayload {
  autor: string
  texto: string
}

// ─── Utilitário interno ───────────────────────────────────────────────────────

async function apiFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${input}`, init)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

/** POST /briefing_reverso */
export async function fetchBriefingReverso(
  transcricao: string,
): Promise<BriefingReversoResponse> {
  return apiFetch<BriefingReversoResponse>('/briefing_reverso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcricao }),
  })
}

/** POST /cortes_prontos */
export async function fetchCortesProntos(
  transcricao: string,
  duracoes: number[],
): Promise<CortesResponse> {
  return apiFetch<CortesResponse>('/cortes_prontos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcricao, duracoes }),
  })
}

/** GET /historico */
export async function fetchHistorico(): Promise<Session[]> {
  return apiFetch<Session[]>('/historico')
}

/** GET /calibragem_pedro */
export async function fetchCalibragemPedro(): Promise<CalibragensData> {
  return apiFetch<CalibragensData>('/calibragem_pedro')
}

/** POST /calibragem_pedro */
export async function postCalibragemPedro(
  payload: CalibragensPayload,
): Promise<void> {
  await apiFetch<unknown>('/calibragem_pedro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

/** GET /share/:token.json */
export async function fetchShare(token: string): Promise<ShareData> {
  return apiFetch<ShareData>(`/share/${token}.json`)
}

/** POST /share/:token/comentar */
export async function postComentario(
  token: string,
  payload: ComentarPayload,
): Promise<void> {
  await apiFetch<unknown>(`/share/${token}/comentar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
