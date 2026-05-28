export type AgentId = 'otto' | 'heitor' | 'salles' | 'carlos' | 'sonia' | 'aya' | 'pedro_abrahao' | 'renata' | 'ana_maria' | 'prichina' | 'caito' | 'kelly'

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
  /** T175 — em qual sala o agente tem mesa. Default 'creative'. */
  room?: 'creative' | 'admin'
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
    title: 'Produtor',
    rpgClass: 'Diretor',
    color: '#9a3412',
    colorDim: '#ffedd5',
    colorText: '#fff',
    deskPosition: { x: 120, y: 200 },
    meetingPosition: { x: 480, y: 270 },
    idleQuote: 'Dirigindo a captação...',
  },
  {
    id: 'carlos',
    name: 'Carlos',
    title: 'Roteirista',
    rpgClass: 'Copywriter',
    color: '#0369a1',
    colorDim: '#e0f2fe',
    colorText: '#fff',
    deskPosition: { x: 180, y: 220 },
    meetingPosition: { x: 470, y: 280 },
    idleQuote: 'Escrevendo o hook que prende em 3s...',
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
    rpgClass: 'Consultor',
    color: '#0f766e',
    colorDim: '#ccfbf1',
    colorText: '#fff',
    deskPosition: { x: 400, y: 140 },
    meetingPosition: { x: 440, y: 260 },
    idleQuote: 'Avaliando pela ótica do paciente...',
    reuniaoOnly: true,
  },
  {
    id: 'renata',
    name: 'Renata',
    title: 'Social Media',
    rpgClass: 'Comunicadora',
    color: '#e11d48',
    colorDim: '#ffe4e6',
    colorText: '#fff',
    deskPosition: { x: 180, y: 140 },
    meetingPosition: { x: 510, y: 240 },
    idleQuote: 'Costurando narrativa em calendário...',
  },
  // ── Administrativo Hator (T166-T170) ──────────────────────────────────
  {
    id: 'ana_maria',
    name: 'Ana Maria',
    title: 'CFO',
    rpgClass: 'Financeira',
    color: '#047857',
    colorDim: '#d1fae5',
    colorText: '#fff',
    deskPosition: { x: 460, y: 80 },
    meetingPosition: { x: 540, y: 220 },
    idleQuote: 'Fluxo de caixa positivo.',
    room: 'admin',
  },
  {
    id: 'prichina',
    name: 'Prichina',
    title: 'Administrativo',
    rpgClass: 'RH',
    color: '#a16207',
    colorDim: '#fef3c7',
    colorText: '#fff',
    deskPosition: { x: 540, y: 80 },
    meetingPosition: { x: 560, y: 240 },
    idleQuote: 'Conferindo ponto da semana...',
    room: 'admin',
  },
  {
    id: 'caito',
    name: 'Caíto',
    title: 'COO',
    rpgClass: 'Operações',
    color: '#7c2d12',
    colorDim: '#fed7aa',
    colorText: '#fff',
    deskPosition: { x: 500, y: 200 },
    meetingPosition: { x: 530, y: 260 },
    idleQuote: 'Apagando fogo. Qual área?',
    room: 'admin',
  },
  {
    id: 'kelly',
    name: 'Kelly',
    title: 'Contábil',
    rpgClass: 'Tributarista',
    color: '#6d28d9',
    colorDim: '#ede9fe',
    colorText: '#fff',
    deskPosition: { x: 580, y: 200 },
    meetingPosition: { x: 580, y: 260 },
    idleQuote: 'Manobra legal, art. 9.249.',
    room: 'admin',
  },
]

export const AGENT_MAP = Object.fromEntries(AGENTS.map(a => [a.id, a])) as Record<AgentId, AgentConfig>
