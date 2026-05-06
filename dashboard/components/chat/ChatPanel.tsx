'use client'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, type DragControls } from 'framer-motion'

// Web Speech API types (not in default TS lib)
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean
  start(): void; stop(): void
  onresult: ((e: { results: { length: number; [i: number]: { [i: number]: { transcript: string } } } }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}
declare const SpeechRecognition: { new(): ISpeechRecognition } | undefined
declare const webkitSpeechRecognition: { new(): ISpeechRecognition } | undefined
import { AGENT_MAP, AGENTS as AGENTS_LIST, type AgentId } from '@/lib/agents'
import { type Message, type AgentStatus, type ImageData, type ApprovalRequest, type AgentConfig, type ExportResult } from '@/lib/useChat'
import { API_URL } from '@/lib/api'
import CharacterSprite from '../office/CharacterSprite'

interface AttachedImage extends ImageData {
  preview: string
  name: string
}

interface Props {
  mode: 'pipeline' | 'reuniao'
  onToggleMode: () => void
  messages: Message[]
  agentStatus: Record<AgentId, AgentStatus>
  inMeeting: Set<AgentId>
  isRunning: boolean
  sessionId: string | null
  avaliado: boolean
  manualMode: boolean
  fastTrack: boolean
  sandbox: boolean
  custoCap: number | null
  custoCapAtingido: { total: number; cap: number } | null
  custoAviso: { total: number; cap: number; pct: number } | null
  awaitingApproval: ApprovalRequest | null
  agentConfig: AgentConfig
  onSend: (msg: string, image?: ImageData) => void
  resumedFrom?: string | null
  onReset: () => void
  onAvaliar: (nota: number, obs?: string, tags?: string[]) => void
  onApprove: (action: 'approve' | 'retry' | 'skip' | 'cancel' | 'confirmar_sim' | 'confirmar_nao') => void
  onAbort: () => void
  onToggleManualMode: () => void
  onToggleFastTrack: () => void
  onToggleSandbox: () => void
  onSetCustoCap: (v: number | null) => void
  onAutorizarCusto: (valor: number) => void
  onRecusarCustoExtra: () => void
  onUpdateConfig: <K extends keyof AgentConfig>(agent: K, patch: Partial<AgentConfig[K]>) => void
  reunMessages: Message[]
  reunAgentStatus: Record<AgentId, AgentStatus>
  reunIsRunning: boolean
  onReunSend: (agents: AgentId[], msg: string, manual?: boolean) => void
  onReunReset: () => void
  onReunAbort: () => void
  onMesaRedonda?: (agents: AgentId[], tese: string, briefing: string) => void
  onExportar?: (sessionId: string) => Promise<ExportResult>
  onClose?: () => void
  onSetInMeeting?: (agents: AgentId[]) => void
  dragControls?: DragControls
  tagsSugeridas?: string[]
}

// ─── Export ──────────────────────────────────────────────────────────
function exportTxt(messages: Message[]) {
  const lines: string[] = ['LEMMON PRODUÇÕES — Relatório de Sessão', '='.repeat(50), '']
  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('VOCÊ:', msg.content, '')
    } else {
      const agent = AGENT_MAP[msg.role as AgentId]
      if (agent) {
        lines.push(`${agent.name.toUpperCase()} | ${agent.title}:`)
        lines.push(msg.content)
        if (msg.cost) lines.push(`[Custo: $${msg.cost.toFixed(5)}]`)
        lines.push('')
      }
    }
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lemmon_sessao_${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Message bubbles ─────────────────────────────────────────────────
function UserMessage({ msg }: { msg: Message }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 pr-1">
        <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">Você</span>
        <div className="w-5 h-5 rounded-full bg-stone-900 flex items-center justify-center">
          <span className="text-white text-[8px] font-bold">V</span>
        </div>
      </div>
      <div className="max-w-[92%] bg-stone-900 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-sm">
        {msg.hasImage && (
          <div className="flex items-center gap-1.5 mb-2 opacity-60">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span className="text-[9px] font-mono">imagem anexada</span>
          </div>
        )}
        <p className="text-sm font-mono leading-relaxed text-stone-100 whitespace-pre-wrap">{msg.content}</p>
      </div>
    </motion.div>
  )
}

function AgentMessage({ msg }: { msg: Message }) {
  const agent = AGENT_MAP[msg.role as AgentId]
  if (!agent) return null
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex gap-3 items-start"
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm border"
        style={{ background: agent.colorDim, borderColor: `${agent.color}30` }}>
        <CharacterSprite id={agent.id} size={0.7} speaking={!msg.done} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest font-bold px-2 py-0.5 rounded-full"
            style={{ background: agent.colorDim, color: agent.color }}>
            {agent.name}
          </span>
          <span className="text-[9px] font-mono text-stone-400">{agent.rpgClass} · {agent.title}</span>
          {msg.cost !== undefined && msg.cost > 0 && (
            <span className="text-[9px] font-mono text-stone-300 ml-auto">${msg.cost.toFixed(5)}</span>
          )}
        </div>
        <div className="rounded-2xl rounded-tl-sm px-4 py-3 border shadow-sm"
          style={{ background: agent.colorDim, borderColor: `${agent.color}20` }}>
          {msg.error ? (
            <p className="text-red-600 text-xs font-mono">{msg.error}</p>
          ) : (
            <p className={`text-sm font-mono leading-relaxed whitespace-pre-wrap text-stone-800 ${!msg.done ? 'typing-cursor' : ''}`}>
              {msg.content || <span className="text-stone-400 animate-pulse">processando...</span>}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ─── Config sidebar ───────────────────────────────────────────────────
function ConfigSidebar({ agentConfig, onUpdateConfig, isRunning, custoCap, onSetCustoCap }: {
  agentConfig: AgentConfig
  onUpdateConfig: Props['onUpdateConfig']
  isRunning: boolean
  custoCap: number | null
  onSetCustoCap: (v: number | null) => void
}) {
  return (
    <div className="w-44 flex-shrink-0 border-r border-stone-200/50 flex flex-col bg-stone-50/70">
      <div className="px-3 py-2.5 border-b border-stone-200/40">
        <span className="text-[9px] font-mono uppercase tracking-widest text-stone-400">Configurações</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
        {/* Otto */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.otto?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Otto</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">modo visual</p>
          <div className="flex flex-col gap-1">
            {(['completo', 'resumido', 'minimo'] as const).map(v => (
              <button key={v} disabled={isRunning} onClick={() => onUpdateConfig('otto', { modo_visual: v })}
                className={`px-2 py-1 rounded-md text-[9px] font-mono border transition-all text-left disabled:opacity-50 ${
                  agentConfig.otto.modo_visual === v
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                }`}>{v}</button>
            ))}
          </div>
        </div>

        {/* Heitor */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.heitor?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Heitor</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">buscas: {agentConfig.heitor.max_buscas}</p>
          <input type="range" min={1} max={10} value={agentConfig.heitor.max_buscas}
            disabled={isRunning}
            onChange={e => onUpdateConfig('heitor', { max_buscas: Number(e.target.value) })}
            className="w-full accent-stone-900 disabled:opacity-50" />
          <div className="flex justify-between mt-0.5">
            <span className="text-[8px] font-mono text-stone-300">1</span>
            <span className="text-[8px] font-mono text-stone-300">10</span>
          </div>
        </div>

        {/* Salles */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.salles?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Salles</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">formato</p>
          <div className="flex flex-col gap-1 mb-3">
            {(['auto', 'reels', 'documental', 'mini-doc', 'tese', 'aftermovie'] as const).map(v => (
              <button key={v} disabled={isRunning} onClick={() => onUpdateConfig('salles', { formato: v })}
                className={`px-2 py-1 rounded-md text-[9px] font-mono border transition-all text-left disabled:opacity-50 ${
                  agentConfig.salles.formato === v
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                }`}>{v}</button>
            ))}
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">gate espelho pedro</p>
          <div className="flex flex-col gap-1 mb-3">
            {(['off', 'auto', 'manual'] as const).map(v => (
              <button key={v} disabled={isRunning} onClick={() => onUpdateConfig('salles', { gate_espelho: v })}
                className={`px-2 py-1 rounded-md text-[9px] font-mono border transition-all text-left disabled:opacity-50 ${
                  agentConfig.salles.gate_espelho === v
                    ? 'bg-stone-900 text-white border-stone-900'
                    : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                }`}>
                {v === 'off' ? 'off — sem gate' : v === 'auto' ? 'auto — bloqueia se 🔴' : 'manual — sempre pede OK'}
              </button>
            ))}
          </div>
          <button disabled={isRunning}
            onClick={() => onUpdateConfig('salles', { alternativas: agentConfig.salles.alternativas === 3 ? 0 : 3 })}
            className="flex items-center gap-2 disabled:opacity-50">
            <div className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${
              agentConfig.salles.alternativas === 3 ? 'bg-stone-900' : 'bg-stone-200'
            }`}>
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                agentConfig.salles.alternativas === 3 ? 'translate-x-3.5' : 'translate-x-0.5'
              }`} />
            </div>
            <span className="text-[9px] font-mono text-stone-500">3 variantes A/B</span>
          </button>
        </div>

        {/* Sônia */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_MAP.sonia?.color ?? '#888' }} />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Sônia</span>
          </div>
          <div className="flex flex-col gap-2">
            {([
              { label: 'busca web', key: 'com_busca' as const },
              { label: 'tendências', key: 'usar_tendencias' as const },
            ]).map(({ label, key }) => (
              <button key={key} disabled={isRunning} onClick={() => onUpdateConfig('sonia', { [key]: !agentConfig.sonia[key] })}
                className="flex items-center gap-2 disabled:opacity-50">
                <div className={`w-7 h-4 rounded-full transition-colors relative flex-shrink-0 ${
                  agentConfig.sonia[key] ? 'bg-stone-900' : 'bg-stone-200'
                }`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
                    agentConfig.sonia[key] ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
                </div>
                <span className="text-[9px] font-mono text-stone-500">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custo-cap */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 font-bold">Custo-cap</span>
          </div>
          <p className="text-[8px] font-mono text-stone-400 mb-1.5">limite USD por sessão</p>
          <div className="flex gap-1 items-center">
            <input
              type="number"
              min="0"
              step="0.10"
              placeholder="sem limite"
              value={custoCap ?? ''}
              disabled={isRunning}
              onChange={e => {
                const v = parseFloat(e.target.value)
                onSetCustoCap(isNaN(v) || v <= 0 ? null : v)
              }}
              className="flex-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-[9px] font-mono text-stone-700
                placeholder:text-stone-300 focus:outline-none focus:border-stone-400 disabled:opacity-50 min-w-0"
            />
            {custoCap !== null && (
              <button onClick={() => onSetCustoCap(null)} disabled={isRunning}
                className="text-stone-400 hover:text-stone-700 transition-colors text-[10px] flex-shrink-0 disabled:opacity-50">×</button>
            )}
          </div>
          {custoCap !== null && (
            <p className="text-[8px] font-mono text-emerald-600 mt-1">cap: ${custoCap.toFixed(2)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main panel ──────────────────────────────────────────────────────
export default function ChatPanel({
  mode, onToggleMode,
  messages, agentStatus, inMeeting, isRunning, sessionId, avaliado, resumedFrom,
  manualMode, fastTrack, sandbox, custoCap, custoCapAtingido, custoAviso, awaitingApproval, agentConfig, dragControls,
  onSend, onReset, onAvaliar, onApprove, onAbort, onToggleManualMode, onToggleFastTrack, onToggleSandbox,
  onSetCustoCap, onAutorizarCusto, onRecusarCustoExtra, onUpdateConfig,
  reunMessages, reunAgentStatus, reunIsRunning, onReunSend, onReunReset, onReunAbort,
  onMesaRedonda,
  onExportar, onClose, onSetInMeeting,
  tagsSugeridas = [],
}: Props) {
  // Mode-aware aliases
  const activeMessages    = mode === 'reuniao' ? reunMessages    : messages
  const activeAgentStatus = mode === 'reuniao' ? reunAgentStatus : agentStatus
  const activeIsRunning   = mode === 'reuniao' ? reunIsRunning   : isRunning
  const activeAbort       = mode === 'reuniao' ? onReunAbort     : onAbort

  const [input, setInput] = useState('')
  const [minimized, setMinimized] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [reuniaoManual, setReuniaoManual] = useState(false)
  const [reuniaoRating, setReuniaoRating] = useState(0)
  const [tagsAceitas, setTagsAceitas] = useState<string[]>([])
  const [sugestao, setSugestao] = useState<{ agentes: AgentId[]; razoes: Record<string, string> } | null>(null)
  const [loadingSugestao, setLoadingSugestao] = useState(false)

  useEffect(() => { setTagsAceitas(tagsSugeridas) }, [tagsSugeridas])

  const sugerirPipeline = async () => {
    const q = input.trim()
    if (!q || loadingSugestao) return
    setLoadingSugestao(true)
    setSugestao(null)
    try {
      const res = await fetch(`${API_URL}/sugerir_pipeline?briefing=${encodeURIComponent(q)}`)
      const data = await res.json()
      setSugestao(data)
    } catch {
      setSugestao(null)
    } finally {
      setLoadingSugestao(false)
    }
  }

  const activeReset = mode === 'reuniao' ? () => { onReunReset(); setReuniaoRating(0) } : onReset
  // @mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionCursor, setMentionCursor] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [referencias, setReferencias] = useState<null | Array<{ session_id: string; briefing: string; avaliacao: number | null; score: number }>>(null)
  const [loadingRefs, setLoadingRefs] = useState(false)
  const [panelSize, setPanelSize] = useState(() => ({
    w: 460,
    h: typeof window !== 'undefined' ? Math.min(Math.max(480, window.innerHeight - 160), 640) : 560,
  }))
  const panelSizeRef = useRef(panelSize)
  useEffect(() => { panelSizeRef.current = panelSize }, [panelSize])

  const resizeHandlers = useRef<{ move: ((e: PointerEvent) => void) | null; end: (() => void) | null }>({ move: null, end: null })

  const startResize = (e: React.PointerEvent, edge: string) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX, startY = e.clientY
    const { w: startW, h: startH } = panelSizeRef.current

    resizeHandlers.current.move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      setPanelSize({
        w: edge.includes('e') ? Math.max(360, startW + dx) : edge.includes('w') ? Math.max(360, startW - dx) : startW,
        h: edge.includes('s') ? Math.max(220, startH + dy) : startH,
      })
    }

    resizeHandlers.current.end = () => {
      if (resizeHandlers.current.move) window.removeEventListener('pointermove', resizeHandlers.current.move)
      if (resizeHandlers.current.end) window.removeEventListener('pointerup', resizeHandlers.current.end)
      resizeHandlers.current = { move: null, end: null }
    }

    window.addEventListener('pointermove', resizeHandlers.current.move)
    window.addEventListener('pointerup', resizeHandlers.current.end)
  }
  const [exportState, setExportState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [exportResult, setExportResult] = useState<ExportResult | null>(null)

  useEffect(() => {
    setExportState('idle')
    setExportResult(null)
  }, [sessionId])

  const handleExportar = async () => {
    if (!sessionId || !onExportar) return
    setExportState('loading')
    try {
      const r = await onExportar(sessionId)
      setExportResult(r)
      setExportState(r.erros.length > 0 && !r.html_gerado && !r.pdf_gerado ? 'error' : 'done')
    } catch {
      setExportState('error')
      setExportResult(null)
    }
  }

  const handleDownload = async (tipo: 'html' | 'pdf', filename: string) => {
    if (!sessionId) return
    const url = `${API_URL}/download/${sessionId}/${tipo}`
    const w = window as Window & typeof globalThis & { showSaveFilePicker?: (opts: unknown) => Promise<FileSystemFileHandle> }
    if (w.showSaveFilePicker) {
      try {
        const res = await fetch(url)
        const blob = await res.blob()
        const handle = await w.showSaveFilePicker({
          suggestedName: filename,
          types: tipo === 'html'
            ? [{ description: 'HTML', accept: { 'text/html': ['.html'] } }]
            : [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        return
      } catch (e) {
        if ((e as { name?: string }).name === 'AbortError') return
      }
    }
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
  }

  const [hoveredStar, setHoveredStar] = useState(0)
  const [attachedImage, setAttachedImage] = useState<AttachedImage | null>(null)
  const [imageError, setImageError] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [noSpeechSupport, setNoSpeechSupport] = useState(false)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      setIsRecording(false)
      return
    }
    const SR = typeof SpeechRecognition !== 'undefined' ? SpeechRecognition
      : typeof webkitSpeechRecognition !== 'undefined' ? webkitSpeechRecognition
      : null
    if (!SR) { setNoSpeechSupport(true); return }
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (ev) => {
      let transcript = ''
      for (let i = 0; i < ev.results.length; i++) transcript += ev.results[i][0].transcript
      setInput(transcript)
    }
    rec.onend = () => setIsRecording(false)
    rec.onerror = () => setIsRecording(false)
    rec.start()
    recognitionRef.current = rec
    setIsRecording(true)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setImageError('Apenas imagens são suportadas.'); return }
    if (file.size > 5 * 1024 * 1024) { setImageError('Máximo 5MB por imagem.'); return }
    setImageError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setAttachedImage({ base64: dataUrl.split(',')[1], mediaType: file.type, preview: dataUrl, name: file.name })
    }
    reader.readAsDataURL(file)
  }

  const insertMention = (name: string) => {
    const el = textareaRef.current
    if (!el) return
    const cur = el.selectionStart ?? input.length
    const before = input.slice(0, cur)
    const after = input.slice(cur)
    const match = before.match(/@(\w*)$/)
    const newText = match
      ? before.slice(0, -match[0].length) + `@${name} ` + after
      : before + `@${name} ` + after
    setInput(newText)
    setMentionQuery(null)
    setTimeout(() => el.focus(), 0)
  }

  const meetingAgents = AGENTS_LIST.filter(a => inMeeting.has(a.id))

  const mentionMatches = mentionQuery !== null
    ? meetingAgents.filter(a => a.name.toLowerCase().startsWith(mentionQuery))
    : []

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    if (mode === 'reuniao') {
      const cur = e.target.selectionStart ?? val.length
      const match = val.slice(0, cur).match(/@(\w*)$/)
      setMentionQuery(match ? match[1].toLowerCase() : null)
      setMentionCursor(0)
    }
  }

  const buscarReferencias = async () => {
    const q = input.trim()
    if (!q || loadingRefs) return
    setLoadingRefs(true)
    setReferencias(null)
    try {
      const res = await fetch(`${API_URL}/historico/similar?briefing=${encodeURIComponent(q)}&n=3`)
      const data = await res.json()
      setReferencias(data)
    } catch {
      setReferencias([])
    } finally {
      setLoadingRefs(false)
    }
  }

  const dispensarTag = async (tag: string) => {
    const next = tagsAceitas.filter(t => t !== tag)
    setTagsAceitas(next)
    if (sessionId) {
      try {
        await fetch(`${API_URL}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, tags: next }),
        })
      } catch { /* silencia */ }
    }
  }

  const handleSend = () => {
    const msg = input.trim()
    setReferencias(null)
    if (!msg || activeIsRunning || inMeeting.size === 0) return
    if (mode === 'reuniao') {
      onReunSend(Array.from(inMeeting) as AgentId[], msg, reuniaoManual)
    } else {
      onSend(msg, attachedImage ? { base64: attachedImage.base64, mediaType: attachedImage.mediaType } : undefined)
    }
    setInput('')
    setAttachedImage(null)
    setImageError('')
    setMentionQuery(null)
  }

  return (
    <motion.div
      animate={{ width: panelSize.w, height: minimized ? 48 : panelSize.h }}
      transition={{ type: 'spring', stiffness: 200, damping: 30 }}
      className="flex flex-row glass border border-stone-200/60 overflow-hidden flex-shrink-0 rounded-2xl relative"
    >
      {/* Custo-cap atingido — blocking overlay */}
      {custoCapAtingido && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl">
          <div className="bg-white rounded-2xl p-6 mx-6 shadow-2xl border border-stone-200 flex flex-col gap-4 max-w-xs w-full">
            <div className="text-center">
              <div className="text-3xl mb-2">💸</div>
              <p className="text-sm font-display font-semibold text-stone-900 mb-1">Limite de custo atingido</p>
              <p className="text-[10px] font-mono text-stone-500 leading-relaxed">
                O pipeline foi pausado ao atingir o cap de{' '}
                <span className="text-stone-700 font-bold tabular-nums">${custoCapAtingido.cap.toFixed(2)}</span>.
                <br />
                Custo acumulado: <span className="text-stone-700 tabular-nums">${custoCapAtingido.total.toFixed(3)}</span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onAutorizarCusto(custoCapAtingido.cap + 0.50)}
                className="w-full py-2.5 rounded-xl bg-stone-900 text-white text-[10px] font-mono font-bold uppercase tracking-widest
                  hover:bg-stone-700 active:scale-[0.98] transition-all">
                Autorizar +$0.50 e continuar
              </button>
              <button
                onClick={() => onAutorizarCusto(custoCapAtingido.cap + 2.00)}
                className="w-full py-2.5 rounded-xl border border-stone-200 bg-white text-stone-600 text-[10px] font-mono uppercase tracking-widest
                  hover:border-stone-400 hover:bg-stone-50 active:scale-[0.98] transition-all">
                Autorizar +$2.00 e continuar
              </button>
              <button
                onClick={onRecusarCustoExtra}
                className="w-full py-2 rounded-xl text-[10px] font-mono text-red-500 hover:text-red-700 transition-colors uppercase tracking-widest">
                Encerrar pipeline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resize handles */}
      {!minimized && <>
        <div className="absolute left-0 top-6 bottom-6 w-1.5 cursor-ew-resize z-50 hover:bg-stone-300/40 rounded-full transition-colors" onPointerDown={e => startResize(e, 'w')} />
        <div className="absolute right-0 top-6 bottom-6 w-1.5 cursor-ew-resize z-50 hover:bg-stone-300/40 rounded-full transition-colors" onPointerDown={e => startResize(e, 'e')} />
        <div className="absolute bottom-0 left-6 right-6 h-1.5 cursor-ns-resize z-50 hover:bg-stone-300/40 rounded-full transition-colors" onPointerDown={e => startResize(e, 's')} />
        <div className="absolute bottom-0 left-0 w-5 h-5 cursor-nesw-resize z-50" onPointerDown={e => startResize(e, 'sw')} />
        <div className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-50 flex items-end justify-end p-1" onPointerDown={e => startResize(e, 'se')}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <line x1="8" y1="1" x2="1" y2="8" stroke="#a8a29e" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="8" y1="4" x2="4" y2="8" stroke="#a8a29e" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </div>
      </>}
      {/* Config sidebar — pipeline only, collapsible */}
      <AnimatePresence initial={false}>
        {!minimized && mode === 'pipeline' && configOpen && (
          <motion.div
            key="config"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 176, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            className="overflow-hidden flex-shrink-0"
          >
            <ConfigSidebar agentConfig={agentConfig} onUpdateConfig={onUpdateConfig} isRunning={isRunning} custoCap={custoCap} onSetCustoCap={onSetCustoCap} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header — drag handle */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-stone-200/50 flex-shrink-0 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={e => dragControls?.start(e)}
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-stone-900" />
            <span className="font-display font-semibold text-sm tracking-tight">
              {mode === 'reuniao' ? 'Reunião' : 'Pipeline'}
            </span>
            <button onClick={onToggleMode}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-widest border transition-all ${
                mode === 'reuniao'
                  ? 'bg-violet-900 border-violet-900 text-white'
                  : 'bg-white border-stone-200 text-stone-400 hover:border-stone-400'
              }`}>
              {mode === 'reuniao' ? '💬 conv.' : '▶▶ pipeline'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Agent avatars */}
            <div className="flex -space-x-1 mr-1">
              {meetingAgents.map(a => (
                <div key={a.id} className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center"
                  style={{ background: a.colorDim }} title={a.name}>
                  <CharacterSprite id={a.id} size={0.5} speaking={activeAgentStatus[a.id] === 'speaking'} />
                </div>
              ))}
            </div>

            {/* Export */}
            {activeMessages.length > 0 && (
              <button onClick={() => exportTxt(activeMessages)} title="Exportar sessão"
                className="w-7 h-7 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
              </button>
            )}

            {/* Reunião: auto/manual toggle */}
            {mode === 'reuniao' && (
              <button onClick={() => setReuniaoManual(v => !v)}
                title={reuniaoManual ? 'Modo manual: só responde se @mencionado' : 'Modo auto: todos respondem'}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-widest border transition-all ${
                  reuniaoManual
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-stone-200 text-stone-400 hover:border-stone-400'
                }`}>
                <span>{reuniaoManual ? '⏸ manual' : '▶▶ auto'}</span>
              </button>
            )}

            {/* Mesa Redonda button — reunião only */}
            {mode === 'reuniao' && onMesaRedonda && !reunIsRunning && inMeeting.size > 0 && (
              <button
                title="Mesa Redonda: escreva a tese no campo abaixo e clique aqui para que cada agente a questione"
                onClick={() => {
                  const tese = input.trim()
                  if (!tese) return
                  const briefing = reunMessages.find(m => m.role === 'user')?.content ?? ''
                  onMesaRedonda(Array.from(inMeeting) as AgentId[], tese, briefing)
                  setInput('')
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-widest border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 hover:border-stone-500 transition-all">
                ⊞ mesa
              </button>
            )}

            {/* Manual mode toggle — pipeline only */}
            {mode === 'pipeline' && <button onClick={onToggleManualMode}
              title={manualMode ? 'Modo manual ativo' : 'Modo automático'}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-widest border transition-all ${
                manualMode
                  ? 'bg-amber-50 border-amber-300 text-amber-700'
                  : 'bg-white border-stone-200 text-stone-400 hover:border-stone-400'
              }`}>
              <span>{manualMode ? '⏸' : '▶▶'}</span>
              <span>{manualMode ? 'manual' : 'auto'}</span>
            </button>}

            {/* Fast-track — pipeline only */}
            {mode === 'pipeline' && <button onClick={onToggleFastTrack} disabled={isRunning}
              title="Fast-track: Otto resumido, Heitor pulado — resultado em <3 min"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-widest border transition-all disabled:opacity-30 ${
                fastTrack
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-white border-stone-200 text-stone-400 hover:border-stone-400'
              }`}>
              ⚡{fastTrack ? ' fast' : ''}
            </button>}

            {/* Sandbox — pipeline only */}
            {mode === 'pipeline' && <button onClick={onToggleSandbox} disabled={isRunning}
              title="Sandbox: sessão não salva no histórico"
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-widest border transition-all disabled:opacity-30 ${
                sandbox
                  ? 'bg-violet-50 border-violet-300 text-violet-700'
                  : 'bg-white border-stone-200 text-stone-400 hover:border-stone-400'
              }`}>
              🧪{sandbox ? ' lab' : ''}
            </button>}

            {/* Clear */}
            {activeMessages.length > 0 && !activeIsRunning && (
              <button onClick={activeReset}
                className="text-[10px] font-mono text-stone-400 hover:text-stone-700 transition-colors uppercase tracking-wider">
                limpar
              </button>
            )}

            {/* Config toggle — pipeline only */}
            {mode === 'pipeline' && (
              <button onClick={() => setConfigOpen(v => !v)} title="Configurações"
                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                  configOpen
                    ? 'bg-stone-900 border-stone-900 text-white'
                    : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:border-stone-400'
                }`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            )}

            {/* Minimize / Restore */}
            <button onClick={() => setMinimized(v => !v)} title={minimized ? 'Restaurar' : 'Minimizar'}
              className="w-7 h-7 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all font-mono text-stone-500 text-sm font-bold">
              {minimized ? '+' : '−'}
            </button>

            {/* Close */}
            {onClose && (
              <button onClick={onClose} title="Fechar"
                className="w-7 h-7 rounded-lg border border-stone-200 bg-white flex items-center justify-center hover:bg-stone-50 hover:border-stone-400 transition-all ml-0.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Participants bar — reunião only */}
        {!minimized && mode === 'reuniao' && meetingAgents.length > 0 && (
          <div className="px-4 py-2 border-b border-stone-100 flex items-center gap-2 flex-wrap flex-shrink-0">
            {meetingAgents.map(a => {
              const st = activeAgentStatus[a.id]
              return (
                <div key={a.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-100 border border-stone-150">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    st === 'speaking' ? 'bg-yellow-400 animate-pulse' :
                    st === 'thinking' ? 'bg-violet-400 animate-pulse' :
                    st === 'done'     ? 'bg-green-400' :
                    st === 'error'    ? 'bg-red-400' :
                    'bg-stone-300'
                  }`} />
                  <span className="text-[9px] font-mono text-stone-500">{a.name.toLowerCase()}</span>
                </div>
              )
            })}
            {reuniaoManual && (
              <span className="text-[8px] font-mono text-amber-600 ml-auto">use @nome para mencionar</span>
            )}
          </div>
        )}

        {/* Content — hidden when minimized */}
        {!minimized && <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 min-h-0">
          {/* Resumed session banner */}
          {resumedFrom && mode === 'pipeline' && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <p className="text-[9px] font-mono text-amber-700 uppercase tracking-widest">
                Sessão retomada — selecione agentes e continue
              </p>
            </motion.div>
          )}
          {activeMessages.length === 0 && inMeeting.size === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <span className="text-4xl">{mode === 'reuniao' ? '💬' : '⚔️'}</span>
              <p className="text-xs font-mono text-stone-400 uppercase tracking-widest leading-relaxed">
                Convoque agentes ao escritório<br />para iniciar uma sessão
              </p>
            </div>
          )}
          {activeMessages.length === 0 && inMeeting.size > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center gap-4">
              <div className="flex gap-3">
                {meetingAgents.map(a => <CharacterSprite key={a.id} id={a.id} size={1.2} />)}
              </div>
              <div className="text-center">
                <p className="text-xs font-mono text-stone-500 uppercase tracking-widest">
                  {meetingAgents.map(a => a.name).join(', ')} {meetingAgents.length === 1 ? 'está pronto' : 'estão prontos'}
                </p>
                <p className="text-[10px] font-mono text-stone-400 mt-1">
                  {mode === 'reuniao'
                    ? `Use @${meetingAgents.map(a => a.name.toLowerCase()).join(', @')} para mencionar`
                    : 'Envie um briefing para começar'}
                </p>
              </div>
            </motion.div>
          )}
          <AnimatePresence mode="popLayout">
            {activeMessages.map(msg =>
              msg.role === 'user'
                ? <UserMessage key={msg.id} msg={msg} />
                : <AgentMessage key={msg.id} msg={msg} />
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>}

        {/* Custo-aviso banner — pipeline only */}
        {!minimized && mode === 'pipeline' && custoAviso && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="mx-4 mb-0 mt-1 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-amber-500 text-sm flex-shrink-0">⚠</span>
              <p className="text-[9px] font-mono text-amber-700 leading-relaxed">
                Custo em <strong>{custoAviso.pct}%</strong> do limite —{' '}
                <span className="tabular-nums">${custoAviso.total.toFixed(3)}</span> de{' '}
                <span className="tabular-nums">${custoAviso.cap.toFixed(2)}</span>
              </p>
            </div>
            <button onClick={() => onAutorizarCusto(custoAviso.cap)}
              className="text-[8px] font-mono text-amber-600 hover:text-amber-800 uppercase tracking-widest flex-shrink-0 transition-colors">
              ok
            </button>
          </motion.div>
        )}

        {/* Approval bar — pipeline only */}
        {!minimized && mode === 'pipeline' && <AnimatePresence>
          {awaitingApproval && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className={`mx-4 mb-0 mt-1 rounded-xl border px-4 py-3 flex flex-col gap-2 ${
                awaitingApproval.mode === 'retry' ? 'bg-red-50 border-red-200'
                : awaitingApproval.mode === 'confirmar' ? 'bg-blue-50 border-blue-200'
                : 'bg-amber-50 border-amber-200'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-600">
                    {awaitingApproval.mode === 'retry' ? `↯ ${awaitingApproval.agent} — erro`
                      : awaitingApproval.mode === 'confirmar' ? `⚠ ${awaitingApproval.agent} — confirmação`
                      : `✓ ${awaitingApproval.agent} — concluído`}
                  </p>
                  {awaitingApproval.mode === 'confirmar' && awaitingApproval.mensagem && (
                    <p className="text-[9px] font-mono text-stone-600 mt-1 leading-relaxed">{awaitingApproval.mensagem}</p>
                  )}
                  {awaitingApproval.mode !== 'confirmar' && (
                    <p className="text-[9px] font-mono text-stone-400 mt-0.5">
                      {awaitingApproval.mode === 'retry' ? 'Tentar novamente, pular ou cancelar?' : 'Continuar para o próximo agente?'}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {awaitingApproval.mode === 'retry' && (
                    <button onClick={() => onApprove('retry')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-stone-900 text-white hover:bg-stone-700 transition-colors">
                      ↺ Retry
                    </button>
                  )}
                  {awaitingApproval.mode === 'retry' && (
                    <button onClick={() => onApprove('skip')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors border border-stone-200">
                      ⏭ Pular
                    </button>
                  )}
                  {awaitingApproval.mode === 'approval' && (
                    <button onClick={() => onApprove('approve')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-stone-900 text-white hover:bg-stone-700 transition-colors">
                      ▶ Continuar
                    </button>
                  )}
                  {awaitingApproval.mode === 'confirmar' && (
                    <>
                      <button onClick={() => onApprove('confirmar_sim')}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-blue-700 text-white hover:bg-blue-800 transition-colors">
                        ✓ Confirmar
                      </button>
                      <button onClick={() => onApprove('confirmar_nao')}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-mono bg-stone-100 text-stone-600 hover:bg-stone-200 transition-colors border border-stone-200">
                        ✗ Não
                      </button>
                    </>
                  )}
                  {awaitingApproval.mode !== 'confirmar' && (
                    <button onClick={() => onApprove('cancel')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono bg-red-100 text-red-600 hover:bg-red-200 transition-colors border border-red-200">
                      ✕ Parar
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>}

        {/* Avaliação + Export — pipeline only, fora do input para nunca ser cortado */}
        <AnimatePresence>
          {!minimized && mode === 'pipeline' && sessionId && !isRunning && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mx-4 mb-1 flex flex-col gap-3 px-4 py-3 rounded-xl border border-stone-200/60 bg-stone-50/80 flex-shrink-0"
            >
              {/* Tags sugeridas */}
              {tagsAceitas.length > 0 && (
                <div className="border-b border-stone-200/60 pb-3 mb-3">
                  <p className="text-[8px] font-mono text-stone-400 uppercase tracking-widest mb-2">tags sugeridas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tagsAceitas.map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-[9px] font-mono text-stone-600">
                        {tag}
                        <button onClick={() => dispensarTag(tag)}
                          className="ml-0.5 text-stone-400 hover:text-stone-700 transition-colors leading-none">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Estrelas */}
              {avaliado ? (
                <p className="text-[10px] font-mono text-green-600 uppercase tracking-widest text-center">
                  ✓ Avaliação salva no histórico
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest">Como foi essa sessão?</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => onAvaliar(n, '', tagsAceitas)}
                        onMouseEnter={() => setHoveredStar(n)} onMouseLeave={() => setHoveredStar(0)}
                        className="text-lg transition-transform hover:scale-125 active:scale-110">
                        <span style={{ color: n <= hoveredStar ? '#f59e0b' : '#d6d3d1' }}>★</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Export Dossiê — só aparece se Aya rodou */}
              {onExportar && messages.some(m => m.role === 'aya' && m.done) && (
                <div className="border-t border-stone-200/60 pt-2">
                  {exportState === 'idle' && (
                    <button onClick={handleExportar}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl
                        bg-stone-900 text-white text-[10px] font-mono uppercase tracking-widest
                        hover:bg-stone-700 active:scale-[0.98] transition-all">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="12" y1="18" x2="12" y2="12"/>
                        <line x1="9" y1="15" x2="15" y2="15"/>
                      </svg>
                      Exportar Dossiê (HTML + PDF)
                    </button>
                  )}
                  {exportState === 'loading' && (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <div className="flex gap-0.5">
                        {[0, 1, 2].map(i => (
                          <div key={i} className="w-1 h-1 rounded-full bg-stone-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                      </div>
                      <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">Gerando HTML + PDF...</span>
                    </div>
                  )}
                  {exportState === 'done' && exportResult && (
                    <div className="flex flex-col gap-1.5">
                      {exportResult.html_gerado && (
                        <button
                          onClick={() => handleDownload('html', exportResult.caminho_html?.split('/').pop() ?? 'dossie.html')}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 active:scale-[0.98] transition-all w-full text-left">
                          <span className="text-green-600 text-[10px]">🌐</span>
                          <span className="text-[9px] font-mono text-green-700 truncate flex-1">
                            {exportResult.caminho_html?.split('/').pop()}
                          </span>
                          <span className="text-[8px] font-mono text-green-500 uppercase tracking-widest flex-shrink-0">HTML ↓</span>
                        </button>
                      )}
                      {exportResult.pdf_gerado && (
                        <button
                          onClick={() => handleDownload('pdf', exportResult.caminho_pdf?.split('/').pop() ?? 'dossie.pdf')}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 hover:bg-green-100 active:scale-[0.98] transition-all w-full text-left">
                          <span className="text-green-600 text-[10px]">📕</span>
                          <span className="text-[9px] font-mono text-green-700 truncate flex-1">
                            {exportResult.caminho_pdf?.split('/').pop()}
                          </span>
                          <span className="text-[8px] font-mono text-green-500 uppercase tracking-widest flex-shrink-0">PDF ↓</span>
                        </button>
                      )}
                      {exportResult.erros.length > 0 && (
                        <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200">
                          {exportResult.erros.map((e, i) => (
                            <p key={i} className="text-[9px] font-mono text-amber-700">{e}</p>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setExportState('idle')}
                        className="text-[8px] font-mono text-stone-400 hover:text-stone-600 transition-colors text-center uppercase tracking-widest mt-0.5">
                        exportar novamente
                      </button>
                    </div>
                  )}
                  {exportState === 'error' && (
                    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                      <span className="text-[9px] font-mono text-red-600">Falha ao exportar</span>
                      <button onClick={() => setExportState('idle')}
                        className="text-[9px] font-mono text-stone-500 hover:text-stone-700 transition-colors uppercase tracking-widest">
                        tentar novamente
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Avaliação — reunião */}
        <AnimatePresence>
          {!minimized && mode === 'reuniao' && reunMessages.length > 0 && !reunIsRunning && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mx-4 mb-1 px-4 py-3 rounded-xl border border-stone-200/60 bg-stone-50/80 flex-shrink-0"
            >
              {reuniaoRating > 0 ? (
                <p className="text-[10px] font-mono text-green-600 uppercase tracking-widest text-center">
                  ✓ Obrigado pelo feedback!
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-stone-400 uppercase tracking-widest">Como foi a reunião?</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => setReuniaoRating(n)}
                        onMouseEnter={() => setHoveredStar(n)} onMouseLeave={() => setHoveredStar(0)}
                        className="text-lg transition-transform hover:scale-125 active:scale-110">
                        <span style={{ color: n <= (hoveredStar || reuniaoRating) ? '#f59e0b' : '#d6d3d1' }}>★</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        {!minimized && <div className="p-4 border-t border-stone-200/50 flex-shrink-0">
          {inMeeting.size === 0 ? (
            <div className="text-center text-[10px] font-mono text-stone-400 uppercase tracking-widest py-3">
              Nenhum agente na sala
            </div>
          ) : (
            <div>
              {/* Preview imagem */}
              <AnimatePresence>
                {attachedImage && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    className="mb-2 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-stone-100 border border-stone-200"
                  >
                    <img src={attachedImage.preview} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 border border-stone-200" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-stone-600 truncate">{attachedImage.name}</p>
                      <p className="text-[9px] font-mono text-stone-400 uppercase tracking-wider mt-0.5">imagem pronta para enviar</p>
                    </div>
                    <button onClick={() => setAttachedImage(null)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-all">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {imageError && <p className="text-[10px] font-mono text-red-500 mb-1.5 px-1">{imageError}</p>}
              {noSpeechSupport && <p className="text-[10px] font-mono text-amber-500 mb-1.5 px-1">Microfone não suportado neste browser.</p>}

              <div className="relative">
                {/* @mention autocomplete */}
                {mode === 'reuniao' && mentionQuery !== null && mentionMatches.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-20">
                    {mentionMatches.map((a, i) => (
                      <button key={a.id} onMouseDown={e => { e.preventDefault(); insertMention(a.name.toLowerCase()) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === mentionCursor ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                        <CharacterSprite id={a.id} size={0.45} />
                        <span className="text-xs font-mono font-bold text-stone-700">@{a.name.toLowerCase()}</span>
                        <span className="text-[9px] font-mono text-stone-400">{a.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={e => {
                    if (mentionQuery !== null && mentionMatches.length > 0) {
                      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionCursor(c => Math.min(c + 1, mentionMatches.length - 1)); return }
                      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionCursor(c => Math.max(c - 1, 0)); return }
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); insertMention(mentionMatches[mentionCursor].name.toLowerCase()); return }
                      if (e.key === 'Escape') { setMentionQuery(null); return }
                    }
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder={
                    isRecording ? 'Ouvindo... fale seu briefing'
                    : activeIsRunning && mode === 'pipeline' ? 'Aguarde o pipeline terminar...'
                    : mode === 'reuniao' ? `Escreva... @${meetingAgents.map(a => a.name.toLowerCase()).join(', @')} para mencionar`
                    : 'Descreva o projeto... (↵ envia · ⇧↵ nova linha)'
                  }
                  rows={3}
                  className={`w-full resize-none rounded-xl border bg-white/90
                    px-4 py-3 pl-12 pr-24 text-sm font-mono text-stone-800 placeholder:text-stone-400
                    focus:outline-none transition-all duration-200 leading-relaxed
                    ${isRecording ? 'border-red-300 focus:border-red-400' : 'border-stone-200 focus:border-stone-400'}`}
                />
                {/* Clipe */}
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isRunning}
                  title="Anexar imagem"
                  className={`absolute left-3 bottom-3 w-8 h-8 rounded-lg border flex items-center justify-center transition-all
                    disabled:opacity-30 disabled:cursor-not-allowed
                    ${attachedImage ? 'border-stone-900 bg-stone-900' : 'border-stone-200 bg-white/90 hover:bg-stone-50 hover:border-stone-400'}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke={attachedImage ? 'white' : '#78716c'} strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </button>
                {/* Microfone */}
                <button type="button" onClick={toggleRecording}
                  title={isRecording ? 'Parar gravação' : 'Falar briefing'}
                  className={`absolute right-14 bottom-3 w-8 h-8 rounded-lg border flex items-center justify-center transition-all
                    ${isRecording
                      ? 'border-red-400 bg-red-500 text-white animate-pulse'
                      : 'border-stone-200 bg-white/90 hover:bg-stone-50 hover:border-stone-400'
                    }`}>
                  {isRecording
                    ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#78716c" strokeWidth="2">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="23"/>
                        <line x1="8" y1="23" x2="16" y2="23"/>
                      </svg>
                  }
                </button>
                {/* Enviar / Abort */}
                {activeIsRunning ? (
                  <button onClick={activeAbort}
                    title="Parar pipeline"
                    className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-red-500 text-white
                      flex items-center justify-center hover:bg-red-600 active:scale-95 transition-all">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="4" y="4" width="16" height="16" rx="2"/>
                    </svg>
                  </button>
                ) : (
                  <button onClick={handleSend} disabled={!input.trim()}
                    className="absolute right-3 bottom-3 w-8 h-8 rounded-lg bg-stone-900 text-white
                      flex items-center justify-center transition-all
                      disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-700 active:scale-95">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                    </svg>
                  </button>
                )}

              </div>
            </div>
          )}

          {/* Ver referências + sugerir pipeline — pipeline mode only */}
          {mode === 'pipeline' && !activeIsRunning && input.trim().length > 20 && (
            <div className="mt-1.5 space-y-1.5">
              <div className="flex items-center gap-3">
                <button onClick={buscarReferencias} disabled={loadingRefs}
                  className="text-[8px] font-mono text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-50 flex items-center gap-1">
                  {loadingRefs ? '⟳ buscando...' : '🔍 ver referências similares'}
                </button>
                {input.trim().length > 30 && (
                  <button onClick={sugerirPipeline} disabled={loadingSugestao}
                    className="text-[8px] font-mono text-violet-500 hover:text-violet-700 transition-colors disabled:opacity-50 flex items-center gap-1">
                    {loadingSugestao ? '⟳ analisando...' : '✦ sugerir agentes'}
                  </button>
                )}
              </div>
              {referencias && referencias.length > 0 && (
                <div className="space-y-1">
                  {referencias.map(r => (
                    <div key={r.session_id} className="px-2 py-1.5 rounded-lg bg-stone-50 border border-stone-200">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[9px] font-mono text-stone-600 line-clamp-1 flex-1">{r.briefing}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {r.avaliacao && <span className="text-[8px] text-amber-500">{'★'.repeat(r.avaliacao)}</span>}
                          <span className="text-[8px] font-mono text-stone-400">{Math.round(r.score * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {referencias && referencias.length === 0 && (
                <p className="text-[8px] font-mono text-stone-400">Nenhuma referência encontrada.</p>
              )}
              {sugestao && (
                <div className="px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[8px] font-mono text-violet-600 uppercase tracking-widest font-bold">sugestão de agentes</p>
                    <button onClick={() => setSugestao(null)} className="text-violet-400 hover:text-violet-700 text-[10px] leading-none transition-colors">×</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {sugestao.agentes.map(a => {
                      const ag = AGENT_MAP[a]
                      return ag ? (
                        <span key={a} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-mono border"
                          style={{ background: ag.colorDim, borderColor: `${ag.color}40`, color: ag.color }}>
                          <span>{ag.name}</span>
                          {sugestao.razoes[a] && (
                            <span className="text-[7px] opacity-70">· {sugestao.razoes[a]}</span>
                          )}
                        </span>
                      ) : null
                    })}
                  </div>
                  {onSetInMeeting && (
                    <button
                      onClick={() => { onSetInMeeting(sugestao.agentes); setSugestao(null) }}
                      className="w-full py-1.5 rounded-lg bg-violet-700 text-white text-[9px] font-mono font-bold uppercase tracking-widest
                        hover:bg-violet-800 active:scale-[0.98] transition-all">
                      Usar sugestão
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Status de execução */}
          <AnimatePresence>
            {activeIsRunning && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex items-center gap-2 mt-2">
                <div className="flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1 h-1 rounded-full bg-stone-400 animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">
                  {meetingAgents.find(a => activeAgentStatus[a.id] === 'speaking')?.name ?? 'Processando'}...
                </span>
              </motion.div>
            )}
          </AnimatePresence>

        </div>}
      </div>
    </motion.div>
  )
}
