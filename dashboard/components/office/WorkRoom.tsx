import { TW, TH, WH, COLS, ROWS, sx, sy } from './constants'

// ─── Work room primitives ─────────────────────────────────────────────
function Box({ gx, gy, w = 1, d = 1, h = 32, top, left, right }: {
  gx: number; gy: number; w?: number; d?: number; h?: number
  top: string; left: string; right: string
}) {
  const p = (arr: [number, number][]) => arr.map(v => v.join(',')).join(' ')
  const T = (x: number, y: number): [number, number] => [x, y]
  const bk = T(sx(gx, gy), sy(gx, gy) - h)
  const rt = T(sx(gx + w, gy), sy(gx + w, gy) - h)
  const lf = T(sx(gx, gy + d), sy(gx, gy + d) - h)
  const fr = T(sx(gx + w, gy + d), sy(gx + w, gy + d) - h)
  const rtB = T(sx(gx + w, gy), sy(gx + w, gy))
  const lfB = T(sx(gx, gy + d), sy(gx, gy + d))
  const frB = T(sx(gx + w, gy + d), sy(gx + w, gy + d))
  return (
    <g>
      <polygon points={p([rt, fr, frB, rtB])} fill={right} />
      <polygon points={p([lf, fr, frB, lfB])} fill={left} />
      <polygon points={p([bk, rt, fr, lf])} fill={top} />
    </g>
  )
}

function Tile({ gx, gy, fill }: { gx: number; gy: number; fill: string }) {
  const x = sx(gx, gy), y = sy(gx, gy)
  return (
    <polygon points={`${x},${y} ${x + TW / 2},${y + TH / 2} ${x},${y + TH} ${x - TW / 2},${y + TH / 2}`}
      fill={fill} stroke="#c8b890" strokeWidth="0.4" />
  )
}

function WallRect({ wall, g1, g2, h1, h2, fill, stroke, sw, opacity }: {
  wall: 'left' | 'right'; g1: number; g2: number
  h1: number; h2: number; fill?: string; stroke?: string; sw?: number; opacity?: string | number
}) {
  const pts = wall === 'left'
    ? [[sx(0, g1), sy(0, g1) - h2], [sx(0, g2), sy(0, g2) - h2],
      [sx(0, g2), sy(0, g2) - h1], [sx(0, g1), sy(0, g1) - h1]]
    : [[sx(g1, 0), sy(g1, 0) - h2], [sx(g2, 0), sy(g2, 0) - h2],
      [sx(g2, 0), sy(g2, 0) - h1], [sx(g1, 0), sy(g1, 0) - h1]]
  return (
    <polygon points={pts.map(p => p.join(',')).join(' ')}
      fill={fill ?? 'none'} stroke={stroke} strokeWidth={sw} opacity={opacity} />
  )
}

// ─── Work room furniture ──────────────────────────────────────────────
function Desk({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={2} d={1} h={20} top="#a07840" left="#7a5830" right="#8b6838" />
      <Box gx={gx + 0.55} gy={gy + 0.25} w={0.2} d={0.3} h={28} top="#374151" left="#1f2937" right="#374151" />
      <Box gx={gx + 0.2} gy={gy + 0.08} w={0.85} d={0.12} h={42} top="#1e40af" left="#1e3a8a" right="#1d4ed8" />
      <Box gx={gx + 0.23} gy={gy + 0.1} w={0.79} d={0.06} h={40} top="#3b82f628" left="#3b82f610" right="#3b82f610" />
      <Box gx={gx + 0.6} gy={gy + 0.55} w={0.75} d={0.25} h={4} top="#6b7280" left="#4b5563" right="#6b7280" />
    </g>
  )
}

function AyaDesk({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={2.2} d={1.1} h={20} top="#e2e8f0" left="#cbd5e1" right="#dde4ed" />
      <Box gx={gx + 0.5} gy={gy + 0.15} w={1.1} d={0.1} h={46} top="#0ea5e9" left="#0284c7" right="#0ea5e9" />
      <Box gx={gx + 0.52} gy={gy + 0.17} w={1.06} d={0.06} h={44} top="#38bdf840" left="#38bdf820" right="#38bdf820" />
      <Box gx={gx + 0.95} gy={gy + 0.35} w={0.2} d={0.3} h={26} top="#94a3b8" left="#64748b" right="#94a3b8" />
    </g>
  )
}

function Chair({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={0.7} d={0.7} h={13} top="#795548" left="#5d4037" right="#6d4c41" />
      <Box gx={gx + 0.05} gy={gy + 0.6} w={0.6} d={0.08} h={28} top="#6d4c41" left="#5d4037" right="#6d4c41" />
    </g>
  )
}

