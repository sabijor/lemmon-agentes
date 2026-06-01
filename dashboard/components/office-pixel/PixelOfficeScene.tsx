/**
 * T185.3 — PixelOfficeScene (substituto top-down do OfficeScene SVG isométrico)
 *
 * Drop-in via toggle no header. Stack:
 *  - Canvas 2D top-down
 *  - Assets LimeZu Modern Interiors pack pago (themes) + chars FREE
 *  - 1 open-space (sem 4 salas)
 *
 * Fase 3c: chars + pathfinding portado de OfficeScene.tsx
 *  - 12 agentes com DESK_POS adaptado pra grid 2D
 *  - ROUTINE_DESTS personalizadas por agente
 *  - Walking ticker 350ms com makePath()
 *  - Animação idle 4 frames (chars FREE LimeZu)
 */
'use client'
import { useEffect, useRef, useState } from 'react'
import { type AgentId } from '@/lib/agents'
import { type AgentStatus, type Message } from '@/lib/useChat'
import { IDLE_QUOTES } from '@/components/office/constants'

interface Props {
  inMeeting: Set<AgentId>
  agentStatus: Record<AgentId, AgentStatus>
  onToggleAgent: (id: AgentId) => void
  onCallAll: () => void
  onExitMeeting: () => void
  isRunning: boolean
  messages?: Message[]
  activeRoom?: 'creative' | 'admin'
}

// ─── Layout constants ──────────────────────────────────────────────────
const TILE_SRC = 16
const TILE_DST = 32
const COLS = 40
const ROWS = 22
const TICK_MS = 350         // mesmo do OfficeScene
const STEP_SIZE = 0.5       // step de pathfinding (tiles)
const CHAR_FRAMES = 4       // idle animation (Adam/Bob/Alex/Amelia)

// ─── T185.3b-fix: PNGs INDIVIDUAIS dos Theme_Sorter_Singles (sem chute de coord) ─
// Cada móvel é 1 PNG isolado — não precisa adivinhar sx/sy do atlas.
// Identificação visual feita inspecionando amostras (T185.3b-fix-a).
type SingleSprite = keyof typeof SINGLES
const SINGLES = {
  swivel_chair:    '/limezu/singles-curated/swivel_chair.png',    // Conf #30
  armchair_pink:   '/limezu/singles-curated/armchair_pink.png',   // Living #20
  armchair_double: '/limezu/singles-curated/armchair_double.png', // Living #25
  bookshelf:       '/limezu/singles-curated/bookshelf.png',       // Living #5
  plant_yellow:    '/limezu/singles-curated/plant_yellow.png',    // Living #15
  plant_green:     '/limezu/singles-curated/plant_green.png',     // Conf #45
  hospital_bed:    '/limezu/singles-curated/hospital_bed.png',    // Hospital #5
} as const

// ─── DESK_POS adaptado pro layout 2D open-space (40×22 tiles) ─────────
// T185.3b-fix2: agora avatares são desenhados em canvas-2D custom com
// cores distintivas por agente (hair + shirt + skin). Sem PNG.
type Skin = '#fcc8a0' | '#e8b393' | '#d4a774' | '#fcd4b8'
interface AgentLayout {
  gx: number
  gy: number
  hair: string    // cor cabelo
  skin: Skin      // tom de pele
  shirt: string   // cor camisa (= color do agente)
  gender: 'm' | 'f'  // f tem cabelo um pouco mais longo
}

