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
import { useLocalStorage } from '@/lib/hooks/useLocalStorage'
import { type Message, type AgentStatus, type ImageData, type ApprovalRequest, type AgentConfig, type ExportResult, type ProgressMeta } from '@/lib/useChat'
import { type LoopStatus } from '@/lib/useReuniao'
import { API_URL } from '@/lib/api'
import { notify } from '@/lib/toast'
import CharacterSprite from '../office/CharacterSprite'
import { exportTxt, UserMessage, AgentMessage } from './MessageBubble'
import { ConfigSidebar } from './ConfigSidebar'
import { ProgressBar } from '../ProgressBar'
import { MacroBar } from '../MacroBar'
import ExportMenu from '../export/ExportMenu'  // T191.a — menu granular de export (3 modos)
import { formatCustoBRL } from '@/lib/formatCusto'  // T190.B3 — USD → R$
import { ConciergeTyping } from './ConciergeTyping'  // Refinamento — loading "pensando..."
import { ConciergeConfirmCard } from './ConciergeConfirmCard'  // Refinamento — card "confirmar"
import { FeedbackPosPipeline } from './FeedbackPosPipeline'  // PROD-4 — feedback loop

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
  favoritado: boolean
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
  onFavoritar: (novoEstado?: boolean) => void
  onApprove: (action: 'approve' | 'retry' | 'skip' | 'cancel' | 'confirmar_sim' | 'confirmar_nao') => void
  onAbort: () => void
  onToggleManualMode: () => void
  onToggleFastTrack: () => void
  onToggleSandbox: () => void
  onSetCustoCap: (v: number | null) => void
  onAutorizarCusto: (valor: number) => void
  onRecusarCustoExtra: () => void
  onUpdateConfig: <K extends keyof AgentConfig>(agent: K, patch: Partial<AgentConfig[K]>) => void
  agentProgress: Record<string, number>
  agentProgressMeta: Record<string, ProgressMeta>
  reunAgentProgress?: Record<string, number>
  reunAgentProgressMeta?: Record<string, ProgressMeta>
  reunMessages: Message[]
  reunAgentStatus: Record<AgentId, AgentStatus>
  reunIsRunning: boolean
  onReunSend: (agents: AgentId[], msg: string, manual?: boolean) => void
  onReunReset: () => void
  onReunAbort: () => void
  onMesaRedonda?: (agents: AgentId[], tese: string, briefing: string) => void
  loopMode: boolean
  onSetLoopMode: (v: boolean) => void
  loopMaxTurnos: number
  onSetLoopMaxTurnos: (v: number) => void
  loopCustoCap: number
  onSetLoopCustoCap: (v: number) => void
  loopActive: boolean
  loopTurn: number
  loopCost: number
  loopStatus: LoopStatus | null
  onLoopStop: () => void
  onExportar?: (sessionId: string, agente: string) => Promise<ExportResult>
  onClose?: () => void
  onSetInMeeting?: (agents: AgentId[]) => void
  dragControls?: DragControls
  tagsSugeridas?: string[]
  /** T139 Sprint 2 — em modo Auto, IA escolhe agentes ao enviar; UI desbloqueada mesmo com inMeeting vazio. */
  autoMode?: boolean
  /** T150 — esconde toggles avançados (fast-track, sandbox) em sessão 1 pra reduzir ruído cognitivo do leigo. */
  hideAdvancedToggles?: boolean
  /** Refinamento — Concierge está esperando resposta da API. Mostra bolha "pensando..." */
  conciergeLoading?: boolean
  /** Refinamento — Card "confirmar": callback do OK/Editar. */
  onConfirmConcierge?: (approve: boolean) => void
  /** v1.47 A4a-002 — texto pra preencher o input (sem enviar). Útil pro "Experimentar exemplo".
   *  Quando muda, ChatPanel popula o input. Limpa após popular (one-shot). */
  prefillInput?: string
  onPrefillConsumed?: () => void
}