function ExecutiveChair({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={0.75} d={0.75} h={14} top="#1c1917" left="#111827" right="#221c1a" />
      <Box gx={gx + 0.05} gy={gy + 0.62} w={0.65} d={0.1} h={52} top="#1c1917" left="#111827" right="#221c1a" />
      <Box gx={gx + 0.1} gy={gy + 0.63} w={0.55} d={0.07} h={47} top="#2d1f1a" left="#231714" right="#281a15" />
      <Box gx={gx} gy={gy + 0.05} w={0.1} d={0.6} h={22} top="#4b5563" left="#374151" right="#4b5563" />
      <Box gx={gx + 0.65} gy={gy + 0.05} w={0.1} d={0.6} h={22} top="#4b5563" left="#374151" right="#4b5563" />
    </g>
  )
}

function Sofa({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={2.4} d={0.22} h={48} top="#b91c1c" left="#7f1d1d" right="#991b1b" />
      <Box gx={gx} gy={gy} w={0.22} d={1.3} h={36} top="#b91c1c" left="#7f1d1d" right="#991b1b" />
      <Box gx={gx + 2.18} gy={gy} w={0.22} d={1.3} h={36} top="#b91c1c" left="#7f1d1d" right="#991b1b" />
      <Box gx={gx} gy={gy} w={2.4} d={1.3} h={22} top="#dc2626" left="#991b1b" right="#b91c1c" />
      <Box gx={gx + 0.22} gy={gy + 0.12} w={0.9} d={0.95} h={27} top="#ef4444" left="#dc2626" right="#e53e3e" />
      <Box gx={gx + 1.28} gy={gy + 0.12} w={0.9} d={0.95} h={27} top="#ef4444" left="#dc2626" right="#e53e3e" />
    </g>
  )
}

function CoffeeTable({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={1.2} d={0.9} h={14} top="#8b6838" left="#6b4e28" right="#7a5c30" />
      <Box gx={gx + 0.3} gy={gy + 0.2} w={0.25} d={0.25} h={18} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx + 0.65} gy={gy + 0.35} w={0.4} d={0.28} h={16} top="#ef4444" left="#dc2626" right="#ef4444" />
    </g>
  )
}

function Plant({ gx, gy, big = false }: { gx: number; gy: number; big?: boolean }) {
  const x = sx(gx, gy) + TW / 2 - 4, y = sy(gx, gy) + TH / 2, s = big ? 1.3 : 1
  return (
    <g>
      <polygon points={`${x - 8 * s},${y - 5} ${x + 8 * s},${y - 5} ${x + 6 * s},${y + 1} ${x - 6 * s},${y + 1}`} fill="#b45309" />
      <polygon points={`${x - 10 * s},${y - 10} ${x + 10 * s},${y - 10} ${x + 8 * s},${y - 5} ${x - 8 * s},${y - 5}`} fill="#d97706" />
      <line x1={x} y1={y - 10} x2={x - 4 * s} y2={y - 44 * s} stroke="#15803d" strokeWidth={2 * s} />
      <line x1={x} y1={y - 10} x2={x + 5 * s} y2={y - 40 * s} stroke="#15803d" strokeWidth={1.5 * s} />
      <ellipse cx={x - 9 * s} cy={y - 40 * s} rx={13 * s} ry={6 * s} fill="#16a34a" transform={`rotate(-28,${x - 9 * s},${y - 40 * s})`} />
      <ellipse cx={x + 10 * s} cy={y - 38 * s} rx={13 * s} ry={6 * s} fill="#15803d" transform={`rotate(28,${x + 10 * s},${y - 38 * s})`} />
      <ellipse cx={x} cy={y - 48 * s} rx={11 * s} ry={5.5 * s} fill="#22c55e" />
      <ellipse cx={x - 2} cy={y - 56 * s} rx={9 * s} ry={5 * s} fill="#4ade80" />
    </g>
  )
}

function Bookshelf({ gx, gy }: { gx: number; gy: number }) {
  const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#84cc16']
  const heights = [32, 28, 36, 26, 30, 24, 33]
  return (
    <g>
      <Box gx={gx} gy={gy} w={1.6} d={0.5} h={64} top="#7a5830" left="#5c4020" right="#6b4e28" />
      {colors.map((c, i) => (
        <Box key={`lo${i}`} gx={gx + 0.07 + i * 0.2} gy={gy + 0.06} w={0.16} d={0.4} h={heights[i]} top={c} left={c} right={c} />
      ))}
      {colors.map((c, i) => (
        <Box key={`hi${i}`} gx={gx + 0.07 + i * 0.2} gy={gy + 0.06} w={0.16} d={0.4} h={heights[i] + 28} top={`${c}88`} left={`${c}55`} right={`${c}66`} />
      ))}
      <Box gx={gx + 1.28} gy={gy + 0.05} w={0.16} d={0.22} h={56} top="#fbbf24" left="#d97706" right="#e8a800" />
      <Box gx={gx + 1.30} gy={gy + 0.06} w={0.12} d={0.18} h={64} top="#fde68a" left="#fbbf24" right="#fcd34d" />
    </g>
  )
}

