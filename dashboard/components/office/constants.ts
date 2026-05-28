import type { AgentId } from '@/lib/agents'

// ─── Meeting room themes per cliente espelho ─────────────────────────
export interface MeetingTheme { floor: string[]; glow: string; screenAccent: string; wallTone: string }
export const MEETING_THEMES: Record<string, MeetingTheme> = {
  pedro_abrahao: {
    floor: ['#0d4440', '#0a3a37', '#10524e', '#083530', '#0e4e4a', '#0d5450'],
    glow: '#0f766e',
    screenAccent: '#14b8a6',
    wallTone: '#0f766e',
  },
  // Future clients added here automatically via onboard_cliente.py
}
export const DEFAULT_THEME: MeetingTheme = {
  floor: ['#7c1d1d', '#6b1818', '#8b2020', '#5c1414', '#701c1c', '#7c2020'],
  glow: '#fbbf24',
  screenAccent: '#3b82f6',
  wallTone: '#9a6030',
}
export function getMeetingTheme(clientId: string): MeetingTheme {
  return MEETING_THEMES[clientId] ?? DEFAULT_THEME
}

// ─── Work room constants ──────────────────────────────────────────────
export const TW = 64, TH = 32, WH = 96
export const OX = 420, OY = 120
export const COLS = 14, ROWS = 10
export const sx = (gx: number, gy: number) => OX + (gx - gy) * (TW / 2)
export const sy = (gx: number, gy: number) => OY + (gx + gy) * (TH / 2)

// ─── Meeting room constants ────────────────────────────────────────────
export const MEET_OX = 1560, MEET_OY = 120
export const MEET_COLS = 12, MEET_ROWS = 9
export const msx = (gx: number, gy: number) => MEET_OX + (gx - gy) * (TW / 2)
export const msy = (gx: number, gy: number) => MEET_OY + (gx + gy) * (TH / 2)
export const CAMERA_MEETING = 1128

// ─── Reception room constants ─────────────────────────────────────────
export const RECEP_OX = -480, RECEP_OY = 180
export const RECEP_COLS = 8, RECEP_ROWS = 7
export const rsx = (gx: number, gy: number) => RECEP_OX + (gx - gy) * (TW / 2)
export const rsy = (gx: number, gy: number) => RECEP_OY + (gx + gy) * (TH / 2)
export const CAMERA_RECEP = -944

// ─── Roles ───────────────────────────────────────────────────────────
export const ROLES: Record<AgentId, string> = {
  otto: 'Estrateg.',
  heitor: 'Complian.',
  salles: 'Produtor',
  carlos: 'Roteiri.',
  sonia: 'Perform.',
  aya: 'Assistente',
  pedro_abrahao: 'Consultor',
  renata: 'Social Media',
  // Administrativo Hator
  ana_maria: 'CFO',
  prichina: 'Admin/RH',
  caito: 'COO',
  kelly: 'Contábil',
}

// ─── Idle speech quotes ──────────────────────────────────────────────
export const IDLE_QUOTES: Record<AgentId, string[]> = {
  otto:   ['Os dados indicam...', 'Hipótese validada.', 'Q3 up 18%.', 'Revisando briefing.'],
  heitor: ['Risco: amarelo.', 'Revisar antes de pub.', '⚠ Termo crítico.', 'Monitorando...'],
  salles: ['Isso tem alma.', 'Direção: recuar.', 'Pausa antes da fala.', 'Captação no set.'],
  carlos: ['Hook em 3s.', 'CTA direto.', 'Variação A/B.', 'Cola na primeira frase.'],
  sonia:  ['CTR +23%!', 'Novo criativo: GO!', 'ROI aprovado!', 'Métricas no verde!'],
  aya:    ['Compilando outputs.', 'Dossiê pronto.', 'Fluxos conectados.', 'Processando...'],
  pedro_abrahao: ['Faz sentido pra mim.', 'Como paciente...', 'Isso ressoa.', 'Autenticidade.'],
  renata: ['Costurando narrativa...', 'Post-its no ar.', 'Calendário pronto.', 'Dia 1 lançado!'],
  ana_maria: ['Fluxo positivo.', 'DSO em 18 dias.', 'Margem em 32%.', 'Reservei pro IRPJ.'],
  prichina:  ['Banco de horas ok.', 'NF emitida.', 'Atestado conferido.', 'DCTFWeb pago.'],
  caito:     ['Apagando fogo.', 'Cruzando indicadores.', '3 caminhos pro Calebe.', 'Decisão sua.'],
  kelly:     ['Presunção 8%.', 'Art. 9.249/95.', 'Distribuir lucro isento.', 'Elisão, não evasão.'],
}
