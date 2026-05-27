'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, animate } from 'framer-motion'
import { AGENTS, type AgentId } from '@/lib/agents'
import { type AgentStatus, type Message } from '@/lib/useChat'
import CharacterSprite from './CharacterSprite'
import SpeechBubble from './SpeechBubble'
import { RoomBackground } from './WorkRoom'
import { MeetingRoomBackground } from './MeetingRoom'
import { ReceptionBackground } from './ReceptionRoom'
import { sx, sy, msx, msy, rsx, rsy, CAMERA_MEETING, CAMERA_RECEP, ROLES, IDLE_QUOTES, getMeetingTheme } from './constants'

// ─── Character positions ──────────────────────────────────────────────
const DESK_POS: Record<AgentId, { gx: number; gy: number }> = {
  otto:          { gx: 10.2, gy: 2.45 },
  heitor:        { gx: 12.7, gy: 2.45 },
  salles:        { gx: 2.2,  gy: 8.45 },
  sonia:         { gx: 11.2, gy: 7.45 },
  aya:           { gx: 7.2,  gy: 2.45 },
  pedro_abrahao: { gx: 5.5,  gy: 2.0  },
  renata:        { gx: 4.2,  gy: 5.45 },
}

const MEET_CHAR_POS: Record<AgentId, { gx: number; gy: number }> = {
  aya:           { gx: 5.6, gy: 2.0 },
  otto:          { gx: 2.2, gy: 4.5 },
  heitor:        { gx: 9.3, gy: 4.5 },
  salles:        { gx: 3.5, gy: 7.5 },
  sonia:         { gx: 8.1, gy: 7.5 },
  pedro_abrahao: { gx: 7.5, gy: 2.0 },
  renata:        { gx: 6.3, gy: 6.0 },
}

// charY: sprite hip (~y=49 of 72 sprite, local offset=53) should sit on chair seat (h=13)
// chair seat at sy(chair) - 13, desk pos adds ~4px → charY = sy(desk) - 70 is correct
// floating is due to animate-float (-5px peak) → fixed with animate-seated (-1px)
function charX(gx: number, gy: number) { return sx(gx, gy) - 22 }
function charY(gx: number, gy: number) { return sy(gx, gy) - 70 }
function charMeetX(gx: number, gy: number) { return msx(gx, gy) - 22 }
function charMeetY(gx: number, gy: number) { return msy(gx, gy) - 70 }
function charRecepX(gx: number, gy: number) { return rsx(gx, gy) - 22 }
function charRecepY(gx: number, gy: number) { return rsy(gx, gy) - 70 }

// ─── Move state ──────────────────────────────────────────────────────────
interface AgentMoveState {
  gx: number; gy: number
  path: { gx: number; gy: number }[]
  dwellTicks: number
  walking: boolean
  destIdx: number
}

function makePath(fromGx: number, fromGy: number, toGx: number, toGy: number): { gx: number; gy: number }[] {
  const steps: { gx: number; gy: number }[] = []
  const S = 0.5
  let cx = fromGx, cy = fromGy
  while (Math.abs(cx - toGx) > S * 0.55) {
    cx = cx < toGx ? cx + S : cx - S
    steps.push({ gx: +(cx.toFixed(1)), gy: cy })
  }
  while (Math.abs(cy - toGy) > S * 0.55) {
    cy = cy < toGy ? cy + S : cy - S
    steps.push({ gx: toGx, gy: +(cy.toFixed(1)) })
  }
  steps.push({ gx: toGx, gy: toGy })
  return steps
}