const DESK_POS: Record<AgentId, AgentLayout> = {
  pedro_abrahao: { gx:  5, gy: 4,  hair: '#9aa0a6', skin: '#fcc8a0', shirt: '#0f766e', gender: 'm' },
  otto:          { gx: 13, gy: 9,  hair: '#3d2c1a', skin: '#fcc8a0', shirt: '#1e40af', gender: 'm' },
  heitor:        { gx: 16, gy: 9,  hair: '#1a1a1a', skin: '#e8b393', shirt: '#4d7c0f', gender: 'm' },
  salles:        { gx: 19, gy: 9,  hair: '#cab78a', skin: '#fcc8a0', shirt: '#9a3412', gender: 'm' },
  carlos:        { gx: 22, gy: 9,  hair: '#a3603b', skin: '#fcc8a0', shirt: '#0369a1', gender: 'm' },
  renata:        { gx: 14, gy: 15, hair: '#ec4899', skin: '#fcd4b8', shirt: '#e11d48', gender: 'f' },
  sonia:         { gx: 18, gy: 15, hair: '#a855f7', skin: '#fcc8a0', shirt: '#7c3aed', gender: 'f' },
  aya:           { gx: 22, gy: 15, hair: '#1a1a1a', skin: '#fcc8a0', shirt: '#52525b', gender: 'f' },
  ana_maria:     { gx: 30, gy: 9,  hair: '#7b2436', skin: '#fcc8a0', shirt: '#047857', gender: 'f' },
  prichina:      { gx: 33, gy: 9,  hair: '#6b4423', skin: '#fcc8a0', shirt: '#a16207', gender: 'f' },
  caito:         { gx: 30, gy: 15, hair: '#1a1a1a', skin: '#d4a774', shirt: '#7c2d12', gender: 'm' },
  kelly:         { gx: 33, gy: 15, hair: '#facc15', skin: '#fcd4b8', shirt: '#6d28d9', gender: 'f' },
  // T186 — Concierge é meta, filtrado fora do render. Placeholder TS.
  concierge:     { gx: 0, gy: 0, hair: '#0c4a6e', skin: '#fcc8a0', shirt: '#0ea5e9', gender: 'f' },
}

// ─── ROUTINE_DESTS adaptadas — cada agente visita o desk + 2 spots ─────
// Spots interessantes: copa (col 37, row 5), área central (col 16, row 19),
// recepção (col 5, row 5), entre zonas (col 25, row 11)
const ROUTINE_DESTS: Record<AgentId, { gx: number; gy: number }[]> = {
  pedro_abrahao: [{ gx: 5, gy: 4 }, { gx: 4, gy: 9 }, { gx: 5, gy: 4 }],
  otto:          [{ gx: 13, gy: 9 }, { gx: 16, gy: 19 }, { gx: 13, gy: 9 }, { gx: 25, gy: 11 }],
  heitor:        [{ gx: 16, gy: 9 }, { gx: 16, gy: 19 }, { gx: 16, gy: 9 }],
  salles:        [{ gx: 19, gy: 9 }, { gx: 37, gy: 5 }, { gx: 19, gy: 9 }],
  carlos:        [{ gx: 22, gy: 9 }, { gx: 18, gy: 19 }, { gx: 22, gy: 9 }],
  renata:        [{ gx: 14, gy: 15 }, { gx: 16, gy: 19 }, { gx: 14, gy: 15 }],
  sonia:         [{ gx: 18, gy: 15 }, { gx: 37, gy: 5 }, { gx: 18, gy: 15 }, { gx: 16, gy: 19 }],
  aya:           [{ gx: 22, gy: 15 }, { gx: 13, gy: 9 }, { gx: 22, gy: 15 }, { gx: 30, gy: 9 }],
  ana_maria:     [{ gx: 30, gy: 9 }, { gx: 33, gy: 9 }, { gx: 30, gy: 15 }, { gx: 30, gy: 9 }],
  prichina:      [{ gx: 33, gy: 9 }, { gx: 33, gy: 15 }, { gx: 30, gy: 9 }, { gx: 33, gy: 9 }],
  caito:         [{ gx: 30, gy: 15 }, { gx: 25, gy: 11 }, { gx: 30, gy: 15 }],
  kelly:         [{ gx: 33, gy: 15 }, { gx: 33, gy: 9 }, { gx: 16, gy: 19 }, { gx: 33, gy: 15 }],
  // T186 — Concierge é meta, filtrado fora do render
  concierge:     [{ gx: 0, gy: 0 }],
}

// ─── Move state ────────────────────────────────────────────────────────
interface MoveState {
  gx: number
  gy: number
  path: { gx: number; gy: number }[]
  dwellTicks: number
  walking: boolean
  destIdx: number
}