function LightsaberLamp({ gx, gy }: { gx: number; gy: number }) {
  const bx = sx(gx, gy), by = sy(gx, gy)
  return (
    <g>
      <Box gx={gx} gy={gy} w={0.3} d={0.3} h={8} top="#374151" left="#1f2937" right="#374151" />
      <rect x={bx - 3} y={by - 72} width={6} height={64} rx={3} fill="#6b7280" />
      <rect x={bx - 2} y={by - 140} width={4} height={70} rx={2} fill="#4ade80" />
      <rect x={bx - 6} y={by - 142} width={12} height={74} rx={6} fill="#4ade80" opacity="0.15" />
      <rect x={bx - 10} y={by - 144} width={20} height={78} rx={10} fill="#4ade80" opacity="0.07" />
    </g>
  )
}

function TV({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={1.4} d={0.6} h={28} top="#292524" left="#1c1917" right="#292524" />
      <Box gx={gx + 0.1} gy={gy + 0.06} w={1.2} d={0.06} h={52} top="#0f172a" left="#0a0f1a" right="#0f172a" />
      <Box gx={gx + 0.12} gy={gy + 0.07} w={1.16} d={0.04} h={48} top="#001a00" left="#001000" right="#001a00" />
      <Box gx={gx + 0.14} gy={gy + 0.07} w={0.3} d={0.03} h={38} top="#00ff4155" left="#00ff4133" right="#00ff4144" />
      <Box gx={gx + 0.55} gy={gy + 0.07} w={0.2} d={0.03} h={44} top="#00ff4166" left="#00ff4133" right="#00ff4155" />
    </g>
  )
}

function Whiteboard({ gy1, gy2, fillPct, agentColor }: { gy1: number; gy2: number; fillPct?: number; agentColor?: string }) {
  const boardW = gy2 - gy1 - 0.16
  const filled = fillPct ?? 0
  const color = agentColor ?? '#1e3a8a'

  return (
    <g data-testid="whiteboard">
      <WallRect wall="left" g1={gy1} g2={gy2} h1={20} h2={82} fill="#292524" />
      <WallRect wall="left" g1={gy1 + 0.08} g2={gy2 - 0.08} h1={24} h2={79} fill="#f8fafc" />
      {/* Content fill bars — appear as pipeline runs */}
      {filled > 0 ? (
        <>
          {/* Background tint */}
          <WallRect wall="left" g1={gy1 + 0.12} g2={gy2 - 0.12} h1={26} h2={78} fill={color} opacity="0.07" />
          {/* Line 1 */}
          {filled >= 0.15 && <WallRect wall="left" g1={gy1 + 0.2} g2={gy1 + 0.2 + boardW * Math.min(filled, 0.4) * 2} h1={35} h2={37} fill={color} opacity="0.65" />}
          {/* Line 2 */}
          {filled >= 0.25 && <WallRect wall="left" g1={gy1 + 0.2} g2={gy1 + 0.2 + boardW * Math.min((filled - 0.1) / 0.6, 1)} h1={42} h2={44} fill={color} opacity="0.55" />}
          {/* Line 3 */}
          {filled >= 0.4 && <WallRect wall="left" g1={gy1 + 0.2} g2={gy1 + 0.2 + boardW * Math.min((filled - 0.2) / 0.6, 1)} h1={49} h2={51} fill={color} opacity="0.55" />}
          {/* Line 4 — shorter */}
          {filled >= 0.55 && <WallRect wall="left" g1={gy1 + 0.2} g2={gy1 + 0.2 + boardW * Math.min((filled - 0.3) / 0.6, 0.7)} h1={56} h2={58} fill={color} opacity="0.45" />}
          {/* Marker tip glow */}
          {filled < 1 && (
            <WallRect wall="left"
              g1={gy1 + 0.2 + boardW * Math.min(filled, 1) - 0.04}
              g2={gy1 + 0.2 + boardW * Math.min(filled, 1) + 0.04}
              h1={33} h2={60} fill={color} opacity="0.4" />
          )}
        </>
      ) : null}
    </g>
  )
}