// ─── Routine destinations (personality-based) ────────────────────────────
const ROUTINE_DESTS: Record<AgentId, { gx: number; gy: number }[]> = {
  otto:          [{ gx: 10.2, gy: 2.45 }, { gx: 5.8, gy: 4.2 }, { gx: 7.0, gy: 3.8 }, { gx: 10.2, gy: 2.45 }],
  heitor:        [{ gx: 12.7, gy: 2.45 }, { gx: 1.8, gy: 3.5 }, { gx: 2.5, gy: 5.0 }, { gx: 12.7, gy: 2.45 }],
  salles:        [{ gx: 2.2,  gy: 8.45 }, { gx: 3.0, gy: 6.5 }, { gx: 2.8, gy: 7.5 }, { gx: 3.5, gy: 2.5 }, { gx: 2.2, gy: 8.45 }],
  sonia:         [{ gx: 11.2, gy: 7.45 }, { gx: 9.0, gy: 4.8 }, { gx: 6.5, gy: 5.2 }, { gx: 11.2, gy: 7.45 }],
  aya:           [{ gx: 7.2,  gy: 2.45 }, { gx: 5.8, gy: 4.2 }, { gx: 9.5, gy: 4.8 }, { gx: 5.0, gy: 6.2 }, { gx: 7.2, gy: 2.45 }],
  pedro_abrahao: [{ gx: 5.5, gy: 2.0 }, { gx: 4.8, gy: 3.5 }, { gx: 6.0, gy: 1.5 }, { gx: 5.5, gy: 2.0 }],
  renata:        [{ gx: 4.2, gy: 5.45 }, { gx: 6.5, gy: 4.8 }, { gx: 3.8, gy: 7.0 }, { gx: 4.2, gy: 5.45 }],
}

// ─── Pair conversations ──────────────────────────────────────────────────
const PAIR_CONVO: Record<string, [string, string][]> = {
  'heitor-otto':  [['Brief ok, risco zero.', 'Ótima análise!'], ['Compliance ok.', 'Dados fecham.']],
  'aya-otto':     [['Análise concluída.', 'Compilando dossiê.'], ['Outputs prontos?', 'Processando...']],
  'aya-heitor':   [['Diretrizes salvas.', 'Obrigada!'], ['Tudo auditado.', 'Registrando.']],
  'otto-salles':  [['Dados apoiam.', 'Vira script!'], ['Q3 analisado.', 'Já escrevo!']],
  'otto-sonia':   [['CTR estimado: 18%.', 'Já otimizando!'], ['Hipótese validada.', 'ROI aprovado!']],
  'heitor-salles':[['Cuidado nesse claim.', 'Reescrevo já.'], ['Risco amarelo.', 'Entendido.']],
  'heitor-sonia': [['Criativo aprovado.', 'Go go go!'], ['Compliance ok.', 'CTR vai subir!']],
  'salles-sonia': [['Script tem garra!', 'Vai fazer voar!'], ['Finalizei o roteiro.', 'No A/B test!']],
  'aya-salles':   [['Roteiro recebido.', 'Compilando.'], ['Mais café?', 'Sim pls!']],
  'aya-sonia':          [['Métricas no verde!', 'Registrando.'], ['ROI aprovado!', 'Dossiê completo.']],
  'aya-pedro_abrahao':  [['Dossiê pronto!', 'Incrível...'], ['Compilando.', 'Aguardando.']],
  'otto-pedro_abrahao': [['Estratégia traçada.', 'Faz sentido!'], ['ROI projetado.', 'Convencido.']],
  'pedro_abrahao-salles': [['Roteiro pronto.', 'Emocionou!'], ['Narrativa forte!', 'Me identifiquei.']],
  'pedro_abrahao-sonia':  [['CTR vai bem!', 'Percebo isso.'], ['Dados bons.', 'Autêntico.']],
  'renata-sonia':  [['Qual formato bombou?', 'Reels, sem dúvida!'], ['Melhor horário?', 'Terça às 19h!']],
  'renata-salles': [['Hook do roteiro?', 'Já te mando.'], ['Preciso do arco.', 'Quase pronto!']],
  'renata-aya':    [['Dossiê atualizado?', 'Compilando já.'], ['Calendário ok?', 'Confirmado!']],
}

function initMoveStates(): Record<AgentId, AgentMoveState> {
  const s = {} as Record<AgentId, AgentMoveState>
  AGENTS.forEach((agent, i) => {
    const pos = ROUTINE_DESTS[agent.id][0]
    s[agent.id] = { gx: pos.gx, gy: pos.gy, path: [], dwellTicks: i * 9 + 6, walking: false, destIdx: 0 }
  })
  return s
}

