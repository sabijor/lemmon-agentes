import { TW, TH, WH, RECEP_COLS, RECEP_ROWS, rsx, rsy } from './constants'

// ─── Reception room primitives ───────────────────────────────────────
function RBox({ gx, gy, w = 1, d = 1, h = 32, top, left, right }: {
  gx: number; gy: number; w?: number; d?: number; h?: number
  top: string; left: string; right: string
}) {
  const p = (arr: [number, number][]) => arr.map(v => v.join(',')).join(' ')
  const T = (x: number, y: number): [number, number] => [x, y]
  const bk = T(rsx(gx, gy), rsy(gx, gy) - h)
  const rt = T(rsx(gx + w, gy), rsy(gx + w, gy) - h)
  const lf = T(rsx(gx, gy + d), rsy(gx, gy + d) - h)
  const fr = T(rsx(gx + w, gy + d), rsy(gx + w, gy + d) - h)
  const rtB = T(rsx(gx + w, gy), rsy(gx + w, gy))
  const lfB = T(rsx(gx, gy + d), rsy(gx, gy + d))
  const frB = T(rsx(gx + w, gy + d), rsy(gx + w, gy + d))
  return (
    <g>
      <polygon points={p([rt, fr, frB, rtB])} fill={right} />
      <polygon points={p([lf, fr, frB, lfB])} fill={left} />
      <polygon points={p([bk, rt, fr, lf])} fill={top} />
    </g>
  )
}

function RTile({ gx, gy, fill }: { gx: number; gy: number; fill: string }) {
  const x = rsx(gx, gy), y = rsy(gx, gy)
  return (
    <polygon points={`${x},${y} ${x + TW / 2},${y + TH / 2} ${x},${y + TH} ${x - TW / 2},${y + TH / 2}`}
      fill={fill} stroke="#b8b8b0" strokeWidth="0.4" />
  )
}

function RWallRect({ wall, g1, g2, h1, h2, fill, opacity }: {
  wall: 'left' | 'right'; g1: number; g2: number
  h1: number; h2: number; fill?: string; opacity?: string | number
}) {
  const pts = wall === 'left'
    ? [[rsx(0, g1), rsy(0, g1) - h2], [rsx(0, g2), rsy(0, g2) - h2],
      [rsx(0, g2), rsy(0, g2) - h1], [rsx(0, g1), rsy(0, g1) - h1]]
    : [[rsx(g1, 0), rsy(g1, 0) - h2], [rsx(g2, 0), rsy(g2, 0) - h2],
      [rsx(g2, 0), rsy(g2, 0) - h1], [rsx(g1, 0), rsy(g1, 0) - h1]]
  return <polygon points={pts.map(p => p.join(',')).join(' ')} fill={fill ?? 'none'} opacity={opacity} />
}

// ─── Reception room furniture ─────────────────────────────────────────
function ReceptionCounter({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <RBox gx={gx} gy={gy} w={3.5} d={1} h={26} top="#e8e4dc" left="#d4d0c8" right="#dcdad0" />
      <RBox gx={gx + 0.1} gy={gy + 0.05} w={3.3} d={0.06} h={36} top="#f5f3ef" left="#e8e4dc" right="#f0eee8" />
      <RBox gx={gx + 0.4} gy={gy + 0.1} w={0.05} d={0.2} h={28} top="#374151" left="#1f2937" right="#374151" />
      <RBox gx={gx + 0.3} gy={gy + 0.1} w={0.8} d={0.06} h={52} top="#0f172a" left="#020617" right="#0f172a" />
      <RBox gx={gx + 0.32} gy={gy + 0.11} w={0.76} d={0.05} h={48} top="#1e3a8a" left="#172554" right="#1e3a8a" />
      <RBox gx={gx + 2.8} gy={gy + 0.2} w={0.25} d={0.25} h={32} top="#f0fdf4" left="#dcfce7" right="#f0fdf4" />
    </g>
  )
}