function ProjectorScreen() {
  return (
    <g>
      <WallRect wall="left" g1={2.4} g2={7.6} h1={14} h2={94} fill="#08080a" />
      <WallRect wall="left" g1={2.52} g2={7.48} h1={18} h2={90} fill="#060d1f" />
      <WallRect wall="left" g1={2.52} g2={7.48} h1={18} h2={90} fill="#1e40af" opacity="0.07" />
      <WallRect wall="left" g1={2.65} g2={6.8} h1={82} h2={87} fill="#1e3a8a" opacity="0.75" />
      <WallRect wall="left" g1={2.75} g2={3.18} h1={22} h2={62} fill="#2563eb" opacity="0.7" />
      <WallRect wall="left" g1={3.28} g2={3.71} h1={22} h2={50} fill="#60a5fa" opacity="0.55" />
      <WallRect wall="left" g1={3.81} g2={4.24} h1={22} h2={72} fill="#1d4ed8" opacity="0.8" />
      <WallRect wall="left" g1={4.34} g2={4.77} h1={22} h2={44} fill="#3b82f6" opacity="0.55" />
      <WallRect wall="left" g1={4.87} g2={5.30} h1={22} h2={80} fill="#1e40af" opacity="0.85" />
      <WallRect wall="left" g1={5.40} g2={5.83} h1={22} h2={55} fill="#60a5fa" opacity="0.6" />
      <WallRect wall="left" g1={5.93} g2={6.36} h1={22} h2={67} fill="#2563eb" opacity="0.7" />
      <WallRect wall="left" g1={6.46} g2={6.89} h1={22} h2={48} fill="#3b82f6" opacity="0.55" />
      <WallRect wall="left" g1={2.75} g2={6.89} h1={68} h2={71} fill="#f59e0b" opacity="0.65" />
    </g>
  )
}

function Clapperboard({ gy }: { gy: number }) {
  return (
    <g>
      <WallRect wall="left" g1={gy} g2={gy + 0.85} h1={30} h2={62} fill="#1c1917" />
      <WallRect wall="left" g1={gy + 0.06} g2={gy + 0.79} h1={32} h2={60} fill="#f8fafc" opacity="0.9" />
      <WallRect wall="left" g1={gy} g2={gy + 0.85} h1={56} h2={64} fill="#1c1917" />
      <WallRect wall="left" g1={gy + 0.05} g2={gy + 0.22} h1={57} h2={63} fill="#f8fafc" />
      <WallRect wall="left" g1={gy + 0.26} g2={gy + 0.43} h1={57} h2={63} fill="#f8fafc" />
      <WallRect wall="left" g1={gy + 0.47} g2={gy + 0.64} h1={57} h2={63} fill="#f8fafc" />
    </g>
  )
}

function BigMoviePoster({ gx, color1, color2, accent }: { gx: number; color1: string; color2: string; accent: string }) {
  return (
    <g>
      <WallRect wall="right" g1={gx} g2={gx + 2.2} h1={24} h2={90} fill="#120e08" />
      <WallRect wall="right" g1={gx + 0.08} g2={gx + 2.12} h1={28} h2={87} fill={color1} />
      <WallRect wall="right" g1={gx + 0.18} g2={gx + 2.02} h1={38} h2={82} fill={color2} opacity="0.8" />
      <WallRect wall="right" g1={gx + 0.35} g2={gx + 1.65} h1={60} h2={76} fill={accent} opacity="0.6" />
      <WallRect wall="right" g1={gx + 0.18} g2={gx + 2.02} h1={28} h2={36} fill="#000000" opacity="0.7" />
      <WallRect wall="right" g1={gx + 0.3} g2={gx + 1.5} h1={29} h2={34} fill="#ffffff" opacity="0.18" />
    </g>
  )
}

function WindowSkyline({ gx1, gx2 }: { gx1: number; gx2: number }) {
  return (
    <g>
      <WallRect wall="right" g1={gx1} g2={gx2} h1={18} h2={86} fill="#5c3d1e" />
      <WallRect wall="right" g1={gx1 + 0.12} g2={gx2 - 0.12} h1={22} h2={83} fill="#0f172a" />
      <WallRect wall="right" g1={gx1 + 0.12} g2={gx2 - 0.12} h1={22} h2={46} fill="#1e3a5f" opacity="0.8" />
      <WallRect wall="right" g1={gx1 + 0.2} g2={gx1 + 0.75} h1={22} h2={58} fill="#0a0e1a" />
      <WallRect wall="right" g1={gx1 + 0.8} g2={gx1 + 1.3} h1={22} h2={66} fill="#0a0e1a" />
      <WallRect wall="right" g1={gx1 + 1.35} g2={gx1 + 1.8} h1={22} h2={52} fill="#0a0e1a" />
      <WallRect wall="right" g1={gx1 + 1.85} g2={gx1 + 2.4} h1={22} h2={70} fill="#0a0e1a" />
      <WallRect wall="right" g1={gx1 + 2.45} g2={gx1 + 2.88} h1={22} h2={48} fill="#0a0e1a" />
      <WallRect wall="right" g1={gx1 + 0.3} g2={gx1 + 0.42} h1={52} h2={55} fill="#fbbf24" opacity="0.8" />
      <WallRect wall="right" g1={gx1 + 1.0} g2={gx1 + 1.12} h1={60} h2={63} fill="#fbbf24" opacity="0.8" />
      <WallRect wall="right" g1={gx1 + 2.0} g2={gx1 + 2.12} h1={64} h2={67} fill="#fbbf24" opacity="0.9" />
      <WallRect wall="right" g1={gx1 + 2.2} g2={gx1 + 2.32} h1={56} h2={59} fill="#93c5fd" opacity="0.6" />
    </g>
  )
}