// ─── Main component ───────────────────────────────────────────────────
interface Props {
  inMeeting: Set<AgentId>
  agentStatus: Record<AgentId, AgentStatus>
  onToggleAgent: (id: AgentId) => void
  onCallAll: () => void
  onExitMeeting: () => void
  isRunning: boolean
  messages?: Message[]
}

export default function OfficeScene({ inMeeting, agentStatus, onToggleAgent, onCallAll, onExitMeeting, isRunning, messages = [] }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const moveStatesRef = useRef<Record<AgentId, AgentMoveState>>(initMoveStates())
  const [moveStates, setMoveStates] = useState<Record<AgentId, AgentMoveState>>(moveStatesRef.current)
  const inMeetingRef = useRef<Set<AgentId>>(inMeeting)
  const lastConvoRef = useRef<Record<string, number>>({})
  const [speechBubbles, setSpeechBubbles] = useState<Partial<Record<AgentId, string>>>({})
  const [forceShowMeeting, setForceShowMeeting] = useState(false)
  const [forceShowReception, setForceShowReception] = useState(false)

  // ── T31: Whiteboard fill based on active pipeline message ─────────────
  const activeMsg = messages.find(m => !m.done && m.role !== 'user')
  const activeSpeakingAgent = activeMsg ? AGENTS.find(a => a.id === activeMsg.role) : null
  const whiteBoardFill = activeMsg ? Math.min(activeMsg.content.length / 1200, 1) : 0

  // ── Cliente espelho ativo na sala de reunião ───────────────────────────
  const espelhoClientes = AGENTS.filter(a => a.reuniaoOnly)
  const [clienteAtivoId, setClienteAtivoId] = useState<string>(espelhoClientes[0]?.id ?? '')
  const clienteAtivo = AGENTS.find(a => a.id === clienteAtivoId)
  const meetingTheme = getMeetingTheme(clienteAtivoId)

  // ── Pan & zoom state ──────────────────────────────────────────────────
  const camXRef = useRef(0)
  const userOffsetRef = useRef({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const [zoomDisplay, setZoomDisplay] = useState(100)
  const isDraggingRef = useRef(false)
  const hasDraggedRef = useRef(false)
  const lastPtrRef = useRef({ x: 0, y: 0 })

  const updateViewBox = () => {
    const z = zoomRef.current
    const w = Math.round(960 / z)
    const h = Math.round(560 / z)
    const vx = Math.round(camXRef.current + userOffsetRef.current.x)
    const vy = Math.round(userOffsetRef.current.y)
    svgRef.current?.setAttribute('viewBox', `${vx} ${vy} ${w} ${h}`)
  }

  const resetView = () => {
    userOffsetRef.current = { x: 0, y: 0 }
    zoomRef.current = 1
    setZoomDisplay(1)
    updateViewBox()
  }

  // Wheel zoom (non-passive so preventDefault works)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const newZoom = Math.max(0.4, Math.min(4, zoomRef.current * factor))
      const rect = svg.getBoundingClientRect()
      const curZ = zoomRef.current
      const mx = camXRef.current + userOffsetRef.current.x + (e.clientX - rect.left) / rect.width * (960 / curZ)
      const my = userOffsetRef.current.y + (e.clientY - rect.top) / rect.height * (560 / curZ)
      zoomRef.current = newZoom
      userOffsetRef.current = {
        x: mx - (e.clientX - rect.left) / rect.width * (960 / newZoom) - camXRef.current,
        y: my - (e.clientY - rect.top) / rect.height * (560 / newZoom),
      }
      setZoomDisplay(Math.round(newZoom * 100))
      updateViewBox()
    }
    svg.addEventListener('wheel', handler, { passive: false })
    return () => svg.removeEventListener('wheel', handler)
  }, [])

  const showMeeting = inMeeting.size > 0 || forceShowMeeting

  // ── ViewBox camera pan (work room ↔ meeting room ↔ reception) ────────
  const cameraTarget = showMeeting ? CAMERA_MEETING : forceShowReception ? CAMERA_RECEP : 0
  useEffect(() => {
    // Reset pan and zoom when switching rooms
    userOffsetRef.current = { x: 0, y: 0 }
    zoomRef.current = 1
    setZoomDisplay(100)
    const ctrl = animate(camXRef.current, cameraTarget, {
      type: 'spring', stiffness: 48, damping: 16,
      onUpdate: (v) => {
        camXRef.current = Math.round(v)
        updateViewBox()
      },
    })
    return () => ctrl.stop()
  }, [cameraTarget])

  useEffect(() => { inMeetingRef.current = inMeeting }, [inMeeting])

  // Reset agents that just left meeting to desk
  const prevInMeetingRef = useRef<Set<AgentId>>(new Set())
  useEffect(() => {
    const prev = prevInMeetingRef.current
    const updates: Partial<Record<AgentId, AgentMoveState>> = {}
    for (const agent of AGENTS) {
      if (prev.has(agent.id) && !inMeeting.has(agent.id)) {
        const pos = ROUTINE_DESTS[agent.id][0]
        updates[agent.id] = { gx: pos.gx, gy: pos.gy, path: [], dwellTicks: 8, walking: false, destIdx: 0 }
      }
    }
    if (Object.keys(updates).length > 0) {
      const next = { ...moveStatesRef.current, ...updates }
      moveStatesRef.current = next
      setMoveStates(next)
    }
    prevInMeetingRef.current = inMeeting
  }, [inMeeting])

  // ── Walking + conversation ticker ─────────────────────────────────────
  useEffect(() => {
    if (isRunning) {
      const frozen = Object.fromEntries(
        AGENTS.map(a => [a.id, { ...moveStatesRef.current[a.id], path: [], walking: false as const }])
      ) as unknown as Record<AgentId, AgentMoveState>
      moveStatesRef.current = frozen
      setMoveStates(frozen)
      return
    }

    const tickId = setInterval(() => {
      const cur = moveStatesRef.current
      const next = { ...cur }

      for (const agent of AGENTS) {
        if (inMeetingRef.current.has(agent.id)) continue
        const s = { ...cur[agent.id] }

        if (s.path.length > 0) {
          const step = s.path[0]
          s.path = s.path.slice(1)
          s.gx = step.gx; s.gy = step.gy
          s.walking = s.path.length > 0
          if (s.path.length === 0) s.dwellTicks = 18 + Math.floor(Math.random() * 22)
        } else if (s.dwellTicks > 0) {
          s.dwellTicks--; s.walking = false
        } else {
          const dests = ROUTINE_DESTS[agent.id]
          const nextIdx = (s.destIdx + 1) % dests.length
          const dest = dests[nextIdx]
          s.path = makePath(s.gx, s.gy, dest.gx, dest.gy)
          s.destIdx = nextIdx
          s.walking = s.path.length > 0
        }
        next[agent.id] = s
      }

      moveStatesRef.current = next
      setMoveStates(next)

      // Proximity pair conversations
      const ids = AGENTS.map(a => a.id)
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i], b = ids[j]
          if (inMeetingRef.current.has(a) || inMeetingRef.current.has(b)) continue
          const sa = next[a], sb = next[b]
          if (!sa || !sb || sa.walking || sb.walking) continue
          const dx = sa.gx - sb.gx, dy = sa.gy - sb.gy
          if (Math.sqrt(dx * dx + dy * dy) > 2.2) continue
          const key = [a, b].sort().join('-')
          const now = Date.now()
          if ((lastConvoRef.current[key] ?? 0) + 9000 > now) continue
          const convos = PAIR_CONVO[key]
          if (!convos) continue
          const convo = convos[Math.floor(Math.random() * convos.length)]
          lastConvoRef.current[key] = now
          setSpeechBubbles({ [a]: convo[0], [b]: convo[1] })
          setTimeout(() => setSpeechBubbles({}), 4500)
        }
      }
    }, 350)

    return () => clearInterval(tickId)
  }, [isRunning])

  // ── Idle speech bubbles ───────────────────────────────────────────────
  useEffect(() => {
    if (isRunning) { setSpeechBubbles({}); return }
    const fire = () => {
      const available = AGENTS.filter(a => !inMeetingRef.current.has(a.id))
      if (available.length === 0) return
      const agent = available[Math.floor(Math.random() * available.length)]
      const quotes = IDLE_QUOTES[agent.id]
      const text = quotes[Math.floor(Math.random() * quotes.length)]
      setSpeechBubbles(prev => ({ ...prev, [agent.id]: text }))
      setTimeout(() => setSpeechBubbles(prev => {
        const n = { ...prev }
        if (n[agent.id] === text) delete n[agent.id]
        return n
      }), 4500)
    }
    const t1 = setTimeout(fire, 3500)
    const id = setInterval(fire, 10000 + Math.random() * 4000)
    return () => { clearTimeout(t1); clearInterval(id) }
  }, [isRunning])

  const handleExitMeeting = () => {
    setForceShowMeeting(false)
    onExitMeeting()
  }

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-stone-200/60 glass z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-stone-900 animate-pulse" />
          <span className="font-display font-semibold text-sm tracking-tight">
            {showMeeting ? 'Sala de Reunião' : forceShowReception ? 'Recepção' : 'Estúdio Lemmon'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono uppercase tracking-widest text-stone-400">
            {showMeeting
              ? `${inMeeting.size} na sala de reunião`
              : forceShowReception
              ? `${clienteAtivo?.name ?? 'Cliente'} · aguardando`
              : 'Clique na porta ou nos agentes'}
          </span>

          {/* Cliente espelho selector — visible in meeting + reception */}
          {(showMeeting || forceShowReception) && espelhoClientes.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white/80 border border-stone-200 rounded-full px-3 py-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: clienteAtivo?.color ?? '#999' }} />
              <span className="text-[10px] font-mono text-stone-700">{clienteAtivo?.name ?? '—'}</span>
              {espelhoClientes.length > 1 && (
                <button
                  onClick={() => {
                    const idx = espelhoClientes.findIndex(c => c.id === clienteAtivoId)
                    const next = espelhoClientes[(idx + 1) % espelhoClientes.length]
                    setClienteAtivoId(next.id)
                  }}
                  className="ml-1 text-[9px] font-mono text-stone-400 hover:text-stone-700 transition-colors">
                  trocar ↻
                </button>
              )}
            </div>
          )}

          {showMeeting ? (
            <button onClick={handleExitMeeting}
              className="px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest bg-stone-200 text-stone-700
                hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all duration-200">
              ← Baias de trabalho
            </button>
          ) : forceShowReception ? (
            <button onClick={() => setForceShowReception(false)}
              className="px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest bg-stone-200 text-stone-700
                hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all duration-200">
              ← Estúdio
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => setForceShowReception(true)}
                className="px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest bg-white border border-stone-300 text-stone-600
                  hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all duration-200">
                ← Recepção
              </button>
              <button onClick={() => setForceShowMeeting(true)}
                className="px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest bg-white border border-stone-300 text-stone-600
                  hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 transition-all duration-200">
                Reunião →
              </button>
              <button onClick={onCallAll} disabled={isRunning}
                className="px-4 py-1.5 rounded-full text-[11px] font-mono uppercase tracking-widest bg-stone-900 text-white
                  hover:-translate-y-0.5 hover:shadow-lg hover:shadow-stone-900/20 active:translate-y-0
                  transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed">
                ⚔ Convocar Todos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #f0e8d8 0%, #e8dcc8 100%)' }}>

        {/* Zoom indicator + reset */}
        {(zoomDisplay !== 100 || userOffsetRef.current.x !== 0 || userOffsetRef.current.y !== 0) && (
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
            <span className="text-[9px] font-mono text-stone-500 bg-white/80 border border-stone-200 px-2 py-1 rounded-lg">
              {zoomDisplay}%
            </span>
            <button onClick={resetView}
              className="text-[9px] font-mono text-stone-500 bg-white/80 border border-stone-200 px-2 py-1 rounded-lg hover:bg-white hover:border-stone-400 transition-all">
              ↺ reset
            </button>
          </div>
        )}

        <svg ref={svgRef} viewBox="0 0 960 560" width="100%" height="100%"
          preserveAspectRatio="xMidYMid meet"
          style={{ position: 'absolute', inset: 0, cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
          onPointerDown={e => {
            isDraggingRef.current = true
            hasDraggedRef.current = false
            lastPtrRef.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerMove={e => {
            if (!isDraggingRef.current) return
            const dx = e.clientX - lastPtrRef.current.x
            const dy = e.clientY - lastPtrRef.current.y
            if (!hasDraggedRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
              hasDraggedRef.current = true
              ;(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId)
            }
            if (!hasDraggedRef.current) return
            const svg = svgRef.current
            if (!svg) return
            const rect = svg.getBoundingClientRect()
            const z = zoomRef.current
            userOffsetRef.current = {
              x: userOffsetRef.current.x - dx / rect.width * (960 / z),
              y: userOffsetRef.current.y - dy / rect.height * (560 / z),
            }
            lastPtrRef.current = { x: e.clientX, y: e.clientY }
            updateViewBox()
          }}
          onPointerUp={() => { isDraggingRef.current = false }}
          onPointerLeave={() => { isDraggingRef.current = false }}
          onClick={e => { if (hasDraggedRef.current) { e.stopPropagation(); hasDraggedRef.current = false } }}
        >

          <g>
            <ReceptionBackground />
            <RoomBackground onDoorClick={() => setForceShowMeeting(true)} whiteBoardFill={whiteBoardFill} whiteBoardColor={activeSpeakingAgent?.color} />
            <MeetingRoomBackground theme={meetingTheme} />

            {AGENTS.map(agent => {
              const isIn = inMeeting.has(agent.id)
              const ms = moveStates[agent.id]
              const status = agentStatus[agent.id]

              const isRecepAgent = !!agent.reuniaoOnly && !isIn
              const cx = isIn
                ? charMeetX(MEET_CHAR_POS[agent.id].gx, MEET_CHAR_POS[agent.id].gy)
                : isRecepAgent
                ? charRecepX(ms.gx, ms.gy)
                : charX(ms.gx, ms.gy)
              const cy = isIn
                ? charMeetY(MEET_CHAR_POS[agent.id].gx, MEET_CHAR_POS[agent.id].gy)
                : isRecepAgent
                ? charRecepY(ms.gx, ms.gy)
                : charY(ms.gx, ms.gy)

              const desk = DESK_POS[agent.id]
              const atDesk = !isIn && Math.abs(ms.gx - desk.gx) < 0.9 && Math.abs(ms.gy - desk.gy) < 0.9
              const isSitting = atDesk && !ms.walking && status === 'idle'
              const bubble = speechBubbles[agent.id]

              return (
                <motion.g
                  key={agent.id}
                  initial={{ x: cx, y: cy }}
                  animate={{ x: cx, y: cy }}
                  transition={{ type: 'spring', stiffness: 150, damping: 22 }}
                  style={{ cursor: isRunning ? 'not-allowed' : 'pointer' }}
                  onClick={() => !isRunning && onToggleAgent(agent.id)}
                >
                  {/* Shadow */}
                  <ellipse cx={22} cy={74} rx={18} ry={5.5} fill="rgba(0,0,0,0.12)" />

                  {/* Speech bubble */}
                  {bubble && (
                    <motion.g
                      key={bubble}
                      initial={{ opacity: 0, y: -6, scale: 0.88 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transform="translate(46,-22)"
                    >
                      <SpeechBubble text={bubble} />
                    </motion.g>
                  )}

                  {/* T33 — Mic ring for speaking in meeting mode */}
                  {isIn && status === 'speaking' && (
                    <g>
                      <circle cx={22} cy={38} r={32} fill="none" stroke={agent.color} strokeWidth="2"
                        opacity="0.5" className="animate-mic-ring" />
                      <circle cx={22} cy={38} r={32} fill="none" stroke={agent.color} strokeWidth="1.5"
                        opacity="0.3" className="animate-mic-ring" style={{ animationDelay: '0.4s' }} />
                      {/* Mic icon above head */}
                      <g transform="translate(22,-20)">
                        <circle cx={0} cy={0} r={8} fill={agent.color} opacity="0.9" />
                        <rect x={-2.5} y={-5} width={5} height={8} rx={2.5} fill="white" />
                        <path d="M-4,3 Q0,7 4,3" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                        <line x1="0" y1="7" x2="0" y2="9" stroke="white" strokeWidth="1.2" />
                        <line x1="-3" y1="9" x2="3" y2="9" stroke="white" strokeWidth="1.2" />
                      </g>
                    </g>
                  )}

                  {/* Thinking balloon */}
                  {status === 'thinking' && (
                    <g transform="translate(36,-14)">
                      <circle cx={10} cy={0} r={11} fill="white" opacity="0.94" />
                      <text x={10} y={5} textAnchor="middle" fontSize={11} fill="#78716c">...</text>
                    </g>
                  )}

                  {/* T32 — Done badge ✓ */}
                  {status === 'done' && (
                    <g transform="translate(34,-2)">
                      <circle cx={7} cy={7} r={7} fill="#10b981" stroke="white" strokeWidth="1.5" />
                      <text x={7} y={11} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">✓</text>
                    </g>
                  )}

                  {/* T32 — Error badge ✗ */}
                  {status === 'error' && (
                    <g transform="translate(34,-2)">
                      <circle cx={7} cy={7} r={7} fill="#ef4444" stroke="white" strokeWidth="1.5" />
                      <text x={7} y={11} textAnchor="middle" fontSize={8} fill="white" fontWeight="bold">✕</text>
                    </g>
                  )}

                  {/* Status dot — only for thinking/speaking (done/error now have badges) */}
                  {(status === 'speaking' || status === 'thinking') && (
                    <circle cx={38} cy={2} r={5.5}
                      fill={status === 'speaking' ? '#f59e0b' : '#8b5cf6'}
                      stroke="white" strokeWidth="1.5" />
                  )}

                  {/* Selection ring */}
                  {isIn && (
                    <ellipse cx={22} cy={74} rx={24} ry={8}
                      fill="none" stroke={agent.color} strokeWidth="2.2" opacity="0.75" />
                  )}

                  {/* Sprite — T127: foreignObject tem bug no Safari (não respeita
                     dimensões/viewBox do SVG filho, renderiza como prisma esticado).
                     Hack: xmlns explícito no div + style block no SVG via wrapper. */}
                  <foreignObject x={0} y={0} width={46} height={76} style={{ overflow: 'visible' }}>
                    <div
                      {...({ xmlns: 'http://www.w3.org/1999/xhtml' } as { xmlns?: string })}
                      style={{ width: 46, height: 76, overflow: 'visible', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', lineHeight: 0 }}
                    >
                      <CharacterSprite id={agent.id}
                        speaking={status === 'speaking'}
                        thinking={status === 'thinking'}
                        walking={ms.walking && !isIn}
                        sitting={isSitting}
                        done={status === 'done'}
                        error={status === 'error'}
                      />
                    </div>
                  </foreignObject>

                  {/* Name + role tag */}
                  <g transform="translate(22,90)">
                    <rect x={-30} y={-20} width={60} height={30} rx={8}
                      fill={isIn ? agent.color : 'rgba(28,25,23,0.85)'} />
                    <text textAnchor="middle" y={-7} fontSize={7.5} fill="white"
                      fontFamily="JetBrains Mono, monospace" fontWeight="700" letterSpacing="0.3">
                      {agent.name}
                    </text>
                    <text textAnchor="middle" y={4} fontSize={6.5} fill="rgba(255,255,255,0.68)"
                      fontFamily="JetBrains Mono, monospace" fontWeight="400">
                      {ROLES[agent.id]}
                    </text>
                  </g>
                </motion.g>
              )
            })}
          </g>
        </svg>

        {/* Overlay hint */}
        {!showMeeting && !forceShowReception && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}
            className="absolute bottom-5 left-1/2 -translate-x-1/2 glass px-4 py-2 rounded-full pointer-events-none"
          >
            <span className="text-[10px] font-mono text-stone-500 tracking-widest uppercase">
              Clique nos personagens · porta de vidro · ou ⚔ Convocar Todos
            </span>
          </motion.div>
        )}
      </div>
    </div>
  )
}