function ReceptionistChair({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <RBox gx={gx} gy={gy} w={0.7} d={0.7} h={14} top="#374151" left="#1f2937" right="#374151" />
      <RBox gx={gx + 0.05} gy={gy + 0.58} w={0.6} d={0.1} h={44} top="#374151" left="#1f2937" right="#374151" />
    </g>
  )
}

function ReceptionSofa({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <RBox gx={gx} gy={gy} w={2.2} d={0.2} h={44} top="#6b7280" left="#4b5563" right="#52606e" />
      <RBox gx={gx} gy={gy} w={0.2} d={1.2} h={32} top="#6b7280" left="#4b5563" right="#52606e" />
      <RBox gx={gx + 2.0} gy={gy} w={0.2} d={1.2} h={32} top="#6b7280" left="#4b5563" right="#52606e" />
      <RBox gx={gx} gy={gy} w={2.2} d={1.2} h={20} top="#9ca3af" left="#6b7280" right="#7c8a99" />
      <RBox gx={gx + 0.2} gy={gy + 0.1} w={0.85} d={0.9} h={25} top="#d1d5db" left="#9ca3af" right="#b0b8c4" />
      <RBox gx={gx + 1.15} gy={gy + 0.1} w={0.85} d={0.9} h={25} top="#d1d5db" left="#9ca3af" right="#b0b8c4" />
    </g>
  )
}

function ReceptionTable({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <RBox gx={gx} gy={gy} w={1.2} d={0.8} h={14} top="#f5f3ef" left="#e8e4dc" right="#eeece4" />
      <RBox gx={gx + 0.15} gy={gy + 0.1} w={0.5} d={0.4} h={16} top="#1e40af" left="#1e3a8a" right="#1e40af" />
      <RBox gx={gx + 0.8} gy={gy + 0.25} w={0.18} d={0.18} h={20} top="#bae6fd" left="#7dd3fc" right="#93c5fd" />
    </g>
  )
}

function RPlant({ gx, gy }: { gx: number; gy: number }) {
  const x = rsx(gx, gy) + TW / 2 - 4, y = rsy(gx, gy) + TH / 2
  return (
    <g>
      <polygon points={`${x - 8},${y - 5} ${x + 8},${y - 5} ${x + 6},${y + 1} ${x - 6},${y + 1}`} fill="#92400e" />
      <polygon points={`${x - 10},${y - 10} ${x + 10},${y - 10} ${x + 8},${y - 5} ${x - 8},${y - 5}`} fill="#b45309" />
      <line x1={x} y1={y - 10} x2={x - 4} y2={y - 44} stroke="#15803d" strokeWidth="2" />
      <line x1={x} y1={y - 10} x2={x + 5} y2={y - 40} stroke="#15803d" strokeWidth="1.5" />
      <ellipse cx={x - 9} cy={y - 40} rx={13} ry={6} fill="#16a34a" transform={`rotate(-28,${x - 9},${y - 40})`} />
      <ellipse cx={x + 10} cy={y - 38} rx={13} ry={6} fill="#15803d" transform={`rotate(28,${x + 10},${y - 38})`} />
      <ellipse cx={x} cy={y - 48} rx={11} ry={5.5} fill="#22c55e" />
    </g>
  )
}