function NeonSign({ gx1, gx2 }: { gx1: number; gx2: number }) {
  return (
    <g>
      <WallRect wall="right" g1={gx1} g2={gx2} h1={62} h2={84} fill="#18181b" />
      <WallRect wall="right" g1={gx1 + 0.1} g2={gx2 - 0.1} h1={64} h2={82} fill="#7c3aed" opacity="0.9" />
      <WallRect wall="right" g1={gx1} g2={gx2} h1={60} h2={86} fill="#7c3aed" opacity="0.08" />
      <WallRect wall="right" g1={gx1 + 0.3} g2={gx2 - 0.3} h1={68} h2={78} fill="#a78bfa" opacity="0.5" />
    </g>
  )
}

function GlassDoor({ gx, onClick }: { gx: number; onClick: () => void }) {
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick}>
      {/* Door frame */}
      <WallRect wall="right" g1={gx} g2={gx + 2.2} h1={0} h2={80} fill="#2c1a0e" />
      {/* Left glass panel */}
      <WallRect wall="right" g1={gx + 0.08} g2={gx + 1.02} h1={4} h2={76} fill="#bae6fd" opacity="0.22" />
      {/* Right glass panel */}
      <WallRect wall="right" g1={gx + 1.18} g2={gx + 2.12} h1={4} h2={76} fill="#bae6fd" opacity="0.22" />
      {/* Center divider */}
      <WallRect wall="right" g1={gx + 1.02} g2={gx + 1.18} h1={0} h2={80} fill="#2c1a0e" />
      {/* Gold top trim */}
      <WallRect wall="right" g1={gx} g2={gx + 2.2} h1={78} h2={82} fill="#d97706" />
      {/* Gold handles */}
      <WallRect wall="right" g1={gx + 0.86} g2={gx + 1.0} h1={34} h2={46} fill="#d97706" />
      <WallRect wall="right" g1={gx + 1.2} g2={gx + 1.34} h1={34} h2={46} fill="#d97706" />
      {/* Shimmer */}
      <WallRect wall="right" g1={gx + 0.1} g2={gx + 0.28} h1={8} h2={72} fill="#ffffff" opacity="0.05" />
      <WallRect wall="right" g1={gx + 1.22} g2={gx + 1.4} h1={8} h2={72} fill="#ffffff" opacity="0.05" />
      {/* Hover glow (always-on subtle) */}
      <WallRect wall="right" g1={gx - 0.05} g2={gx + 2.25} h1={-2} h2={84} fill="#fbbf24" opacity="0.04" />
    </g>
  )
}

function Trophy({ gx, gy }: { gx: number; gy: number }) {
  const bx = sx(gx, gy) + 8, by = sy(gx, gy)
  return (
    <g>
      <Box gx={gx} gy={gy} w={0.28} d={0.28} h={8} top="#b45309" left="#92400e" right="#a16207" />
      <rect x={bx - 3} y={by - 36} width={6} height={28} rx={2} fill="#b45309" />
      <ellipse cx={bx} cy={by - 42} rx={12} ry={8} fill="#d97706" />
      <ellipse cx={bx} cy={by - 48} rx={10} ry={7} fill="#fbbf24" />
      <ellipse cx={bx - 10} cy={by - 44} rx={4} ry={3} fill="#d97706" />
      <ellipse cx={bx + 10} cy={by - 44} rx={4} ry={3} fill="#d97706" />
    </g>
  )
}

function Globe({ gx, gy }: { gx: number; gy: number }) {
  const bx = sx(gx, gy) + 8, by = sy(gx, gy)
  return (
    <g>
      <Box gx={gx} gy={gy} w={0.22} d={0.22} h={10} top="#4b5563" left="#374151" right="#4b5563" />
      <circle cx={bx} cy={by - 36} r={22} fill="#0c4a6e" stroke="#0ea5e9" strokeWidth="1.2" />
      <ellipse cx={bx} cy={by - 36} rx={22} ry={7} fill="none" stroke="#0ea5e9" strokeWidth="0.8" />
      <line x1={bx - 22} y1={by - 36} x2={bx + 22} y2={by - 36} stroke="#0ea5e9" strokeWidth="0.8" />
      <ellipse cx={bx} cy={by - 36} rx={13} ry={22} fill="none" stroke="#38bdf8" strokeWidth="0.5" />
      <ellipse cx={bx - 6} cy={by - 42} rx={6} ry={3.5} fill="#16a34a" opacity="0.75" transform={`rotate(-15,${bx - 6},${by - 42})`} />
      <ellipse cx={bx + 8} cy={by - 32} rx={5} ry={6} fill="#15803d" opacity="0.7" />
    </g>
  )
}