// ─── Main panel ──────────────────────────────────────────────────────
export default function ChatPanel({
  mode, onToggleMode,
  messages, agentStatus, inMeeting, isRunning, sessionId, favoritado, resumedFrom,
  manualMode, fastTrack, sandbox, custoCap, custoCapAtingido, custoAviso, awaitingApproval, agentConfig, dragControls,
  agentProgress, agentProgressMeta,
  reunAgentProgress, reunAgentProgressMeta,
  onSend, onReset, onFavoritar, onApprove, onAbort, onToggleManualMode, onToggleFastTrack, onToggleSandbox,
  onSetCustoCap, onAutorizarCusto, onRecusarCustoExtra, onUpdateConfig,
  reunMessages, reunAgentStatus, reunIsRunning, onReunSend, onReunReset, onReunAbort,
  onMesaRedonda,
  loopMode, onSetLoopMode, loopMaxTurnos, onSetLoopMaxTurnos, loopCustoCap, onSetLoopCustoCap,
  loopActive, loopTurn, loopCost, loopStatus, onLoopStop,
  onExportar, onClose, onSetInMeeting,
  tagsSugeridas = [], autoMode = false, hideAdvancedToggles = false,
  conciergeLoading = false, onConfirmConcierge,
  prefillInput, onPrefillConsumed,
}: Props) {
  // Mode-aware aliases
  const activeMessages    = mode === 'reuniao' ? reunMessages    : messages
  const activeAgentStatus = mode === 'reuniao' ? reunAgentStatus : agentStatus
  const activeIsRunning   = mode === 'reuniao' ? reunIsRunning   : isRunning
  const activeAbort       = mode === 'reuniao' ? onReunAbort     : onAbort

  const [input, setInput] = useState('')
  const [minimized, setMinimized] = useState(false)
  // T178 (2026-05-28) — Painel é fixo à direita. Estado `pinned` + botão 📌
  // removidos; key `lemmon-chat-pinned` é limpa em page.tsx no mount.
  const [configOpen, setConfigOpen] = useState(false)
  const [reuniaoManual, setReuniaoManual] = useState(false)
  const [reuniaoRating, setReuniaoRating] = useState(0)
  const [loopCustoDismissed, setLoopCustoDismissed] = useState(false)
  const [tagsAceitas, setTagsAceitas] = useState<string[]>([])
  const [sugestao, setSugestao] = useState<{ agentes: AgentId[]; razoes: Record<string, string> } | null>(null)
  const [loadingSugestao, setLoadingSugestao] = useState(false)
  const [sugestaoError, setSugestaoError] = useState('')
  const [dossiePronto, setDossiePronto] = useState(false)
  const prevIsRunningRef = useRef(false)
  // T190.B8 — highlight pulsante no input nos primeiros 5s pra chamar atenção.
  // Só dispara em sessão limpa (sem mensagens) e em modo pipeline auto.
  const [shouldHighlightInput, setShouldHighlightInput] = useState(false)
  useEffect(() => {
    if (mode === 'pipeline' && activeMessages.length === 0 && !isRunning) {
      setShouldHighlightInput(true)
      const t = setTimeout(() => setShouldHighlightInput(false), 5000)
      return () => clearTimeout(t)
    }
    setShouldHighlightInput(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeMessages.length === 0, isRunning])

  useEffect(() => { setTagsAceitas(tagsSugeridas) }, [tagsSugeridas])
  useEffect(() => { if (!loopStatus) setLoopCustoDismissed(false) }, [loopStatus])
  useEffect(() => { if (mode === 'reuniao') setConfigOpen(false) }, [mode])
  useEffect(() => {
    if (configOpen) setPanelSize(prev => prev.w < 540 ? { ...prev, w: 540 } : prev)
  }, [configOpen])
  useEffect(() => {
    if (mode === 'reuniao') setPanelSize(prev => prev.w < 520 ? { ...prev, w: 520 } : prev)
  }, [mode])
  useEffect(() => {
    const justFinished = prevIsRunningRef.current && !isRunning
    prevIsRunningRef.current = isRunning
    if (justFinished && activeMessages.some(m => m.role === 'aya' && m.done)) {
      setDossiePronto(true)
      // T190.A14 — antes auto-dismiss em 12s (Pedro podia perder e fechar aba).
      // Agora é persistente até user clicar × ou clicar uma das ações.
      // CTA permanente de export já existe na seção abaixo (linha ~1063).
    }
  }, [isRunning, activeMessages])

  const sugerirPipeline = async () => {
    const q = input.trim()
    if (!q || loadingSugestao) return
    setLoadingSugestao(true)
    setSugestao(null)
    setSugestaoError('')
    try {
      const res = await fetch(`${API_URL}/sugerir_pipeline?briefing=${encodeURIComponent(q)}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail ?? 'Falha ao sugerir pipeline')
      }
      const data = await res.json()
      setSugestao(data)
    } catch (e) {
      setSugestaoError((e as Error).message)
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
  const [exportStates, setExportStates] = useState<Record<string, 'idle' | 'loading' | 'done' | 'error'>>({})
  const [exportResults, setExportResults] = useState<Record<string, ExportResult | null>>({})

  useEffect(() => {
    setExportStates({})
    setExportResults({})
    setSharingState('idle')
    setShareToken(null)
  }, [sessionId])

  const handleExportar = async (agente: string) => {
    if (!sessionId || !onExportar) return
    setExportStates(prev => ({ ...prev, [agente]: 'loading' }))
    try {
      const r = await onExportar(sessionId, agente)
      setExportResults(prev => ({ ...prev, [agente]: r }))
      setExportStates(prev => ({ ...prev, [agente]: r.erros.length > 0 && !r.html_gerado && !r.pdf_gerado ? 'error' : 'done' }))
      // T157: avisa de erros parciais que antes ficavam só no state
      if (r.erros && r.erros.length > 0) {
        notify.warning(`Exportar com avisos: ${r.erros.join(' · ')}`)
      }
    } catch (e: any) {
      // T157: mostra detail real do backend em vez de só pintar o botão de vermelho
      const msg = e?.message ?? 'Erro desconhecido'
      notify.error(`Não consegui exportar ${agente}: ${msg}`)
      setExportStates(prev => ({ ...prev, [agente]: 'error' }))
      setExportResults(prev => ({ ...prev, [agente]: null }))
    }
  }

  const handleDownload = async (tipo: 'html' | 'pdf', filename: string, agente = 'aya') => {
    if (!sessionId) return
    const url = `${API_URL}/download/${sessionId}/${tipo}?agente=${agente}`
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
  const [audioTranscribing, setAudioTranscribing] = useState(false)
  const [audioError, setAudioError] = useState('')
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [sharingState, setSharingState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [ttsSpeaking, setTtsSpeaking] = useState(false)
  const [ttsError, setTtsError] = useState('')
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

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
    // T190.B4 — feedback claro de erro do microfone.
    // Antes: `onerror = () => setIsRecording(false)` silencioso. User clicava,
    // nada acontecia, achava que app travou. Erros comuns:
    // - 'not-allowed': permissão negada pelo browser ou OS
    // - 'no-speech': mic OK mas sem fala detectada
    // - 'audio-capture': mic ausente/em uso por outro app
    // - 'network': online recognition Chrome falhou (precisa internet)
    // Tipa como `any` porque ISpeechRecognition tem signature `() => void` mas
    // o evento real vem com `.error` (SpeechRecognitionErrorEvent — não no DOM lib).
    rec.onerror = ((ev: { error?: string }) => {
      setIsRecording(false)
      const errCode = ev?.error || 'unknown'
      if (errCode === 'not-allowed' || errCode === 'permission-denied') {
        notify.error('🎤 Microfone bloqueado pelo navegador. Habilite nas configurações do site (ícone do cadeado na barra de endereço).')
      } else if (errCode === 'audio-capture') {
        notify.error('🎤 Não achei o microfone. Verifique se ele está conectado e não está sendo usado por outro app.')
      } else if (errCode === 'network') {
        notify.warning('🎤 Sem conexão de internet pro reconhecimento de voz. Tente digitar ou verifique sua rede.')
      } else if (errCode === 'no-speech') {
        // silencioso — usuário só não falou nada, sem precisar de toast
      } else {
        notify.error(`🎤 Erro no microfone: ${errCode}`)
      }
    }) as unknown as (() => void)
    rec.start()
    recognitionRef.current = rec
    setIsRecording(true)
  }

  // v1.47 A2a-003 — smooth scroll só DEPOIS de mensagem terminar (não por token).
  // Antes scrollava em cada token streamado com behavior:smooth, causando jank.
  // Agora: scroll instantâneo durante streaming, smooth no final.
  useEffect(() => {
    const allDone = activeMessages.length === 0 || activeMessages.every(m => m.done)
    bottomRef.current?.scrollIntoView({
      behavior: allDone ? 'smooth' : 'auto',
    })
  }, [activeMessages])

  // v1.47 A2a-005 — cleanup do SpeechRecognition no unmount. Antes deixava
  // listener ativo segurando referência ao componente desmontado.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore — pode já estar parado
      }
      recognitionRef.current = null
      // T190.B4 — também cancela qualquer speak() do TTS pendente
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try { window.speechSynthesis.cancel() } catch { /* ignore */ }
      }
    }
  }, [])

  // v1.47 A4a-002 — quando WelcomeModal "Experimentar" é clicado, preenche o input
  // (não envia automaticamente). User revisa e decide clicar Enviar.
  // Antes: dispara handleSend(EXEMPLO) direto → primeiro clique no produto é envio
  // sem revisão. Pedro queria entender antes.
  useEffect(() => {
    if (prefillInput) {
      setInput(prefillInput)
      onPrefillConsumed?.()
    }
  }, [prefillInput, onPrefillConsumed])

  const handleAudioSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const allowed = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a']
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|m4a|wav|ogg|webm)$/i)) {
      setAudioError('Formatos suportados: mp3, m4a, wav, ogg.')
      return
    }
    if (file.size > 25 * 1024 * 1024) { setAudioError('Máximo 25MB por arquivo de áudio.'); return }
    setAudioError('')
    setAudioTranscribing(true)
    try {
      const fd = new FormData()
      fd.append('audio', file)
      const res = await fetch(`${API_URL}/transcrever`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail ?? 'Erro ao transcrever')
      setInput(prev => prev ? `${prev}\n\n${data.transcricao}` : data.transcricao)
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Erro ao transcrever áudio')
    } finally {
      setAudioTranscribing(false)
    }
  }

  const compartilharAprovacao = async () => {
    if (!sessionId) {
      // T157: cliente vê o botão mas a sessão ainda não foi salva — informa
      // T190.B1 — "pipeline" → "time" no toast pro leigo
      notify.warning('Sessão ainda não foi salva. Aguarde o time terminar antes de compartilhar.')
      return
    }
    setSharingState('loading')
    setShareToken(null)
    try {
      const res = await fetch(`${API_URL}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail ?? `Erro HTTP ${res.status}`)
      setShareToken(data.token)
      setSharingState('done')
    } catch (e: any) {
      // T157: mostra detail real em vez de pintar botão de vermelho silenciosamente
      const msg = e?.message ?? 'Erro desconhecido'
      const isNetwork = e?.message?.includes('fetch') || e?.name === 'TypeError'
      // T190.A12 — mensagem amigável pra cliente leigo (sem mencionar Terminal)
      notify.error(isNetwork
        ? 'Conexão com o servidor perdida. Avise o suporte da Lemmon pra reiniciar.'
        : `Não consegui gerar o link: ${msg}`)
      setSharingState('error')
    }
  }

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
    // Em modo Auto (pipeline) o IA escolhe os agentes ao receber o briefing → inMeeting pode estar vazio.
    const podeEnviarVazio = autoMode && mode === 'pipeline'
    if (!msg || activeIsRunning || (inMeeting.size === 0 && !podeEnviarVazio)) return
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
      animate={{ width: panelSize.w, height: minimized ? 48 : '100%' }}
      transition={{ type: 'spring', stiffness: 200, damping: 30 }}
      className="flex flex-row bg-white dark:bg-stone-900 flex-shrink-0 relative h-full"
    >
      {/* Loop custo_max — blocking overlay (reunião) */}
      {mode === 'reuniao' && loopStatus?.motivo === 'custo_max' && !loopCustoDismissed && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl">
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-6 mx-6 shadow-2xl border border-stone-200 dark:border-stone-700 flex flex-col gap-4 max-w-xs w-full">
            <div className="text-center">
              <div className="text-3xl mb-2">💸</div>
              <p className="text-sm font-display font-semibold text-stone-900 dark:text-stone-100 mb-1">Cap de custo atingido</p>
              <p className="text-[10px] font-mono text-stone-500 leading-relaxed">
                Loop pausado — limite de{' '}
                <span className="text-stone-700 dark:text-stone-300 font-bold tabular-nums">${loopCustoCap.toFixed(2)}</span> atingido.
                Total:{' '}
                <span className="text-stone-700 dark:text-stone-300 font-bold tabular-nums">${loopStatus.custoTotal.toFixed(3)}</span>
                {' '}em{' '}<span className="font-bold">{loopStatus.nTurnos}</span> turnos.
              </p>
            </div>
            <button
              onClick={() => setLoopCustoDismissed(true)}
              className="py-2 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[10px] font-mono uppercase tracking-widest hover:bg-stone-700 dark:hover:bg-stone-200 transition-colors">
              Ok, entendi
            </button>
          </div>
        </div>
      )}

      {/* Custo-cap atingido — blocking overlay — T180 dark mode */}
      {custoCapAtingido && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-2xl">
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-6 mx-6 shadow-2xl border border-stone-200 dark:border-stone-700 flex flex-col gap-4 max-w-xs w-full">
            <div className="text-center">
              <div className="text-3xl mb-2">💸</div>
              <p className="text-sm font-display font-semibold text-stone-900 dark:text-stone-100 mb-1">Limite de custo atingido</p>
              <p className="text-[10px] font-mono text-stone-500 dark:text-stone-300 leading-relaxed">
                {/* T190.B1 — "pipeline" → "trabalho do time" pro leigo */}
                {/* T190.B3 — USD → R$ pra brasileiro entender */}
                O trabalho foi pausado ao atingir o limite de{' '}
                <span className="text-stone-700 dark:text-stone-100 font-bold tabular-nums">{formatCustoBRL(custoCapAtingido.cap)}</span>.
                <br />
                Já gastou: <span className="text-stone-700 dark:text-stone-100 tabular-nums">{formatCustoBRL(custoCapAtingido.total)}</span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {/* T190.B3 — USD → R$ nos botões. R$2.75 = $0.50 / R$11 = $2 */}
              <button
                onClick={() => onAutorizarCusto(custoCapAtingido.cap + 0.50)}
                className="w-full py-2.5 rounded-xl bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[10px] font-mono font-bold uppercase tracking-widest
                  hover:bg-stone-700 dark:hover:bg-stone-200 active:scale-[0.98] transition-all">
                Autorizar +{formatCustoBRL(0.50)} e continuar
              </button>
              <button
                onClick={() => onAutorizarCusto(custoCapAtingido.cap + 2.00)}
                className="w-full py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-200 text-[10px] font-mono uppercase tracking-widest
                  hover:border-stone-400 hover:bg-stone-50 dark:hover:bg-stone-700 active:scale-[0.98] transition-all">
                Autorizar +{formatCustoBRL(2.00)} e continuar
              </button>
              <button
                onClick={onRecusarCustoExtra}
                className="w-full py-2 rounded-xl text-[10px] font-mono text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors uppercase tracking-widest">
                Parar aqui
              </button>
            </div>
          </div>
        </div>
      )}

      {/* T151 + T190.A14 + T191.c — Dossiê pronto. CTA persistente com 3 modos
          de export (Enxuto / Completo / Personalizar) + link de compartilhamento.
          Calebe reportou 2026-06-01: Pedro queria escolher entre 3 modos e o sistema só dava um. */}
      {dossiePronto && (
        <div className="absolute top-14 right-4 z-40 flex flex-col gap-3 px-4 py-3 rounded-xl bg-stone-900 border-2 border-emerald-500/60 shadow-2xl shadow-emerald-500/20 max-w-[320px]">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎉</span>
            <span className="text-sm font-display text-stone-100 font-semibold flex-1">Dossiê pronto!</span>
            <button
              className="text-stone-400 hover:text-stone-100 transition-colors text-base leading-none"
              onClick={() => setDossiePronto(false)}
              title="Fechar"
            >×</button>
          </div>
          <p className="text-xs text-stone-300 leading-relaxed">
            Sessão salva no histórico. Escolha como quer exportar:
          </p>
          <div className="flex flex-col gap-2">
            {/* Enxuto — só Carlos/Salles (roteiros) + Renata (cronograma) */}
            <button
              onClick={async () => {
                if (!sessionId) return
                try {
                  const r = await fetch(`${API_URL}/exportar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId, agentes: ['carlos', 'salles', 'renata'] }),
                  })
                  const data = await r.json()
                  if (r.ok && data.slug) {
                    const a = document.createElement('a')
                    a.href = `${API_URL}/download/${sessionId}/pdf?slug=${encodeURIComponent(data.slug)}`
                    a.download = `lemmon_enxuto_${sessionId}.pdf`
                    a.click()
                    setDossiePronto(false)
                  } else {
                    notify.error(data.detail || 'Não consegui gerar o PDF enxuto.')
                  }
                } catch (e: any) {
                  notify.error(`Erro: ${e?.message ?? 'desconhecido'}`)
                }
              }}
              className="w-full text-sm font-semibold px-3 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white transition-colors shadow-md text-left"
              title="Roteiros + cronograma apenas. Sem compliance, estratégia ou notas de performance."
            >
              ✂️ Só demandas (enxuto)
              <span className="block text-[10px] font-normal opacity-90 mt-0.5">roteiros + cronograma</span>
            </button>
            {/* Completo — dossiê Aya */}
            <button
              onClick={async () => {
                if (!sessionId || !onExportar) return
                try {
                  await onExportar(sessionId, 'aya')
                  setDossiePronto(false)
                } catch {
                  /* silencioso */
                }
              }}
              className="w-full text-sm font-semibold px-3 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-md text-left"
              title="Dossiê completo da Aya com tudo"
            >
              📋 Completo
              <span className="block text-[10px] font-normal opacity-90 mt-0.5">tudo num PDF só (Aya)</span>
            </button>
            {/* Personalizar — abre seção pós-pipeline com checkboxes */}
            <button
              onClick={() => {
                setDossiePronto(false)
                // O ExportMenu fica na seção pós-pipeline (já visível quando !isRunning).
                // Não precisa de scroll porque a área é fixa no rodapé do chat.
                notify.info('Use o menu "Exportar PDF" abaixo pra marcar as seções específicas.')
              }}
              className="w-full text-xs px-3 py-2 rounded-lg bg-stone-700 hover:bg-stone-600 border border-stone-600 text-stone-100 transition-colors text-left"
              title="Marque as seções específicas que quer no PDF"
            >
              ⚙️ Personalizar...
              <span className="block text-[10px] font-normal opacity-80 mt-0.5">marcar seções específicas</span>
            </button>
            {/* Compartilhar link */}
            <button
              onClick={async () => {
                if (!sessionId) return
                try {
                  const r = await fetch(`${API_URL}/share`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ session_id: sessionId }),
                  })
                  const { token } = await r.json()
                  window.open(`${API_URL}/share/${token}`, '_blank')
                  setDossiePronto(false)
                } catch {
                  /* silencioso — botão sem efeito */
                }
              }}
              className="w-full text-xs px-3 py-2 rounded-lg bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 transition-colors"
              title="Gera link público pra mostrar ao cliente"
            >
              🔗 Gerar link pra compartilhar
            </button>
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Header — T178 fixo: sem drag handle. T179: garante que − × ⚙ sempre
            ficam visíveis usando flex-shrink-0 + permite que esquerda encolha. */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-stone-200/50 dark:border-stone-700/50 flex-shrink-0 select-none gap-1.5 min-w-0"
        >
          {/* T179 — Esquerda (title + modo + custo): pode shrinkar pra não esmagar críticos. */}
          <div className="flex items-center gap-2 min-w-0 flex-shrink">
            <div className="w-1.5 h-1.5 rounded-full bg-stone-900 dark:bg-stone-100 flex-shrink-0" />
            <span className="font-display font-semibold text-sm tracking-tight text-stone-900 dark:text-stone-100 flex-shrink-0">
              {mode === 'reuniao' ? 'Reunião' : 'Pipeline'}
            </span>
            <button onClick={onToggleMode}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-widest border transition-all flex-shrink-0 ${
                mode === 'reuniao'
                  ? 'bg-violet-900 border-violet-900 text-white'
                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-400 dark:text-stone-300 hover:border-stone-400'
              }`}>
              {mode === 'reuniao' ? '💬 conv.' : '▶▶ pipeline'}
            </button>
            {/* T152 — Custo acumulado em tempo real. T179: truncate pra encolher antes dos críticos. */}
            {(() => {
              const totalSessao = activeMessages
                .filter(m => typeof m.cost === 'number')
                .reduce((acc, m) => acc + (m.cost || 0), 0)
              if (totalSessao === 0 && !activeIsRunning) return null
              const pctCap = custoCap ? totalSessao / custoCap : null
              const corCap = pctCap === null ? 'text-stone-500 dark:text-stone-300 border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900'
                : pctCap >= 1 ? 'text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40'
                : pctCap >= 0.8 ? 'text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'
                : 'text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 bg-white dark:bg-stone-900'
              return (
                <span
                  className={`px-2 py-0.5 rounded-md text-[9px] font-mono border truncate min-w-0 ${corCap}`}
                  title={custoCap ? `Limite: ${formatCustoBRL(custoCap)} ($${custoCap.toFixed(2)})` : 'Defina um limite em Configurações se quiser teto máximo'}
                >
                  {/* T190.B3 — USD → R$ no chip principal de custo */}
                  {formatCustoBRL(totalSessao)}
                  {custoCap !== null && custoCap !== undefined && (
                    <span className="opacity-60"> / {formatCustoBRL(custoCap)}</span>
                  )}
                </span>
              )
            })()}
          </div>

          {/* T179 — Direita: críticos (⚙ − ×) com flex-shrink-0 nunca somem. */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Agent avatars — T179: shrink-0 (não somem) mas área compacta */}
            <div className="flex -space-x-1 mr-1 flex-shrink-0">
              {meetingAgents.slice(0, 5).map(a => (
                <div key={a.id} className="w-6 h-6 rounded-full border-2 border-white dark:border-stone-800 flex items-center justify-center"
                  style={{ background: a.colorDim }} title={a.name}>
                  <CharacterSprite id={a.id} size={0.5} speaking={activeAgentStatus[a.id] === 'speaking'} />
                </div>
              ))}
              {meetingAgents.length > 5 && (
                <div className="w-6 h-6 rounded-full border-2 border-white dark:border-stone-800 bg-stone-200 dark:bg-stone-700 flex items-center justify-center text-[8px] font-mono text-stone-600 dark:text-stone-300"
                  title={`+${meetingAgents.length - 5} agentes`}>
                  +{meetingAgents.length - 5}
                </div>
              )}
            </div>

            {/* Export — T179 dark + shrink-0 */}
            {activeMessages.length > 0 && (
              <button onClick={() => exportTxt(activeMessages)} title="Exportar sessão (.txt)"
                className="w-7 h-7 rounded-md border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 transition-all flex-shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-500 dark:text-stone-300">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
              </button>
            )}

            {/* Reunião: segmented control Auto / Manual / Loop */}
            {mode === 'reuniao' && (() => {
              const cm = loopMode ? 'loop' : reuniaoManual ? 'manual' : 'auto'
              return (
                <div className="flex rounded-lg overflow-hidden border border-stone-200 dark:border-stone-700 flex-shrink-0">
                  {(['auto', 'manual', 'loop'] as const).map(m => (
                    <button key={m} disabled={reunIsRunning || loopActive}
                      onClick={() => {
                        if (m === 'loop') { onSetLoopMode(true); setReuniaoManual(false) }
                        else { onSetLoopMode(false); setReuniaoManual(m === 'manual') }
                      }}
                      title={m === 'auto' ? 'Todos respondem automaticamente' : m === 'manual' ? 'Só quem for @mencionado responde' : 'Loop autônomo entre agentes'}
                      className={`px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-widest transition-all disabled:opacity-40
                        ${m === cm
                          ? m === 'loop'
                            ? 'bg-violet-700 text-white'
                            : 'bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900'
                          : 'bg-white dark:bg-stone-900 text-stone-400 hover:text-stone-700 dark:hover:text-stone-300'
                        }`}>
                      {m}
                    </button>
                  ))}
                </div>
              )
            })()}

            {/* Mesa Redonda — reunião only — T179 dark + shrink-0 */}
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
                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono uppercase tracking-widest border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-500 transition-all flex-shrink-0">
                ⊞ mesa
              </button>
            )}

            {/* Manual mode toggle — pipeline only — T179 icon-only + dark + shrink-0 */}
            {mode === 'pipeline' && <button onClick={onToggleManualMode}
              title={manualMode ? 'Manual: você aprova cada etapa' : 'Auto: pipeline corre sem pausas'}
              className={`w-7 h-7 rounded-md text-[11px] border transition-all flex-shrink-0 flex items-center justify-center ${
                manualMode
                  ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300'
                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-300 hover:border-stone-400'
              }`}>
              {manualMode ? '⏸' : '▶▶'}
            </button>}

            {/* Fast-track — T179 icon-only + dark + shrink-0 */}
            {!hideAdvancedToggles && mode === 'pipeline' && <button onClick={onToggleFastTrack} disabled={isRunning}
              title={fastTrack ? 'Fast-track ATIVO: Otto resumido, Heitor pulado' : 'Fast-track: resultado em <3min (Otto resumido, Heitor pulado)'}
              className={`w-7 h-7 rounded-md text-[11px] border transition-all disabled:opacity-30 flex-shrink-0 flex items-center justify-center ${
                fastTrack
                  ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-600 text-red-700 dark:text-red-300'
                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-300 hover:border-stone-400'
              }`}>
              ⚡
            </button>}

            {/* Sandbox — T179 icon-only + dark + shrink-0 */}
            {!hideAdvancedToggles && mode === 'pipeline' && <button onClick={onToggleSandbox} disabled={isRunning}
              title={sandbox ? 'Sandbox ATIVO: sessão não salva no histórico' : 'Sandbox: testar sem poluir histórico'}
              className={`w-7 h-7 rounded-md text-[11px] border transition-all disabled:opacity-30 flex-shrink-0 flex items-center justify-center ${
                sandbox
                  ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-300 dark:border-violet-600 text-violet-700 dark:text-violet-300'
                  : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-300 hover:border-stone-400'
              }`}>
              🧪
            </button>}

            {/* Clear — T179 dark + flex-shrink-0 */}
            {activeMessages.length > 0 && !activeIsRunning && (
              <button onClick={activeReset}
                title="Limpar sessão atual"
                className="text-[10px] font-mono text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors uppercase tracking-wider flex-shrink-0 px-1">
                limpar
              </button>
            )}

            {/* Config toggle — pipeline only — T179 flex-shrink-0 */}
            {mode === 'pipeline' && (
              <button onClick={() => setConfigOpen(v => !v)} title="Configurações"
                className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all flex-shrink-0 ${
                  configOpen
                    ? 'bg-stone-900 dark:bg-stone-100 border-stone-900 dark:border-stone-100 text-white dark:text-stone-900'
                    : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400'
                }`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            )}

            {/* T178 — Pin/Unpin removido: painel é fixo à direita. */}

            {/* Minimize / Restore — T179 flex-shrink-0 */}
            <button onClick={() => setMinimized(v => !v)} title={minimized ? 'Restaurar' : 'Minimizar'}
              className="w-7 h-7 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 transition-all font-mono text-stone-500 dark:text-stone-300 text-sm font-bold flex-shrink-0">
              {minimized ? '+' : '−'}
            </button>

            {/* T185.5 — Botão de fechar REMOVIDO. Chat sempre visível.
                Pra esconder temporariamente, usuário usa o botão de minimizar (−). */}
          </div>
        </div>

        {/* Participants bar — reunião only — T180 dark mode */}
        {!minimized && mode === 'reuniao' && meetingAgents.length > 0 && (
          <div className="px-4 py-2 border-b border-stone-100 dark:border-stone-800 flex items-center gap-2 flex-wrap flex-shrink-0">
            {meetingAgents.map(a => {
              const st = activeAgentStatus[a.id]
              return (
                <div key={a.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-150 dark:border-stone-700">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    st === 'speaking' ? 'bg-yellow-400 animate-pulse' :
                    st === 'thinking' ? 'bg-violet-400 animate-pulse' :
                    st === 'done'     ? 'bg-green-400' :
                    st === 'error'    ? 'bg-red-400' :
                    'bg-stone-300 dark:bg-stone-600'
                  }`} />
                  <span className="text-[9px] font-mono text-stone-500 dark:text-stone-300">{a.name.toLowerCase()}</span>
                </div>
              )
            })}
            {reuniaoManual && !loopMode && (
              <span className="text-[8px] font-mono text-amber-600 dark:text-amber-400 ml-auto">use @nome para mencionar</span>
            )}
            {loopMode && !loopActive && (
              <div className="flex items-center gap-2 ml-auto">
                <label className="text-[8px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-widest">turnos</label>
                <input type="number" min={1} max={20} value={loopMaxTurnos}
                  onChange={e => onSetLoopMaxTurnos(Math.max(1, Math.min(20, Number(e.target.value))))}
                  className="w-10 text-center text-[9px] font-mono border border-stone-200 dark:border-stone-700 rounded px-1 py-0.5 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-100" />
                <label className="text-[8px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-widest">cap $</label>
                <input type="number" min={0.10} max={10} step={0.10} value={loopCustoCap}
                  onChange={e => onSetLoopCustoCap(Math.max(0.10, Math.min(10, Number(e.target.value))))}
                  className="w-14 text-center text-[9px] font-mono border border-stone-200 dark:border-stone-700 rounded px-1 py-0.5 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-100" />
              </div>
            )}
            {loopActive && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[9px] font-mono text-violet-600 dark:text-violet-400 tabular-nums">
                  Turno {loopTurn}/{loopMaxTurnos} · ${loopCost.toFixed(3)}/${loopCustoCap.toFixed(2)}
                </span>
                <button onClick={onLoopStop}
                  className="px-2 py-0.5 rounded-md bg-red-500 text-white text-[8px] font-mono uppercase tracking-widest hover:bg-red-600 transition-colors">
                  parar
                </button>
              </div>
            )}
          </div>
        )}

        {/* T190.B11 — ETA banner. Pedro: "travou? vou recarregar?" sem feedback.
            Agora soma medianas dos agentes em fila + restante dos ativos = ETA. */}
        {!minimized && mode === 'pipeline' && isRunning && (() => {
          const activeIds = activeMessages
            .filter(m => m.role !== 'user' && m.role !== 'concierge')
            .map(m => m.role as AgentId)
            .filter((id, i, arr) => arr.indexOf(id) === i)
          // Calcula tempo restante baseado em mediana × (1 - progress)
          let segundosRestantes = 0
          for (const id of activeIds) {
            const meta = agentProgressMeta[id]
            if (!meta || meta.mediana == null) continue
            const pct = (agentProgress[id] ?? 0) / 100
            segundosRestantes += Math.max(0, meta.mediana * (1 - pct))
          }
          // Agentes ainda não iniciados (em inMeeting mas sem mensagem) contam mediana cheia
          const startedIds = new Set(activeIds)
          Array.from(inMeeting).forEach(id => {
            if (startedIds.has(id)) return
            const meta = agentProgressMeta[id]
            if (meta?.mediana) segundosRestantes += meta.mediana
          })
          if (segundosRestantes <= 0) return null
          const min = Math.ceil(segundosRestantes / 60)
          const label = min < 1 ? 'menos de 1 min' : min === 1 ? '~1 min' : `~${min} min`
          return (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-2 border-b border-emerald-200/40 dark:border-emerald-800/40 bg-gradient-to-r from-emerald-50/80 to-emerald-100/40 dark:from-emerald-950/40 dark:to-emerald-900/20 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-emerald-700 dark:text-emerald-300"
            >
              <motion.svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              >
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </motion.svg>
              <span className="font-bold">Restam {label}</span>
              <span className="opacity-70">— não feche a aba</span>
            </motion.div>
          )
        })()}

        {/* MacroBar — pipeline overview */}
        {!minimized && mode === 'pipeline' && (
          <MacroBar
            activeAgentIds={activeMessages
              .filter(m => m.role !== 'user')
              .map(m => m.role as AgentId)
              .filter((id, i, arr) => arr.indexOf(id) === i)}
            agentStatus={agentStatus}
            agentProgress={agentProgress}
            isVisible={isRunning || activeMessages.some(m => m.role !== 'user' && !m.done)}
          />
        )}

        {/* Content — hidden when minimized */}
        {!minimized && <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 min-h-0 dark:bg-stone-950/30">
          {/* Resumed session banner — T180 dark mode */}
          {resumedFrom && mode === 'pipeline' && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-amber-600 dark:text-amber-300">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              <p className="text-[9px] font-mono text-amber-700 dark:text-amber-300 uppercase tracking-widest">
                Sessão retomada — selecione agentes e continue
              </p>
            </motion.div>
          )}
          {activeMessages.length === 0 && inMeeting.size === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-6">
              <span className="text-4xl">{autoMode && mode === 'pipeline' ? '🤖' : (mode === 'reuniao' ? '💬' : '⚔️')}</span>
              {autoMode && mode === 'pipeline' ? (
                /* T190.B7 — texto legível (14px case normal) + 3 exemplos clicáveis Hator */
                <div className="space-y-4 max-w-[320px]">
                  <p className="text-sm text-stone-700 dark:text-stone-200 leading-relaxed">
                    Conta o que você precisa.
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                    O Concierge entrevista você primeiro e depois aciona o time de IA certo pra cada caso.
                  </p>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-stone-400 dark:text-stone-500">
                      Tente um exemplo:
                    </p>
                    {[
                      'Quero atrair pacientes pra consulta de menopausa pelo Instagram.',
                      'Preciso de um calendário editorial de Reels pro próximo mês.',
                      'Tenho um vídeo gravado do médico — extrai cortes prontos pra Reels.',
                    ].map((ex, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setInput(ex)}
                        className="text-left text-[12px] text-stone-700 dark:text-stone-200 bg-stone-100 dark:bg-stone-800/60 hover:bg-stone-200 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-3 py-2 transition-colors leading-snug"
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* T149 — em Modo Expert, dar caminho concreto pra leigo */
                <div className="space-y-3">
                  <p className="text-sm text-stone-700 dark:text-stone-200 leading-relaxed">
                    Nenhum agente na sala.
                  </p>
                  <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed max-w-[280px]">
                    Convoque clicando nas pills do topo (<span className="text-stone-700 dark:text-stone-200 font-semibold">OTTO</span>, <span className="text-stone-700 dark:text-stone-200 font-semibold">HEITOR</span>, etc.) ou ative o <span className="text-emerald-700 dark:text-emerald-300 font-semibold">🤖 Modo Auto</span> pra a IA escolher.
                  </p>
                </div>
              )}
            </div>
          )}
          {activeMessages.length === 0 && inMeeting.size > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center gap-4">
              <div className="flex gap-3">
                {meetingAgents.map(a => <CharacterSprite key={a.id} id={a.id} size={1.2} />)}
              </div>
              <div className="text-center">
                <p className="text-xs font-mono text-stone-500 dark:text-stone-300 uppercase tracking-widest">
                  {meetingAgents.map(a => a.name).join(', ')} {meetingAgents.length === 1 ? 'está pronto' : 'estão prontos'}
                </p>
                <p className="text-[10px] font-mono text-stone-400 dark:text-stone-500 mt-1">
                  {mode === 'reuniao'
                    ? `Use @${meetingAgents.map(a => a.name.toLowerCase()).join(', @')} para mencionar`
                    : 'Envie um briefing para começar'}
                </p>
              </div>
            </motion.div>
          )}
          <AnimatePresence mode="popLayout">
            {activeMessages.map(msg => {
              if (msg.role === 'user') return <UserMessage key={msg.id} msg={msg} />
              // Refinamento — renderiza card "confirmar" se mensagem tem metadata
              if (msg.role === 'concierge' && msg.conciergeConfirmar) {
                return (
                  <ConciergeConfirmCard
                    key={msg.id}
                    mensagem={msg.content}
                    agentes={msg.conciergeConfirmar.agentes}
                    razoes={msg.conciergeConfirmar.razoes}
                    ferramentas={msg.conciergeConfirmar.ferramentas}
                    custoEstimadoUsd={msg.conciergeConfirmar.custoEstimadoUsd}
                    onApprove={() => onConfirmConcierge?.(true)}
                    onEdit={() => onConfirmConcierge?.(false)}
                  />
                )
              }
              const agentId = msg.role as AgentId
              const activeProgress = mode === 'reuniao' ? (reunAgentProgress ?? {}) : agentProgress
              const activeProgressMeta = mode === 'reuniao' ? (reunAgentProgressMeta ?? {}) : agentProgressMeta
              const pct = activeProgress[agentId] ?? 0
              const meta = activeProgressMeta[agentId]
              const isManualLocked = msg.done && manualMode &&
                awaitingApproval?.agent === agentId && awaitingApproval?.mode === 'approval'
              const showBar = meta !== undefined && pct > 0
              return (
                <div key={msg.id}>
                  <AgentMessage msg={msg} progress={pct} />
                  {showBar && (
                    <ProgressBar
                      agentId={agentId}
                      progress={pct}
                      meta={meta}
                      isManualLocked={isManualLocked}
                      isVisible={!msg.done || isManualLocked}
                    />
                  )}
                </div>
              )
            })}
            {/* Refinamento — bolha "Concierge pensando..." enquanto API responde.
                Aparece após user mandar msg e some quando resposta real chega. */}
            {conciergeLoading && mode === 'pipeline' && (
              <ConciergeTyping key="__concierge-typing__" />
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
                {/* T190.B3 — USD → R$ no aviso de custo */}
                Custo em <strong>{custoAviso.pct}%</strong> do limite —{' '}
                <span className="tabular-nums">{formatCustoBRL(custoAviso.total)}</span> de{' '}
                <span className="tabular-nums">{formatCustoBRL(custoAviso.cap)}</span>
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
                awaitingApproval.mode === 'retry' ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
                : awaitingApproval.mode === 'confirmar' ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700'
                : 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-widest font-bold text-stone-600 dark:text-stone-100">
                    {awaitingApproval.mode === 'retry' ? `↯ ${awaitingApproval.agent} — erro`
                      : awaitingApproval.mode === 'confirmar' ? `⚠ ${awaitingApproval.agent} — confirmação`
                      : `✓ ${awaitingApproval.agent} — concluído`}
                  </p>
                  {awaitingApproval.mode === 'confirmar' && awaitingApproval.mensagem && (
                    <p className="text-[9px] font-mono text-stone-600 dark:text-stone-200 mt-1 leading-relaxed">{awaitingApproval.mensagem}</p>
                  )}
                  {awaitingApproval.mode !== 'confirmar' && (
                    <p className="text-[9px] font-mono text-stone-400 dark:text-stone-300 mt-0.5">
                      {awaitingApproval.mode === 'retry' ? 'Tentar novamente, pular ou cancelar?' : 'Continuar para o próximo agente?'}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {awaitingApproval.mode === 'retry' && (
                    <button onClick={() => onApprove('retry')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-200 transition-colors">
                      ↺ Retry
                    </button>
                  )}
                  {awaitingApproval.mode === 'retry' && (
                    <button onClick={() => onApprove('skip')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors border border-stone-200 dark:border-stone-700">
                      ⏭ Pular
                    </button>
                  )}
                  {awaitingApproval.mode === 'approval' && (
                    <button onClick={() => onApprove('approve')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-200 transition-colors">
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
                        className="px-3 py-1.5 rounded-lg text-[10px] font-mono bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors border border-stone-200 dark:border-stone-700">
                        ✗ Não
                      </button>
                    </>
                  )}
                  {awaitingApproval.mode !== 'confirmar' && (
                    <button onClick={() => onApprove('cancel')}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-mono bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors border border-red-200 dark:border-red-700">
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
              className="mx-4 mb-1 flex flex-col gap-3 px-4 py-3 rounded-xl border border-stone-200/60 dark:border-stone-700/60 bg-stone-50/80 dark:bg-stone-900/60 flex-shrink-0"
            >
              {/* PROD-4 — feedback pós-pipeline (reacao loop) */}
              <FeedbackPosPipeline sessionId={sessionId} isVisible={!!sessionId} />

              {/* Tags sugeridas — T180 dark */}
              {tagsAceitas.length > 0 && (
                <div className="border-b border-stone-200/60 dark:border-stone-700/60 pb-3 mb-3">
                  <p className="text-[8px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-widest mb-2">tags sugeridas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tagsAceitas.map(tag => (
                      <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[9px] font-mono text-stone-600 dark:text-stone-200">
                        {tag}
                        <button onClick={() => dispensarTag(tag)}
                          className="ml-0.5 text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-100 transition-colors leading-none">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Favoritar — T180 dark */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-widest">Sessão favorita?</span>
                <button
                  onClick={() => onFavoritar()}
                  title={favoritado ? 'Remover dos favoritos' : 'Favoritar esta sessão'}
                  className="text-lg transition-transform hover:scale-125 active:scale-110"
                >
                  <span style={{ color: favoritado ? '#f59e0b' : '#d6d3d1' }}>{favoritado ? '★' : '☆'}</span>
                </button>
              </div>

              {/* T191.a — ExportMenu granular: cliente escolhe o que entra no PDF
                  (enxuto / completo / personalizar). Aparece SEMPRE pós-pipeline,
                  antes dos botões rápidos legados. Bug reportado por Calebe 2026-06-01. */}
              {sessionId && (() => {
                // Reconstrói `respostas` a partir das messages concluídas — formato
                // que o ExportMenu espera pra filtrar opções disponíveis.
                const respostasFromMessages: Record<string, string> = {}
                for (const m of messages) {
                  if (m.role === 'user' || m.role === 'concierge' || !m.done) continue
                  const prev = respostasFromMessages[m.role] ?? ''
                  respostasFromMessages[m.role] = prev ? `${prev}\n\n${m.content}` : m.content
                }
                const temAlgo = Object.values(respostasFromMessages).some(v => v.trim().length > 0)
                if (!temAlgo) return null
                return (
                  <div className="border-t border-stone-200/60 dark:border-stone-700/60 pt-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 uppercase tracking-widest">
                        Exportar PDF
                      </span>
                      <ExportMenu
                        sessionId={sessionId}
                        respostas={respostasFromMessages}
                        align="top"
                      />
                    </div>
                    <p className="text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed">
                      Escolha o que entra no PDF: <strong>enxuto</strong> (só roteiros + cronograma), <strong>completo</strong> (tudo) ou marque as seções específicas.
                    </p>
                  </div>
                )
              })()}

              {/* Export por agente — Aya (dossiê) e/ou Renata (editorial) [legado, atalho rápido] */}
              {onExportar && (() => {
                const exportAgentes = [
                  { id: 'aya', label: 'Atalho rápido: Dossiê completo (Aya)', fallbackHtml: 'dossie.html', fallbackPdf: 'dossie.pdf' },
                  { id: 'renata', label: 'Atalho rápido: Editorial (Renata)', fallbackHtml: 'editorial.html', fallbackPdf: 'editorial.pdf' },
                ].filter(({ id }) => messages.some(m => m.role === id && m.done))

                if (exportAgentes.length === 0) return null

                return (
                  <div className="border-t border-stone-200/60 dark:border-stone-700/60 pt-2 flex flex-col gap-2">
                    {exportAgentes.map(({ id, label, fallbackHtml, fallbackPdf }) => {
                      const st = exportStates[id] ?? 'idle'
                      const result = exportResults[id] ?? null
                      return (
                        <div key={id}>
                          {st === 'idle' && (
                            <button onClick={() => handleExportar(id)}
                              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl
                                bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 text-[10px] font-mono uppercase tracking-widest
                                hover:bg-stone-700 dark:hover:bg-stone-200 active:scale-[0.98] transition-all">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="12" y1="18" x2="12" y2="12"/>
                                <line x1="9" y1="15" x2="15" y2="15"/>
                              </svg>
                              {label}
                            </button>
                          )}
                          {st === 'loading' && (
                            <div className="flex items-center justify-center gap-2 py-2">
                              <div className="flex gap-0.5">
                                {[0, 1, 2].map(i => (
                                  <div key={i} className="w-1 h-1 rounded-full bg-stone-400 dark:bg-stone-500 animate-bounce"
                                    style={{ animationDelay: `${i * 0.15}s` }} />
                                ))}
                              </div>
                              <span className="text-[9px] font-mono text-stone-400 dark:text-stone-300 uppercase tracking-widest">Gerando HTML + PDF...</span>
                            </div>
                          )}
                          {st === 'done' && result && (
                            <div className="flex flex-col gap-1.5">
                              {result.html_gerado && (
                                <button onClick={() => handleDownload('html', result.caminho_html?.split('/').pop() ?? fallbackHtml, id)}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/50 active:scale-[0.98] transition-all w-full text-left">
                                  <span className="text-green-600 dark:text-green-300 text-[10px]">🌐</span>
                                  <span className="text-[9px] font-mono text-green-700 dark:text-green-200 truncate flex-1">{result.caminho_html?.split('/').pop()}</span>
                                  <span className="text-[8px] font-mono text-green-500 dark:text-green-300 uppercase tracking-widest flex-shrink-0">HTML ↓</span>
                                </button>
                              )}
                              {result.pdf_gerado && (
                                <button onClick={() => handleDownload('pdf', result.caminho_pdf?.split('/').pop() ?? fallbackPdf, id)}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/50 active:scale-[0.98] transition-all w-full text-left">
                                  <span className="text-green-600 dark:text-green-300 text-[10px]">📕</span>
                                  <span className="text-[9px] font-mono text-green-700 dark:text-green-200 truncate flex-1">{result.caminho_pdf?.split('/').pop()}</span>
                                  <span className="text-[8px] font-mono text-green-500 dark:text-green-300 uppercase tracking-widest flex-shrink-0">PDF ↓</span>
                                </button>
                              )}
                              {result.erros.length > 0 && (
                                <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
                                  {result.erros.map((e, i) => <p key={i} className="text-[9px] font-mono text-amber-700 dark:text-amber-200">{e}</p>)}
                                </div>
                              )}
                              <button onClick={() => setExportStates(prev => ({ ...prev, [id]: 'idle' }))}
                                className="text-[8px] font-mono text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors text-center uppercase tracking-widest mt-0.5">
                                exportar novamente
                              </button>
                            </div>
                          )}
                          {st === 'error' && (
                            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700">
                              <span className="text-[9px] font-mono text-red-600 dark:text-red-300">Falha ao exportar</span>
                              <button onClick={() => setExportStates(prev => ({ ...prev, [id]: 'idle' }))}
                                className="text-[9px] font-mono text-stone-500 dark:text-stone-300 hover:text-stone-700 dark:hover:text-stone-100 transition-colors uppercase tracking-widest">
                                tentar novamente
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* T35 — TTS: narrar Aya — T180 dark */}
              {messages.some(m => m.role === 'aya' && m.done && m.content) && (
                <div className="border-t border-stone-200/60 dark:border-stone-700/60 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-widest">Narração (TTS)</span>
                    <button
                      onClick={() => {
                        setTtsError('')
                        if (ttsSpeaking) { window.speechSynthesis.cancel(); setTtsSpeaking(false); return }
                        const ayaMsg = messages.find(m => m.role === 'aya' && m.done && m.content)
                        if (!ayaMsg) return
                        const voices = window.speechSynthesis.getVoices()
                        if (process.env.NODE_ENV === 'development') {
                          console.log('[TTS] vozes disponíveis:', voices.map(v => `${v.name} (${v.lang})`))
                        }
                        const ptVoice = voices.find(v => v.lang.startsWith('pt'))
                        if (!ptVoice && voices.length > 0) {
                          setTtsError('Nenhuma voz pt-BR disponível. Tente Chrome ou instale uma voz no sistema.')
                          return
                        }
                        const utt = new SpeechSynthesisUtterance(ayaMsg.content)
                        utt.lang = 'pt-BR'
                        utt.rate = 0.92
                        if (ptVoice) utt.voice = ptVoice
                        utt.onstart = () => setTtsSpeaking(true)
                        utt.onend = () => setTtsSpeaking(false)
                        utt.onerror = (e) => { setTtsSpeaking(false); setTtsError(`Erro TTS: ${e.error}`) }
                        window.speechSynthesis.speak(utt)
                      }}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-mono transition-all
                        ${ttsSpeaking
                          ? 'bg-amber-50 dark:bg-amber-900/30 border-amber-300 dark:border-amber-600 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                          : 'border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-700 dark:hover:text-stone-100'}`}>
                      {ttsSpeaking ? (
                        <><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> pausar</>
                      ) : (
                        <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> ouvir dossiê</>
                      )}
                    </button>
                  </div>
                  {ttsError && <p className="text-[9px] font-mono text-red-500 dark:text-red-400 mt-1">{ttsError}</p>}
                </div>
              )}

              {/* T36 — Compartilhar aprovação */}
              <div className="border-t border-stone-200/60 dark:border-stone-700/60 pt-2">
                {sharingState === 'idle' && (
                  <button onClick={compartilharAprovacao}
                    className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900
                      text-[9px] font-mono text-stone-500 dark:text-stone-300 hover:border-stone-400 hover:text-stone-700 dark:hover:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-800 transition-all">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    Gerar link de aprovação
                  </button>
                )}
                {sharingState === 'loading' && (
                  <p className="text-[9px] font-mono text-stone-400 dark:text-stone-300 uppercase tracking-widest text-center">gerando link...</p>
                )}
                {sharingState === 'done' && shareToken && (
                  <div className="flex items-center gap-2">
                    <input readOnly value={`${window.location.origin}/share/${shareToken}`}
                      className="flex-1 text-[9px] font-mono text-stone-600 dark:text-stone-200 border border-stone-200 dark:border-stone-700 rounded-lg px-2 py-1.5 bg-stone-50 dark:bg-stone-800 min-w-0" />
                    <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/share/${shareToken}`)}
                      className="flex-shrink-0 px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 text-[8px] font-mono text-stone-500 dark:text-stone-200 hover:border-stone-400 transition-all">
                      copiar
                    </button>
                  </div>
                )}
                {sharingState === 'error' && (
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono text-red-500 dark:text-red-400">Falha ao gerar link</span>
                    <button onClick={() => setSharingState('idle')} className="text-[9px] font-mono text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-200 transition-colors uppercase tracking-widest">tentar novamente</button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Avaliação — reunião */}
        <AnimatePresence>
          {!minimized && mode === 'reuniao' && reunMessages.length > 0 && !reunIsRunning && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mx-4 mb-1 px-4 py-3 rounded-xl border border-stone-200/60 dark:border-stone-700/60 bg-stone-50/80 dark:bg-stone-900/60 flex-shrink-0"
            >
              {reuniaoRating > 0 ? (
                <p className="text-[10px] font-mono text-green-600 dark:text-green-300 uppercase tracking-widest text-center">
                  ✓ Obrigado pelo feedback!
                </p>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-widest">Como foi a reunião?</span>
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

        {/* Loop status banners — reunião only (custo_max handled by overlay above) */}
        {!minimized && mode === 'reuniao' && loopStatus && loopStatus.motivo !== 'custo_max' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className={`mx-4 mb-1 rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 flex-shrink-0 ${
              loopStatus.motivo === 'final'
                ? 'bg-green-50 dark:bg-green-950/40 border-green-300 dark:border-green-800'
                : loopStatus.motivo === 'ayuda'
                ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-800'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm flex-shrink-0">
                {loopStatus.motivo === 'final' ? '✅' : loopStatus.motivo === 'ayuda' ? '🆘' : '⚠'}
              </span>
              <div className="min-w-0">
                <p className={`text-[9px] font-mono font-bold uppercase tracking-widest ${
                  loopStatus.motivo === 'final' ? 'text-green-700 dark:text-green-400'
                  : loopStatus.motivo === 'ayuda' ? 'text-blue-700 dark:text-blue-400'
                  : 'text-amber-700 dark:text-amber-400'
                }`}>
                  {loopStatus.motivo === 'final' ? 'Entrega concluída'
                    : loopStatus.motivo === 'ayuda' ? 'Loop pausado — operador solicitado'
                    : loopStatus.motivo === 'turnos_max' ? 'Limite de turnos atingido'
                    : loopStatus.motivo === 'stagnacao' ? 'Loop encerrado por estagnação'
                    : 'Loop encerrado pelo operador'}
                </p>
                <p className="text-[8px] font-mono text-stone-500 mt-0.5 tabular-nums">
                  {loopStatus.nTurnos} {loopStatus.nTurnos === 1 ? 'turno' : 'turnos'} · ${loopStatus.custoTotal.toFixed(3)}
                  {loopStatus.agenteFinal && ` · ${loopStatus.agenteFinal}`}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Input */}
        {!minimized && <div className="p-4 border-t border-stone-200/50 dark:border-stone-700/50 flex-shrink-0">
          {inMeeting.size === 0 && !(autoMode && mode === 'pipeline') ? (
            <div className="text-center text-[10px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-widest py-3">
              Nenhum agente na sala
            </div>
          ) : (
            <div>
              {/* Preview imagem — T180 dark */}
              <AnimatePresence>
                {attachedImage && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    className="mb-2 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
                  >
                    <img src={attachedImage.preview} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0 border border-stone-200 dark:border-stone-700" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-mono text-stone-600 dark:text-stone-200 truncate">{attachedImage.name}</p>
                      <p className="text-[9px] font-mono text-stone-400 dark:text-stone-500 uppercase tracking-wider mt-0.5">imagem pronta para enviar</p>
                    </div>
                    <button onClick={() => setAttachedImage(null)}
                      className="w-6 h-6 rounded-md flex items-center justify-center text-stone-400 dark:text-stone-300 hover:text-stone-700 dark:hover:text-stone-100 hover:bg-stone-200 dark:hover:bg-stone-700 transition-all">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {imageError && <p className="text-[10px] font-mono text-red-500 dark:text-red-400 mb-1.5 px-1">{imageError}</p>}
              {audioError && <p className="text-[10px] font-mono text-red-500 dark:text-red-400 mb-1.5 px-1">{audioError}</p>}
              {noSpeechSupport && <p className="text-[10px] font-mono text-amber-500 dark:text-amber-300 mb-1.5 px-1">Microfone não suportado neste browser.</p>}
              {audioTranscribing && <p className="text-[10px] font-mono text-violet-500 dark:text-violet-300 mb-1.5 px-1">⟳ Transcrevendo áudio...</p>}

              <div className="relative">
                {/* @mention autocomplete — T180 dark */}
                {mode === 'reuniao' && mentionQuery !== null && mentionMatches.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 right-0 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl shadow-lg overflow-hidden z-20">
                    {mentionMatches.map((a, i) => (
                      <button key={a.id} onMouseDown={e => { e.preventDefault(); insertMention(a.name.toLowerCase()) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${i === mentionCursor ? 'bg-stone-100 dark:bg-stone-800' : 'hover:bg-stone-50 dark:hover:bg-stone-800'}`}>
                        <CharacterSprite id={a.id} size={0.45} />
                        <span className="text-xs font-mono font-bold text-stone-700 dark:text-stone-100">@{a.name.toLowerCase()}</span>
                        <span className="text-[9px] font-mono text-stone-400 dark:text-stone-500">{a.title}</span>
                      </button>
                    ))}
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                <input ref={audioInputRef} type="file" accept=".mp3,.m4a,.wav,.ogg,.webm,audio/*" className="hidden" onChange={handleAudioSelect} />
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
                    : activeIsRunning && mode === 'pipeline' ? 'Aguarde o time terminar...'
                    : mode === 'reuniao' ? `Escreva... @${meetingAgents.map(a => a.name.toLowerCase()).join(', @')} para mencionar`
                    : 'Descreva o projeto... (↵ envia · ⇧↵ nova linha)'
                  }
                  rows={3}
                  className={`w-full resize-none rounded-xl border bg-white/90 dark:bg-stone-900/90
                    px-4 py-3 pl-20 pr-24 text-sm font-mono text-stone-800 dark:text-stone-100
                    placeholder:text-stone-400 dark:placeholder:text-stone-500
                    focus:outline-none transition-all duration-200 leading-relaxed
                    ${isRecording ? 'border-red-300 focus:border-red-400' : 'border-stone-200 dark:border-stone-700 focus:border-stone-400 dark:focus:border-stone-500'}
                    ${shouldHighlightInput ? 'ring-2 ring-emerald-400/50 ring-offset-2 ring-offset-white dark:ring-offset-stone-900 animate-pulse' : ''}`}
                />
                {/* Clipe (imagem) — T180 dark */}
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isRunning}
                  title="Anexar imagem"
                  className={`absolute left-3 bottom-3 w-8 h-8 rounded-lg border flex items-center justify-center transition-all
                    disabled:opacity-30 disabled:cursor-not-allowed
                    ${attachedImage
                      ? 'border-stone-900 bg-stone-900 dark:border-stone-100 dark:bg-stone-100'
                      : 'border-stone-200 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400'}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2"
                    className={attachedImage ? 'text-white dark:text-stone-900' : 'text-stone-500 dark:text-stone-300'}>
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </button>
                {/* Upload de áudio (T34) — T180 dark */}
                <button type="button" onClick={() => audioInputRef.current?.click()} disabled={isRunning || audioTranscribing}
                  title="Upload de áudio — transcrição automática"
                  className={`absolute bottom-3 w-8 h-8 rounded-lg border flex items-center justify-center transition-all
                    disabled:opacity-30 disabled:cursor-not-allowed
                    ${audioTranscribing
                      ? 'border-violet-400 bg-violet-100 dark:bg-violet-900/40 animate-pulse'
                      : 'border-stone-200 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400'}`}
                  style={{ left: '3.25rem' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={audioTranscribing ? 'text-violet-600 dark:text-violet-300' : 'text-stone-500 dark:text-stone-300'}>
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                </button>
                {/* Microfone — T180 dark */}
                <button type="button" onClick={toggleRecording}
                  title={isRecording ? 'Parar gravação' : 'Falar briefing'}
                  className={`absolute right-14 bottom-3 w-8 h-8 rounded-lg border flex items-center justify-center transition-all
                    ${isRecording
                      ? 'border-red-400 bg-red-500 text-white animate-pulse'
                      : 'border-stone-200 dark:border-stone-700 bg-white/90 dark:bg-stone-900/90 hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400'
                    }`}>
                  {isRecording
                    ? <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                    : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-stone-500 dark:text-stone-300">
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
                {sugestaoError && (
                  <span className="text-[8px] font-mono text-red-500">{sugestaoError}</span>
                )}
              </div>
              {referencias && referencias.length > 0 && (
                <div className="space-y-1">
                  {referencias.map(r => (
                    <div key={r.session_id} className="px-2 py-1.5 rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[9px] font-mono text-stone-600 dark:text-stone-300 line-clamp-1 flex-1">{r.briefing}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {r.avaliacao && <span className="text-[8px] text-amber-500 dark:text-amber-400">{'★'.repeat(r.avaliacao)}</span>}
                          <span className="text-[8px] font-mono text-stone-400 dark:text-stone-500">{Math.round(r.score * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {referencias && referencias.length === 0 && (
                <p className="text-[8px] font-mono text-stone-400 dark:text-stone-500">Nenhuma referência encontrada.</p>
              )}
              {sugestao && (
                <div className="px-3 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/60">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[8px] font-mono text-violet-600 dark:text-violet-300 uppercase tracking-widest font-bold">sugestão de agentes</p>
                    <button onClick={() => setSugestao(null)} className="text-violet-400 hover:text-violet-700 dark:text-violet-500 dark:hover:text-violet-200 text-[10px] leading-none transition-colors">×</button>
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