// ─── Reception room background ───────────────────────────────────────
export function ReceptionBackground() {
  const P = (pts: [number, number][]) => pts.map(v => v.join(',')).join(' ')
  const T = (x: number, y: number): [number, number] => [x, y]
  const leftWall = [T(rsx(0, 0), rsy(0, 0) - WH), T(rsx(0, RECEP_ROWS), rsy(0, RECEP_ROWS) - WH), T(rsx(0, RECEP_ROWS), rsy(0, RECEP_ROWS)), T(rsx(0, 0), rsy(0, 0))]
  const rightWall = [T(rsx(0, 0), rsy(0, 0) - WH), T(rsx(RECEP_COLS, 0), rsy(RECEP_COLS, 0) - WH), T(rsx(RECEP_COLS, 0), rsy(RECEP_COLS, 0)), T(rsx(0, 0), rsy(0, 0))]

  const tiles: { gx: number; gy: number }[] = []
  for (let gx = 0; gx < RECEP_COLS; gx++) for (let gy = 0; gy < RECEP_ROWS; gy++) tiles.push({ gx, gy })
  tiles.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy))

  return (
    <>
      <polygon points={P(rightWall)} fill="#c8c0b8" />
      <polygon points={P(leftWall)} fill="#b8b0a8" />
      {Array.from({ length: RECEP_COLS }, (_, i) => (
        <line key={`rrw${i}`} x1={rsx(i, 0)} y1={rsy(i, 0) - WH} x2={rsx(i + 1, 0)} y2={rsy(i + 1, 0) - WH} stroke="#a8a098" strokeWidth="0.6" opacity="0.5" />
      ))}
      {Array.from({ length: RECEP_ROWS }, (_, i) => (
        <line key={`rlw${i}`} x1={rsx(0, i)} y1={rsy(0, i) - WH} x2={rsx(0, i + 1)} y2={rsy(0, i + 1) - WH} stroke="#989088" strokeWidth="0.6" opacity="0.5" />
      ))}
      <line x1={rsx(0, 0)} y1={rsy(0, 0) - WH} x2={rsx(0, RECEP_ROWS)} y2={rsy(0, RECEP_ROWS) - WH} stroke="#888078" strokeWidth="2" />
      <line x1={rsx(0, 0)} y1={rsy(0, 0) - WH} x2={rsx(RECEP_COLS, 0)} y2={rsy(RECEP_COLS, 0) - WH} stroke="#888078" strokeWidth="2" />

      <RWallRect wall="left" g1={1} g2={4} h1={50} h2={82} fill="#1c1917" />
      <RWallRect wall="left" g1={1.1} g2={3.9} h1={54} h2={79} fill="#f8fafc" opacity="0.95" />
      <RWallRect wall="left" g1={1.3} g2={2.0} h1={60} h2={73} fill="#d97706" opacity="0.8" />
      <RWallRect wall="left" g1={2.2} g2={3.7} h1={62} h2={66} fill="#1c1917" opacity="0.7" />
      <RWallRect wall="left" g1={2.2} g2={3.7} h1={68} h2={72} fill="#1c1917" opacity="0.5" />

      <RWallRect wall="right" g1={1} g2={5} h1={18} h2={82} fill="#4a3828" />
      <RWallRect wall="right" g1={1.1} g2={4.9} h1={22} h2={79} fill="#0f172a" />
      <RWallRect wall="right" g1={1.1} g2={4.9} h1={22} h2={50} fill="#1e3a5f" opacity="0.7" />
      <RWallRect wall="right" g1={1.2} g2={2.4} h1={22} h2={65} fill="#0a0e1a" />
      <RWallRect wall="right" g1={2.6} g2={3.8} h1={22} h2={74} fill="#0a0e1a" />
      <RWallRect wall="right" g1={4.0} g2={4.8} h1={22} h2={58} fill="#0a0e1a" />
      <RWallRect wall="right" g1={1.5} g2={1.7} h1={52} h2={56} fill="#fbbf24" opacity="0.8" />
      <RWallRect wall="right" g1={3.2} g2={3.4} h1={60} h2={64} fill="#fbbf24" opacity="0.7" />

      {tiles.map(({ gx, gy }) => {
        const fill = (gx + gy) % 2 === 0 ? '#e8e4dc' : '#dddad0'
        return <RTile key={`rt${gx}-${gy}`} gx={gx} gy={gy} fill={fill} />
      })}

      <RPlant gx={0} gy={0} />
      <RPlant gx={7} gy={0} />
      <ReceptionCounter gx={0.5} gy={0} />
      <ReceptionistChair gx={1.8} gy={1.3} />
      <ReceptionSofa gx={5} gy={0.5} />
      <ReceptionTable gx={4.8} gy={3} />
      <RPlant gx={0} gy={6} />
    </>
  )
}