// ─── Studio furniture ─────────────────────────────────────────────────
function CollabTable({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={3.2} d={1.8} h={22} top="#e2e8f0" left="#cbd5e1" right="#dce4ef" />
      <Box gx={gx + 0.08} gy={gy + 0.08} w={3.04} d={1.64} h={23} top="#f8fafc" left="#e2e8f0" right="#eef2f7" />
      <Box gx={gx + 0.2} gy={gy + 0.2} w={0.85} d={0.55} h={26} top="#1c1917" left="#111827" right="#221c1a" />
      <Box gx={gx + 0.22} gy={gy + 0.22} w={0.81} d={0.05} h={34} top="#0f172a" left="#020617" right="#0f172a" />
      <Box gx={gx + 0.24} gy={gy + 0.23} w={0.77} d={0.04} h={30} top="#1e3a8a" left="#172554" right="#1d4ed8" />
      <Box gx={gx + 1.3} gy={gy + 0.25} w={0.6} d={0.42} h={27} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx + 1.3} gy={gy + 0.25} w={0.6} d={0.1} h={35} top="#1c1917" left="#111827" right="#1c1917" />
      <Box gx={gx + 1.34} gy={gy + 0.26} w={0.15} d={0.08} h={35} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx + 1.52} gy={gy + 0.26} w={0.15} d={0.08} h={35} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx + 2.5} gy={gy + 0.35} w={0.28} d={0.28} h={28} top="#f8fafc" left="#e2e8f0" right="#f8fafc" />
      <Box gx={gx + 2.52} gy={gy + 0.37} w={0.24} d={0.24} h={26} top="#7c3aed" left="#6d28d9" right="#7c3aed" />
      <Box gx={gx + 2.5} gy={gy + 0.7} w={0.28} d={0.28} h={28} top="#f8fafc" left="#e2e8f0" right="#f8fafc" />
      <Box gx={gx + 2.52} gy={gy + 0.72} w={0.24} d={0.24} h={26} top="#f97316" left="#ea580c" right="#f97316" />
      <Box gx={gx + 1.9} gy={gy + 0.12} w={0.42} d={0.38} h={24} top="#fef9c3" left="#fde68a" right="#fef08a" />
      <Box gx={gx + 2.36} gy={gy + 0.16} w={0.38} d={0.32} h={24} top="#fce7f3" left="#fbcfe8" right="#fce7f3" />
      <Box gx={gx + 0.9} gy={gy + 0.2} w={0.38} d={0.28} h={28} top="#1c1917" left="#111827" right="#292524" />
      <Box gx={gx + 0.92} gy={gy + 0.22} w={0.06} d={0.04} h={34} top="#0f172a" left="#020617" right="#0f172a" />
      <Box gx={gx + 1.8} gy={gy + 0.65} w={0.58} d={0.42} h={24} top="#f8fafc" left="#e2e8f0" right="#f8fafc" />
      <Box gx={gx + 1.83} gy={gy + 0.67} w={0.52} d={0.38} h={23.5} top="#e2e8f0" left="#cbd5e1" right="#e2e8f0" />
    </g>
  )
}

function CameraOnTripod({ gx, gy }: { gx: number; gy: number }) {
  const bx = sx(gx, gy) + TW / 4, by = sy(gx, gy)
  return (
    <g>
      <Box gx={gx + 0.05} gy={gy + 0.05} w={0.5} d={0.5} h={6} top="#374151" left="#1f2937" right="#374151" />
      <line x1={bx} y1={by - 6} x2={bx} y2={by - 58} stroke="#4b5563" strokeWidth="3" />
      <Box gx={gx - 0.05} gy={gy + 0.08} w={0.75} d={0.42} h={46} top="#1c1917" left="#111827" right="#292524" />
      <Box gx={gx + 0.05} gy={gy + 0.1} w={0.55} d={0.04} h={54} top="#0f172a" left="#020617" right="#0f172a" />
      <circle cx={bx + 16} cy={by - 50} r={9} fill="#0f172a" stroke="#4b5563" strokeWidth="1.2" />
      <circle cx={bx + 16} cy={by - 50} r={5.5} fill="#1e3a5f" />
      <circle cx={bx + 17} cy={by - 51} r={2.5} fill="#60a5fa" opacity="0.5" />
      <circle cx={bx + 26} cy={by - 54} r={2.2} fill="#ef4444" opacity="0.9" />
      <line x1={bx} y1={by - 6} x2={bx - 14} y2={by + 5} stroke="#374151" strokeWidth="1.5" />
      <line x1={bx} y1={by - 6} x2={bx + 18} y2={by + 5} stroke="#374151" strokeWidth="1.5" />
    </g>
  )
}