function makePath(fromGx: number, fromGy: number, toGx: number, toGy: number): { gx: number; gy: number }[] {
  const steps: { gx: number; gy: number }[] = []
  let cx = fromGx, cy = fromGy
  while (Math.abs(cx - toGx) > STEP_SIZE * 0.55) {
    cx = cx < toGx ? cx + STEP_SIZE : cx - STEP_SIZE
    steps.push({ gx: +(cx.toFixed(1)), gy: cy })
  }
  while (Math.abs(cy - toGy) > STEP_SIZE * 0.55) {
    cy = cy < toGy ? cy + STEP_SIZE : cy - STEP_SIZE
    steps.push({ gx: toGx, gy: +(cy.toFixed(1)) })
  }
  steps.push({ gx: toGx, gy: toGy })
  return steps
}

function initMoveStates(): Record<AgentId, MoveState> {
  const states = {} as Record<AgentId, MoveState>
  for (const [id, pos] of Object.entries(DESK_POS) as [AgentId, AgentLayout][]) {
    states[id] = { gx: pos.gx, gy: pos.gy, path: [], dwellTicks: 18 + Math.floor(Math.random() * 22), walking: false, destIdx: 0 }
  }
  return states
}

// ─── Componente ────────────────────────────────────────────────────────
export default function PixelOfficeScene({
  inMeeting,
  agentStatus,
  onToggleAgent,
  onCallAll,
  onExitMeeting,
  isRunning,
  messages = [],
  activeRoom = 'creative',
}: Props) {
  // T185.3e/h: agentStatus, onToggleAgent agora usados em overlays
  void inMeeting; void onCallAll; void onExitMeeting; void messages; void activeRoom

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const singlesRef = useRef<Record<SingleSprite, HTMLImageElement> | null>(null)
  const moveStatesRef = useRef<Record<AgentId, MoveState>>(initMoveStates())
  const tickRef = useRef(0)
  const [assetsLoaded, setAssetsLoaded] = useState(false)
  // T185.3d — speech bubbles state + overlay tick (re-render do overlay HTML sincronizado com canvas)
  const [bubbles, setBubbles] = useState<Partial<Record<AgentId, string>>>({})
  const [overlayTick, setOverlayTick] = useState(0)

  // ── Load assets (1x) ──
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const singles = {} as Record<SingleSprite, HTMLImageElement>
        for (const [key, src] of Object.entries(SINGLES)) {
          singles[key as SingleSprite] = await loadImage(src)
        }
        if (cancelled) return
        singlesRef.current = singles
        setAssetsLoaded(true)
      } catch (e) {
        console.error('PixelOfficeScene assets load error:', e)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // ── Ticker: walking + dwell + render (350ms) ──
  useEffect(() => {
    if (!assetsLoaded) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = COLS * TILE_DST
    canvas.height = ROWS * TILE_DST
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    const tick = () => {
      if (!isRunning) {
        const states = moveStatesRef.current
        for (const id of Object.keys(states) as AgentId[]) {
          const ms = states[id]
          if (ms.walking && ms.path.length > 0) {
            const next = ms.path[0]
            ms.gx = next.gx
            ms.gy = next.gy
            ms.path = ms.path.slice(1)
            if (ms.path.length === 0) {
              ms.walking = false
              ms.dwellTicks = 18 + Math.floor(Math.random() * 22)
            }
          } else {
            ms.dwellTicks -= 1
            if (ms.dwellTicks <= 0) {
              const dests = ROUTINE_DESTS[id]
              if (dests && dests.length > 0) {
                ms.destIdx = (ms.destIdx + 1) % dests.length
                const dest = dests[ms.destIdx]
                ms.path = makePath(ms.gx, ms.gy, dest.gx, dest.gy)
                ms.walking = ms.path.length > 0
              }
            }
          }
        }
      }
      tickRef.current += 1
      renderScene(ctx, singlesRef.current!, moveStatesRef.current, tickRef.current)
      // T185.3d: força re-render do overlay HTML pra acompanhar movimento dos bubbles
      setOverlayTick(t => t + 1)
    }

    renderScene(ctx, singlesRef.current!, moveStatesRef.current, 0)
    const interval = setInterval(tick, TICK_MS)
    return () => clearInterval(interval)
  }, [assetsLoaded, isRunning])

  // ── T185.3d — Idle quotes (a cada 6-14s, agente parado fala por 4.5s) ──
  useEffect(() => {
    if (!assetsLoaded || isRunning) return
    let timeoutId: ReturnType<typeof setTimeout>
    const schedule = () => {
      const delay = 6000 + Math.random() * 8000
      timeoutId = setTimeout(() => {
        const ids = (Object.keys(moveStatesRef.current) as AgentId[])
          .filter(id => !moveStatesRef.current[id].walking)
        if (ids.length > 0) {
          const id = ids[Math.floor(Math.random() * ids.length)]
          const quotes = IDLE_QUOTES[id]
          if (quotes && quotes.length > 0) {
            const quote = quotes[Math.floor(Math.random() * quotes.length)]
            setBubbles(b => ({ ...b, [id]: quote }))
            setTimeout(() => {
              setBubbles(b => {
                const next = { ...b }
                delete next[id]
                return next
              })
            }, 4500)
          }
        }
        schedule()
      }, delay)
    }
    schedule()
    return () => clearTimeout(timeoutId)
  }, [assetsLoaded, isRunning])

  // T185.3d — overlay tick força este componente a re-renderizar quando posição muda
  void overlayTick
  const canvasW = COLS * TILE_DST
  const canvasH = ROWS * TILE_DST

  return (
    <div className="w-full h-full flex items-center justify-center bg-stone-200 overflow-auto">
      {!assetsLoaded && (
        <div className="text-center text-xs font-mono text-stone-600">
          <div className="inline-block w-10 h-10 border-4 border-stone-400 border-t-stone-900 rounded-full animate-spin mb-2" />
          <div>Carregando assets LimeZu...</div>
        </div>
      )}
      {/* T185.3d — wrapper relative pra posicionar bubbles HTML sobre o canvas */}
      <div className="relative" style={{ width: canvasW, height: canvasH, display: assetsLoaded ? 'block' : 'none' }}>
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: 'pixelated',
            display: 'block',
            width: canvasW,
            height: canvasH,
          }}
        />
        {/* T185.3h — Hit areas clicáveis sobre cada agente */}
        {(Object.keys(DESK_POS) as AgentId[]).map(id => {
          const ms = moveStatesRef.current[id]
          if (!ms) return null
          const left = ms.gx * TILE_DST - 4
          const top = ms.gy * TILE_DST - 36
          return (
            <button
              key={`hit-${id}`}
              onClick={() => { if (!isRunning) onToggleAgent(id) }}
              disabled={isRunning}
              title={isRunning ? 'Aguarde pipeline terminar' : id}
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                width: TILE_DST + 8,
                height: 44,
                zIndex: 8,
                background: 'transparent',
                cursor: isRunning ? 'not-allowed' : 'pointer',
              }}
              className="border-0 hover:bg-yellow-300/10 transition-colors rounded"
            />
          )
        })}

        {/* T185.3e — Status overlays (halo speaking, badge done/error, balão thinking) */}
        {(Object.keys(DESK_POS) as AgentId[]).map(id => {
          const ms = moveStatesRef.current[id]
          if (!ms) return null
          const status = agentStatus[id]
          if (!status || status === 'idle') return null
          const cx = ms.gx * TILE_DST + TILE_DST / 2
          const cy = ms.gy * TILE_DST + TILE_DST / 2 - 20

          // Halo speaking (anel azul pulsante atrás do char)
          if (status === 'speaking') {
            return (
              <div key={`s-${id}`}
                style={{
                  position: 'absolute',
                  left: `${cx - 24}px`,
                  top: `${cy - 24}px`,
                  width: 48, height: 48,
                  pointerEvents: 'none',
                  zIndex: 5,
                }}
                className="rounded-full border-2 border-blue-400 animate-ping opacity-60"
              />
            )
          }
          // Badge thinking (balão "...")
          if (status === 'thinking') {
            return (
              <div key={`t-${id}`}
                style={{
                  position: 'absolute',
                  left: `${cx}px`,
                  top: `${cy - 40}px`,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
                className="px-2 py-1 bg-purple-500 text-white rounded-full text-[10px] font-bold shadow-lg animate-pulse"
              >...</div>
            )
          }
          // Badge done (✓ verde)
          if (status === 'done') {
            return (
              <div key={`d-${id}`}
                style={{
                  position: 'absolute',
                  left: `${cx + 12}px`,
                  top: `${cy - 28}px`,
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
                className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow"
              >✓</div>
            )
          }
          // Badge error (✕ vermelho)
          if (status === 'error') {
            return (
              <div key={`e-${id}`}
                style={{
                  position: 'absolute',
                  left: `${cx + 12}px`,
                  top: `${cy - 28}px`,
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
                className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow"
              >✕</div>
            )
          }
          return null
        })}

        {/* Speech bubbles */}
        {Object.entries(bubbles).map(([id, quote]) => {
          const ms = moveStatesRef.current[id as AgentId]
          if (!ms) return null
          // pos: acima da cabeça do agente
          const left = ms.gx * TILE_DST + TILE_DST / 2
          const top = ms.gy * TILE_DST - 50
          return (
            <div
              key={id}
              style={{
                position: 'absolute',
                left: `${left}px`,
                top: `${top}px`,
                transform: 'translateX(-50%)',
                pointerEvents: 'none',
                zIndex: 10,
              }}
              className="px-2 py-1 bg-white border border-stone-900 rounded-lg text-[10px] font-mono whitespace-nowrap shadow-lg max-w-[200px]"
            >
              {quote}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${src}`))
    img.src = src
  })
}

function renderScene(
  ctx: CanvasRenderingContext2D,
  singles: Record<SingleSprite, HTMLImageElement>,
  states: Record<AgentId, MoveState>,
  tick: number,
) {
  ctx.imageSmoothingEnabled = false

  // Helper: desenha PNG single num tile dst escalando 2x
  const drawSingle = (key: SingleSprite, dxTile: number, dyTile: number) => {
    const img = singles[key]
    if (!img) return
    const dstW = (img.width / TILE_SRC) * TILE_DST
    const dstH = (img.height / TILE_SRC) * TILE_DST
    ctx.drawImage(img, dxTile * TILE_DST, dyTile * TILE_DST, dstW, dstH)
  }

  // ─── 1. PISO por zona ───
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let color = '#e8d5b8'
      if (c >= 11 && c < 27) color = '#f0e3cf'
      else if (c >= 27) color = '#dde4ea'
      ctx.fillStyle = color
      ctx.fillRect(c * TILE_DST, r * TILE_DST, TILE_DST, TILE_DST)
      if ((r + c) % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.03)'
        ctx.fillRect(c * TILE_DST, r * TILE_DST, TILE_DST, TILE_DST)
      }
    }
  }

  // ─── 2. PAREDE TOPO + 5 janelas ───
  ctx.fillStyle = '#a67c52'
  ctx.fillRect(0, 0, COLS * TILE_DST, TILE_DST)
  ctx.fillStyle = '#c89968'
  ctx.fillRect(0, 0, COLS * TILE_DST, 4)
  ctx.fillStyle = '#87ceeb'
  for (let i = 0; i < 5; i++) {
    ctx.fillRect((4 + i * 7) * TILE_DST, 4, 4 * TILE_DST, TILE_DST - 8)
  }

  // ─── 3. RECEPÇÃO ─── (balcão painted + cama Hospital + plantas)
  drawDesk(ctx, 2, 3, 6, 2, '#8b6f47')   // balcão recepção pintado canvas-2D
  drawSingle('plant_yellow', 1, 2)
  drawSingle('plant_green', 8, 2)
  drawSingle('armchair_pink', 2, 9)
  drawSingle('armchair_pink', 5, 9)
  drawSingle('armchair_pink', 8, 9)

  // ─── 4. MARKETING — 2 mesas longas com cadeiras + monitores ───
  drawDesk(ctx, 12, 7, 12, 2, '#8b6f47')
  for (let i = 0; i < 4; i++) {
    drawSingle('swivel_chair', 13 + i * 3, 9.5)
    drawMonitor(ctx, (13 + i * 3) * TILE_DST + 4, 7 * TILE_DST + 4)
  }
  drawDesk(ctx, 12, 13, 12, 2, '#8b6f47')
  for (let i = 0; i < 3; i++) {
    drawSingle('swivel_chair', 14 + i * 4, 15.5)
    drawMonitor(ctx, (14 + i * 4) * TILE_DST + 4, 13 * TILE_DST + 4)
  }

  // ─── 5. ADMIN — 2 mesas longas ───
  drawDesk(ctx, 29, 7, 8, 2, '#8b6f47')
  for (let i = 0; i < 2; i++) {
    drawSingle('swivel_chair', 30 + i * 3, 9.5)
    drawMonitor(ctx, (30 + i * 3) * TILE_DST + 4, 7 * TILE_DST + 4)
  }
  drawDesk(ctx, 29, 13, 8, 2, '#8b6f47')
  for (let i = 0; i < 2; i++) {
    drawSingle('swivel_chair', 30 + i * 3, 15.5)
    drawMonitor(ctx, (30 + i * 3) * TILE_DST + 4, 13 * TILE_DST + 4)
  }

  // ─── 6. ÁREA CENTRAL — tapete + 4 poltronas + mesa de café + mascote ───
  ctx.fillStyle = 'rgba(232, 196, 168, 0.45)'
  ctx.fillRect(13 * TILE_DST, 17 * TILE_DST, 8 * TILE_DST, 4 * TILE_DST)
  ctx.strokeStyle = 'rgba(180, 120, 80, 0.65)'
  ctx.lineWidth = 2
  ctx.strokeRect(13 * TILE_DST, 17 * TILE_DST, 8 * TILE_DST, 4 * TILE_DST)
  // 4 poltronas em volta da mesa de café central
  drawSingle('armchair_pink', 13, 17.5)
  drawSingle('armchair_double', 16, 17.5)
  drawSingle('armchair_pink', 20, 17.5)
  // Mesa de café central pintada
  drawCoffeeTable(ctx, 15 * TILE_DST, 19 * TILE_DST, 4 * TILE_DST, TILE_DST)
  // Plantas flanqueando
  drawSingle('plant_green', 11, 18)
  drawSingle('plant_yellow', 22, 18)
  // Mascote gato
  drawCatMascot(ctx, 16 * TILE_DST + 8, 19 * TILE_DST + 4)

  // ─── 7. COPA — geladeira + microondas + bancada (canvas-2D pintado) ───
  drawKitchen(ctx, 35 * TILE_DST, 3 * TILE_DST)

  // ─── 8. ESTANTES nos cantos ───
  drawSingle('bookshelf', 1, 13)
  drawSingle('bookshelf', 38, 13)

  // ─── 9. AVATARES custom canvas-2D (24×40 px, 12 únicos) ───
  // T185.3b-fix2: chars desenhados primitivos com cabelo + camisa + pele
  // distintos por agente. Garantia de visibilidade (não tiny como chibi LimeZu).
  for (const [id, ms] of Object.entries(states) as [AgentId, MoveState][]) {
    const layout = DESK_POS[id]
    if (!layout) continue
    // pos: alinha pé do avatar com centro do tile
    const cx = ms.gx * TILE_DST + TILE_DST / 2  // centro horizontal
    const cy = ms.gy * TILE_DST + TILE_DST     // base no chão
    const bob = ms.walking ? (tick % 2 === 0 ? 0 : -2) : (tick % 4 < 2 ? 0 : -1)
    drawAvatar(ctx, cx, cy + bob, layout)
  }
}

// ─── Desenha avatar pixel-art chibi 24×40 em canvas-2D ──────────────────
function drawAvatar(ctx: CanvasRenderingContext2D, cx: number, by: number, a: AgentLayout) {
  // cx = centro horizontal, by = base (pés tocam aqui)
  // Tamanho total: 24 wide × 40 tall. Coords relativas:
  //  pés:    by-2 .. by    (2px)
  //  pernas: by-12 .. by-2 (10px)
  //  tronco: by-26 .. by-12 (14px)
  //  cabeça: by-40 .. by-26 (14px)
  const x = cx - 12  // canto-esq do char (24 wide)

  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(cx, by, 12, 3, 0, 0, Math.PI * 2)
  ctx.fill()

  // sapatos
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(x + 6, by - 3, 5, 3)
  ctx.fillRect(x + 13, by - 3, 5, 3)

  // pernas (calça escura)
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(x + 7, by - 12, 4, 9)
  ctx.fillRect(x + 13, by - 12, 4, 9)

  // tronco (camisa cor agente)
  ctx.fillStyle = a.shirt
  ctx.fillRect(x + 4, by - 26, 16, 14)
  // detalhe colarinho
  ctx.fillStyle = shadeColor(a.shirt, -30)
  ctx.fillRect(x + 4, by - 26, 16, 2)
  // gola/decote
  ctx.fillStyle = a.skin
  ctx.fillRect(x + 10, by - 26, 4, 3)

  // braços (cor camisa)
  ctx.fillStyle = a.shirt
  ctx.fillRect(x + 1, by - 24, 3, 10)
  ctx.fillRect(x + 20, by - 24, 3, 10)
  // mãos
  ctx.fillStyle = a.skin
  ctx.fillRect(x + 1, by - 14, 3, 2)
  ctx.fillRect(x + 20, by - 14, 3, 2)

  // cabeça (chibi grande — característica do LimeZu)
  ctx.fillStyle = a.skin
  ctx.fillRect(x + 6, by - 40, 12, 14)
  // bochechas
  ctx.fillStyle = shadeColor(a.skin, -10)
  ctx.fillRect(x + 6, by - 32, 1, 2)
  ctx.fillRect(x + 17, by - 32, 1, 2)
  // olhos
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(x + 9, by - 34, 2, 2)
  ctx.fillRect(x + 13, by - 34, 2, 2)
  // boca
  ctx.fillStyle = '#7c2d12'
  ctx.fillRect(x + 11, by - 30, 2, 1)

  // cabelo (forma varia por gender)
  ctx.fillStyle = a.hair
  if (a.gender === 'f') {
    // fem: cabelo cobre topo + dos lados ATÉ ombros
    ctx.fillRect(x + 5, by - 41, 14, 6)
    ctx.fillRect(x + 4, by - 36, 2, 10)   // mecha esq
    ctx.fillRect(x + 18, by - 36, 2, 10)  // mecha dir
  } else {
    // masc: cabelo só topo
    ctx.fillRect(x + 6, by - 41, 12, 5)
    // suíça lateral discreta
    ctx.fillRect(x + 6, by - 36, 1, 3)
    ctx.fillRect(x + 17, by - 36, 1, 3)
  }
}

function shadeColor(hex: string, percent: number): string {
  const num = parseInt(hex.slice(1), 16)
  const amt = Math.round(2.55 * percent)
  const r = Math.max(0, Math.min(255, (num >> 16) + amt))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (num & 0xff) + amt))
  return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
}

// ─── Helpers de desenho canvas-2D pros móveis sem PNG ──────────────────
function drawDesk(ctx: CanvasRenderingContext2D, col: number, row: number, wTiles: number, hTiles: number, color: string) {
  const x = col * TILE_DST, y = row * TILE_DST
  const w = wTiles * TILE_DST, h = hTiles * TILE_DST
  // tampo (gradiente sutil)
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
  // brilho topo
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.fillRect(x, y, w, 4)
  // borda inferior escura
  ctx.fillStyle = '#5a4a30'
  ctx.fillRect(x, y + h - 4, w, 4)
  // pernas pretas
  ctx.fillStyle = '#2a2a2a'
  for (let i = 0; i < wTiles; i += 2) {
    ctx.fillRect(x + i * TILE_DST + 8, y + h, 6, 6)
    ctx.fillRect(x + (i + 1) * TILE_DST + 18, y + h, 6, 6)
  }
}

function drawMonitor(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // tela
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(x, y, 24, 18)
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(x + 2, y + 2, 20, 14)
  // base
  ctx.fillStyle = '#525252'
  ctx.fillRect(x + 8, y + 18, 8, 4)
  ctx.fillRect(x + 4, y + 22, 16, 2)
  // linhas de "código"
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillRect(x + 4, y + 5, 10, 1)
  ctx.fillRect(x + 4, y + 8, 14, 1)
  ctx.fillRect(x + 4, y + 11, 8, 1)
}

function drawCoffeeTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#c89968'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#8b6f47'
  ctx.fillRect(x, y, w, 3)
  ctx.fillRect(x, y + h - 3, w, 3)
  // 3 canecas em cima
  for (let i = 0; i < 3; i++) {
    const cx = x + (i + 1) * w / 4
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(cx - 3, y + 4, 6, 6)
    ctx.fillStyle = '#fbbf24'
    ctx.fillRect(cx - 2, y + 5, 4, 4)
  }
}

function drawKitchen(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // geladeira branca
  ctx.fillStyle = '#f5f5f5'
  ctx.fillRect(x, y, 48, 96)
  ctx.fillStyle = '#d0d0d0'
  ctx.fillRect(x + 2, y + 2, 44, 92)
  ctx.fillStyle = '#525252'
  ctx.fillRect(x + 40, y + 36, 4, 24)
  // microondas em cima
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(x + 52, y, 48, 24)
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(x + 54, y + 2, 32, 20)
  ctx.fillStyle = '#fbbf24'
  ctx.fillRect(x + 58, y + 6, 24, 12)
  // bancada
  ctx.fillStyle = '#d4c4a8'
  ctx.fillRect(x + 52, y + 24, 96, 24)
  ctx.fillStyle = '#a67c52'
  ctx.fillRect(x + 52, y + 48, 96, 48)
  ctx.fillStyle = '#5a4a30'
  ctx.fillRect(x + 52, y + 48, 96, 4)
  // cafeteira
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(x + 108, y + 4, 12, 20)
  ctx.fillStyle = '#3b82f6'
  ctx.fillRect(x + 110, y + 8, 8, 4)
  // pia
  ctx.fillStyle = '#a0a0a0'
  ctx.fillRect(x + 124, y + 28, 20, 16)
  ctx.fillStyle = '#525252'
  ctx.fillRect(x + 126, y + 30, 16, 12)
}

function drawCatMascot(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(x, y + 14, 28, 4)
  ctx.fillStyle = '#9ca3af'
  ctx.fillRect(x + 2, y + 8, 24, 8)
  ctx.fillRect(x + 4, y + 4, 12, 6)
  ctx.fillStyle = '#525252'
  ctx.fillRect(x + 4, y + 2, 2, 2)
  ctx.fillRect(x + 14, y + 2, 2, 2)
  ctx.fillStyle = '#52525b'
  ctx.fillRect(x + 8, y + 10, 2, 4)
  ctx.fillRect(x + 16, y + 10, 2, 4)
  ctx.fillRect(x + 22, y + 10, 2, 4)
  ctx.fillStyle = '#1f2937'
  ctx.fillRect(x + 6, y + 6, 2, 2)
  ctx.fillRect(x + 12, y + 6, 2, 2)
  ctx.fillStyle = '#9ca3af'
  ctx.fillRect(x + 26, y + 8, 2, 4)
  ctx.fillRect(x + 28, y + 6, 2, 4)
  ctx.fillStyle = '#3b82f6'
  ctx.font = 'bold 10px monospace'
  ctx.fillText('z', x + 18, y + 4)
  ctx.fillText('z', x + 24, y - 2)
}
