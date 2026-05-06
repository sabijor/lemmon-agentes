export type AgentId = 'otto' | 'heitor' | 'salles' | 'sonia' | 'aya' | 'pedro_abrahao'

export interface AgentConfig {
  id: AgentId
  name: string
  title: string
  rpgClass: string
  color: string
  colorDim: string
  colorText: string
  deskPosition: { x: number; y: number }
  meetingPosition: { x: number; y: number }
  idleQuote: string
  reuniaoOnly?: boolean
}

export const AGENTS: AgentConfig[] = [
  {
    id: 'otto',
    name: 'Otto',
    title: 'Estrategista',
    rpgClass: 'Analista',
    color: '#1e40af',
    colorDim: '#dbeafe',
    colorText: '#fff',
    deskPosition: { x: 120, y: 80 },
    meetingPosition: { x: 460, y: 210 },
    idleQuote: 'Decodificando o briefing...',
  },
  {
    id: 'heitor',
    name: 'Heitor',
    title: 'Compliance',
    rpgClass: 'Guardião',
    color: '#4d7c0f',
    colorDim: '#ecfccb',
    colorText: '#fff',
    deskPosition: { x: 260, y: 80 },
    meetingPosition: { x: 520, y: 230 },
    idleQuote: 'Monitorando as diretrizes Meta...',
  },
  {
    id: 'salles',
    name: 'Salles',
    title: 'Roteirista',
    rpgClass: 'Criativo',
    color: '#9a3412',
    colorDim: '#ffedd5',
    colorText: '#fff',
    deskPosition: { x: 120, y: 200 },
    meetingPosition: { x: 480, y: 270 },
    idleQuote: 'Transformando teses em roteiros...',
  },
  {
    id: 'sonia',
    name: 'Sônia',
    title: 'Performance',
    rpgClass: 'Growth',
    color: '#7c3aed',
    colorDim: '#ede9fe',
    colorText: '#fff',
    deskPosition: { x: 260, y: 200 },
    meetingPosition: { x: 540, y: 250 },
    idleQuote: 'Analisando métricas e tendências...',
  },
  {
    id: 'aya',
    name: 'Aya',
    title: 'Compiladora',
    rpgClass: 'Oráculo',
    color: '#18181b',
    colorDim: '#f4f4f5',
    colorText: '#fff',
    deskPosition: { x: 340, y: 140 },
    meetingPosition: { x: 500, y: 220 },
    idleQuote: 'Compilando e conectando os fluxos...',
  },
  {
    id: 'pedro_abrahao',
    name: 'Pedro',
    title: 'Consultor',
    rpgClass: 'Cliente',
    color: '#0f766e',
    colorDim: '#ccfbf1',
    colorText: '#fff',
    deskPosition: { x: 400, y: 140 },
    meetingPosition: { x: 440, y: 260 },
    idleQuote: 'Avaliando pela ótica do paciente...',
    reuniaoOnly: true,
  },
]

export const AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.id, a])) as Record<AgentId, AgentConfig>