function StudioLight({ gx, gy }: { gx: number; gy: number }) {
  const bx = sx(gx, gy) + TW / 4, by = sy(gx, gy)
  return (
    <g>
      <Box gx={gx + 0.1} gy={gy + 0.1} w={0.28} d={0.28} h={6} top="#374151" left="#1f2937" right="#374151" />
      <line x1={bx} y1={by - 6} x2={bx} y2={by - 52} stroke="#4b5563" strokeWidth="2" />
      <Box gx={gx - 0.1} gy={gy + 0.04} w={0.8} d={0.06} h={60} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx - 0.08} gy={gy + 0.05} w={0.76} d={0.05} h={58} top="#fffbeb" left="#fef3c7" right="#fffbeb" />
      <ellipse cx={bx + 4} cy={by - 62} rx={24} ry={10} fill="#fef9c3" opacity="0.15" />
    </g>
  )
}

function EditSuite({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <Box gx={gx - 0.15} gy={gy} w={2.0} d={0.95} h={20} top="#292524" left="#1c1917" right="#27211f" />
      <Box gx={gx} gy={gy + 0.06} w={0.05} d={0.25} h={22} top="#374151" left="#1f2937" right="#374151" />
      <Box gx={gx} gy={gy + 0.07} w={1.02} d={0.06} h={52} top="#0f172a" left="#020617" right="#0f172a" />
      <Box gx={gx + 0.04} gy={gy + 0.08} w={0.94} d={0.05} h={46} top="#111827" left="#030712" right="#111827" />
      <Box gx={gx + 0.06} gy={gy + 0.09} w={0.72} d={0.04} h={40} top="#7c3aed" left="#5b21b6" right="#6d28d9" />
      <Box gx={gx + 1.1} gy={gy + 0.07} w={0.68} d={0.06} h={50} top="#0f172a" left="#020617" right="#0f172a" />
      <Box gx={gx + 1.14} gy={gy + 0.08} w={0.60} d={0.05} h={44} top="#111827" left="#030712" right="#111827" />
      <Box gx={gx + 1.16} gy={gy + 0.09} w={0.56} d={0.04} h={38} top="#1e3a8a" left="#172554" right="#1d4ed8" />
      <Box gx={gx + 1.65} gy={gy + 0.12} w={0.18} d={0.18} h={46} top="#18181b" left="#09090b" right="#27272a" />
    </g>
  )
}

function ArcadeMachine({ gx, gy, color }: { gx: number; gy: number; color: string }) {
  return (
    <g>
      <Box gx={gx} gy={gy} w={0.85} d={0.72} h={56} top="#1c1917" left="#111827" right="#221c1a" />
      <Box gx={gx + 0.06} gy={gy + 0.06} w={0.73} d={0.05} h={72} top="#0a0a0a" left="#050505" right="#0a0a0a" />
      <Box gx={gx + 0.1} gy={gy + 0.08} w={0.65} d={0.04} h={66} top={color} left={`${color}99`} right={`${color}bb`} />
      <Box gx={gx} gy={gy} w={0.85} d={0.72} h={64} top={`${color}bb`} left={`${color}77`} right={`${color}99`} />
      <Box gx={gx + 0.04} gy={gy + 0.04} w={0.77} d={0.64} h={60} top="#000000" left="#000000" right="#000000" />
      <Box gx={gx + 0.1} gy={gy + 0.5} w={0.65} d={0.2} h={58} top="#2a2a2a" left="#1a1a1a" right="#2a2a2a" />
      <Box gx={gx + 0.18} gy={gy + 0.55} w={0.14} d={0.14} h={61} top="#374151" left="#1f2937" right="#374151" />
      <Box gx={gx + 0.44} gy={gy + 0.55} w={0.1} d={0.1} h={60} top="#ef4444" left="#dc2626" right="#ef4444" />
      <Box gx={gx + 0.57} gy={gy + 0.55} w={0.1} d={0.1} h={60} top="#22c55e" left="#16a34a" right="#22c55e" />
    </g>
  )
}

// ─── Work room background ─────────────────────────────────────────────
export function RoomBackground({ onDoorClick, whiteBoardFill, whiteBoardColor }: { onDoorClick: () => void; whiteBoardFill?: number; whiteBoardColor?: string }) {
  const P = (pts: [number, number][]) => pts.map(v => v.join(',')).join(' ')
  const T = (x: number, y: number): [number, number] => [x, y]
  const leftWall = [T(sx(0, 0), sy(0, 0) - WH), T(sx(0, ROWS), sy(0, ROWS) - WH), T(sx(0, ROWS), sy(0, ROWS)), T(sx(0, 0), sy(0, 0))]
  const rightWall = [T(sx(0, 0), sy(0, 0) - WH), T(sx(COLS, 0), sy(COLS, 0) - WH), T(sx(COLS, 0), sy(COLS, 0)), T(sx(0, 0), sy(0, 0))]

  const tiles: { gx: number; gy: number }[] = []
  for (let gx = 0; gx < COLS; gx++) for (let gy = 0; gy < ROWS; gy++) tiles.push({ gx, gy })
  tiles.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy))

  const isLounge = (gx: number, gy: number) => gx >= 0 && gx <= 3 && gy >= 2 && gy <= 6
  const shining = ['#c2410c', '#b45309', '#92400e', '#7c2d12', '#a16207', '#d97706']
  const getLounge = (gx: number, gy: number) => shining[(gx * 3 + gy * 2) % shining.length]

  return (
    <>
      <polygon points={P(rightWall)} fill="#c8a060" />
      <polygon points={P(leftWall)} fill="#b89050" />
      {Array.from({ length: COLS }, (_, i) => (
        <line key={`rw${i}`} x1={sx(i, 0)} y1={sy(i, 0) - WH} x2={sx(i + 1, 0)} y2={sy(i + 1, 0) - WH} stroke="#a07840" strokeWidth="0.6" opacity="0.5" />
      ))}
      {Array.from({ length: ROWS }, (_, i) => (
        <line key={`lw${i}`} x1={sx(0, i)} y1={sy(0, i) - WH} x2={sx(0, i + 1)} y2={sy(0, i + 1) - WH} stroke="#906830" strokeWidth="0.6" opacity="0.5" />
      ))}
      <line x1={sx(0, 0)} y1={sy(0, 0) - WH} x2={sx(0, ROWS)} y2={sy(0, ROWS) - WH} stroke="#7a5828" strokeWidth="2" />
      <line x1={sx(0, 0)} y1={sy(0, 0) - WH} x2={sx(COLS, 0)} y2={sy(COLS, 0) - WH} stroke="#7a5828" strokeWidth="2" />

      {/* Wall decorations */}
      <ProjectorScreen />
      <Clapperboard gy={0.9} />
      <Whiteboard gy1={7.8} gy2={9.8} fillPct={whiteBoardFill} agentColor={whiteBoardColor} />
      <BigMoviePoster gx={0.5} color1="#78350f" color2="#d97706" accent="#fbbf24" />
      <BigMoviePoster gx={3.2} color1="#450a0a" color2="#dc2626" accent="#fbbf24" />
      <WindowSkyline gx1={6} gx2={10} />
      <NeonSign gx1={11} gx2={13.5} />
      {/* Glass door → meeting room (right wall, gx=3.5) */}
      <GlassDoor gx={3.5} onClick={onDoorClick} />

      {/* Floor */}
      {tiles.map(({ gx, gy }) => {
        const l = isLounge(gx, gy), e = (gx + gy) % 2 === 0
        const fill = l ? getLounge(gx, gy) : (e ? '#ede0cc' : '#ddd0b0')
        return <Tile key={`t${gx}-${gy}`} gx={gx} gy={gy} fill={fill} />
      })}

      {/* Back corner decorations (low gx+gy → render first) */}
      <Plant gx={0} gy={0} big />
      <Bookshelf gx={0.5} gy={0} />
      <Plant gx={13} gy={0} />

      {/* Lounge zone */}
      <Sofa gx={0.5} gy={2.5} />
      <TV gx={0.2} gy={3} />

      {/* TV Studio corner */}
      <StudioLight gx={3.8} gy={0.7} />
      <CameraOnTripod gx={2.7} gy={1.4} />

      {/* Agent desk — Aya */}
      <AyaDesk gx={6} gy={1} />
      <Chair gx={7.2} gy={2.2} />

      {/* Lounge extras */}
      <CoffeeTable gx={1.3} gy={4.0} />
      <Chair gx={0.8} gy={4.8} />

      {/* Collab table — back chairs before table */}
      <Chair gx={5.1} gy={2.8} />
      <Chair gx={6.4} gy={2.8} />

      {/* Central collab table */}
      <CollabTable gx={4.5} gy={3.5} />
      <Globe gx={7.8} gy={3.2} />

      {/* Agent desks — Otto */}
      <Desk gx={9} gy={1} />
      <Chair gx={10.2} gy={2.2} />

      {/* Agent desks — Heitor */}
      <Desk gx={11.5} gy={1} />
      <Chair gx={12.7} gy={2.2} />

      {/* Edit suite (near Sônia) */}
      <EditSuite gx={8.2} gy={4.3} />
      <Trophy gx={9.3} gy={3.0} />

      {/* Collab table — front chairs after table */}
      <Chair gx={5.1} gy={5.4} />
      <Chair gx={6.4} gy={5.4} />

      {/* Arcade corner (near Salles) */}
      <ArcadeMachine gx={2.4} gy={5.5} color="#ef4444" />

      {/* Agent desks — Salles */}
      <Desk gx={1} gy={7} />
      <Chair gx={2.2} gy={8.2} />

      {/* Second arcade */}
      <ArcadeMachine gx={3.5} gy={6.8} color="#3b82f6" />

      {/* Agent desks — Sônia */}
      <Desk gx={10} gy={6} />
      <Chair gx={11.2} gy={7.2} />

      {/* Easter eggs */}
      <LightsaberLamp gx={13} gy={8} />
      <Plant gx={0} gy={9} />
      <Plant gx={13} gy={9} />
    </>
  )
}
