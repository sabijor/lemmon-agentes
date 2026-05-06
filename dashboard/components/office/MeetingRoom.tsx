import { TW, TH, WH, MEET_COLS, MEET_ROWS, msx, msy, DEFAULT_THEME, type MeetingTheme } from './constants'

// ─── Meeting room primitives ──────────────────────────────────────────
function MBox({ gx, gy, w = 1, d = 1, h = 32, top, left, right }: {
  gx: number; gy: number; w?: number; d?: number; h?: number
  top: string; left: string; right: string
}) {
  const p = (arr: [number, number][]) => arr.map(v => v.join(',')).join(' ')
  const T = (x: number, y: number): [number, number] => [x, y]
  const bk = T(msx(gx, gy), msy(gx, gy) - h)
  const rt = T(msx(gx + w, gy), msy(gx + w, gy) - h)
  const lf = T(msx(gx, gy + d), msy(gx, gy + d) - h)
  const fr = T(msx(gx + w, gy + d), msy(gx + w, gy + d) - h)
  const rtB = T(msx(gx + w, gy), msy(gx + w, gy))
  const lfB = T(msx(gx, gy + d), msy(gx, gy + d))
  const frB = T(msx(gx + w, gy + d), msy(gx + w, gy + d))
  return (
    <g>
      <polygon points={p([rt, fr, frB, rtB])} fill={right} />
      <polygon points={p([lf, fr, frB, lfB])} fill={left} />
      <polygon points={p([bk, rt, fr, lf])} fill={top} />
    </g>
  )
}

function MTile({ gx, gy, fill }: { gx: number; gy: number; fill: string }) {
  const x = msx(gx, gy), y = msy(gx, gy)
  return (
    <polygon points={`${x},${y} ${x + TW / 2},${y + TH / 2} ${x},${y + TH} ${x - TW / 2},${y + TH / 2}`}
      fill={fill} stroke="#5c1010" strokeWidth="0.4" />
  )
}

function MWallRect({ wall, g1, g2, h1, h2, fill, opacity }: {
  wall: 'left' | 'right'; g1: number; g2: number
  h1: number; h2: number; fill?: string; opacity?: string | number
}) {
  const pts = wall === 'left'
    ? [[msx(0, g1), msy(0, g1) - h2], [msx(0, g2), msy(0, g2) - h2],
      [msx(0, g2), msy(0, g2) - h1], [msx(0, g1), msy(0, g1) - h1]]
    : [[msx(g1, 0), msy(g1, 0) - h2], [msx(g2, 0), msy(g2, 0) - h2],
      [msx(g2, 0), msy(g2, 0) - h1], [msx(g1, 0), msy(g1, 0) - h1]]
  return <polygon points={pts.map(p => p.join(',')).join(' ')} fill={fill ?? 'none'} opacity={opacity} />
}

// ─── Meeting room furniture ────────────────────────────────────────────
function MExecutiveChair({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <MBox gx={gx} gy={gy} w={0.75} d={0.75} h={14} top="#1c1917" left="#111827" right="#221c1a" />
      <MBox gx={gx + 0.05} gy={gy + 0.62} w={0.65} d={0.1} h={52} top="#1c1917" left="#111827" right="#221c1a" />
      <MBox gx={gx + 0.1} gy={gy + 0.63} w={0.55} d={0.07} h={47} top="#2d1f1a" left="#231714" right="#281a15" />
      <MBox gx={gx} gy={gy + 0.05} w={0.1} d={0.6} h={22} top="#4b5563" left="#374151" right="#4b5563" />
      <MBox gx={gx + 0.65} gy={gy + 0.05} w={0.1} d={0.6} h={22} top="#4b5563" left="#374151" right="#4b5563" />
    </g>
  )
}

function MGrandMeetingTable({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <MBox gx={gx} gy={gy} w={7} d={4} h={22} top="#b45309" left="#92400e" right="#a16207" />
      <MBox gx={gx + 0.12} gy={gy + 0.12} w={6.76} d={3.76} h={24} top="#4a1800" left="#380f00" right="#421400" />
      <MBox gx={gx + 0.25} gy={gy + 0.25} w={6.5} d={3.5} h={25} top="#5c2010" left="#451808" right="#521c0c" />
      {/* Lemmon logo inlay on table */}
      <MBox gx={gx + 3.0} gy={gy + 1.8} w={1.0} d={0.4} h={26} top="#d97706" left="#b45309" right="#c26000" />
      <MBox gx={gx + 3.05} gy={gy + 1.82} w={0.9} d={0.36} h={25.5} top="#6b2800" left="#4e1800" right="#5c2200" />
    </g>
  )
}

function MPlant({ gx, gy, big = false }: { gx: number; gy: number; big?: boolean }) {
  const x = msx(gx, gy) + TW / 2 - 4, y = msy(gx, gy) + TH / 2, s = big ? 1.3 : 1
  return (
    <g>
      <polygon points={`${x - 8 * s},${y - 5} ${x + 8 * s},${y - 5} ${x + 6 * s},${y + 1} ${x - 6 * s},${y + 1}`} fill="#b45309" />
      <polygon points={`${x - 10 * s},${y - 10} ${x + 10 * s},${y - 10} ${x + 8 * s},${y - 5} ${x - 8 * s},${y - 5}`} fill="#d97706" />
      <line x1={x} y1={y - 10} x2={x - 4 * s} y2={y - 44 * s} stroke="#15803d" strokeWidth={2 * s} />
      <line x1={x} y1={y - 10} x2={x + 5 * s} y2={y - 40 * s} stroke="#15803d" strokeWidth={1.5 * s} />
      <ellipse cx={x - 9 * s} cy={y - 40 * s} rx={13 * s} ry={6 * s} fill="#16a34a" transform={`rotate(-28,${x - 9 * s},${y - 40 * s})`} />
      <ellipse cx={x + 10 * s} cy={y - 38 * s} rx={13 * s} ry={6 * s} fill="#15803d" transform={`rotate(28,${x + 10 * s},${y - 38 * s})`} />
      <ellipse cx={x} cy={y - 48 * s} rx={11 * s} ry={5.5 * s} fill="#22c55e" />
    </g>
  )
}

function MTrophy({ gx, gy }: { gx: number; gy: number }) {
  const bx = msx(gx, gy) + 8, by = msy(gx, gy)
  return (
    <g>
      <MBox gx={gx} gy={gy} w={0.28} d={0.28} h={8} top="#b45309" left="#92400e" right="#a16207" />
      <rect x={bx - 3} y={by - 36} width={6} height={28} rx={2} fill="#b45309" />
      <ellipse cx={bx} cy={by - 42} rx={12} ry={8} fill="#d97706" />
      <ellipse cx={bx} cy={by - 48} rx={10} ry={7} fill="#fbbf24" />
      <ellipse cx={bx - 10} cy={by - 44} rx={4} ry={3} fill="#d97706" />
      <ellipse cx={bx + 10} cy={by - 44} rx={4} ry={3} fill="#d97706" />
    </g>
  )
}

function MGlobe({ gx, gy }: { gx: number; gy: number }) {
  const bx = msx(gx, gy) + 8, by = msy(gx, gy)
  return (
    <g>
      <MBox gx={gx} gy={gy} w={0.22} d={0.22} h={10} top="#4b5563" left="#374151" right="#4b5563" />
      <circle cx={bx} cy={by - 36} r={22} fill="#0c4a6e" stroke="#0ea5e9" strokeWidth="1.2" />
      <ellipse cx={bx} cy={by - 36} rx={22} ry={7} fill="none" stroke="#0ea5e9" strokeWidth="0.8" />
      <line x1={bx - 22} y1={by - 36} x2={bx + 22} y2={by - 36} stroke="#0ea5e9" strokeWidth="0.8" />
      <ellipse cx={bx} cy={by - 36} rx={13} ry={22} fill="none" stroke="#38bdf8" strokeWidth="0.5" />
      <ellipse cx={bx - 6} cy={by - 42} rx={6} ry={3.5} fill="#16a34a" opacity="0.75" transform={`rotate(-15,${bx - 6},${by - 42})`} />
      <ellipse cx={bx + 8} cy={by - 32} rx={5} ry={6} fill="#15803d" opacity="0.7" />
    </g>
  )
}

// ─── Meeting room background ─────────────────────────────────────────
export function MeetingRoomBackground({ theme = DEFAULT_THEME }: { theme?: MeetingTheme }) {
  const P = (pts: [number, number][]) => pts.map(v => v.join(',')).join(' ')
  const T = (x: number, y: number): [number, number] => [x, y]
  const leftWall = [T(msx(0, 0), msy(0, 0) - WH), T(msx(0, MEET_ROWS), msy(0, MEET_ROWS) - WH), T(msx(0, MEET_ROWS), msy(0, MEET_ROWS)), T(msx(0, 0), msy(0, 0))]
  const rightWall = [T(msx(0, 0), msy(0, 0) - WH), T(msx(MEET_COLS, 0), msy(MEET_COLS, 0) - WH), T(msx(MEET_COLS, 0), msy(MEET_COLS, 0)), T(msx(0, 0), msy(0, 0))]

  const tiles: { gx: number; gy: number }[] = []
  for (let gx = 0; gx < MEET_COLS; gx++) for (let gy = 0; gy < MEET_ROWS; gy++) tiles.push({ gx, gy })
  tiles.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy))
  const carpetFill = (gx: number, gy: number) => theme.floor[(gx * 2 + gy * 3) % theme.floor.length]

  return (
    <>
      <polygon points={P(rightWall)} fill="#9a6030" />
      <polygon points={P(leftWall)} fill="#8a5228" />
      {Array.from({ length: MEET_COLS }, (_, i) => (
        <line key={`mrw${i}`} x1={msx(i, 0)} y1={msy(i, 0) - WH} x2={msx(i + 1, 0)} y2={msy(i + 1, 0) - WH} stroke="#7a4820" strokeWidth="0.8" opacity="0.6" />
      ))}
      {Array.from({ length: MEET_ROWS }, (_, i) => (
        <line key={`mlw${i}`} x1={msx(0, i)} y1={msy(0, i) - WH} x2={msx(0, i + 1)} y2={msy(0, i + 1) - WH} stroke="#6a3818" strokeWidth="0.8" opacity="0.6" />
      ))}
      <line x1={msx(0, 0)} y1={msy(0, 0) - WH} x2={msx(0, MEET_ROWS)} y2={msy(0, MEET_ROWS) - WH} stroke="#4e2a10" strokeWidth="2.5" />
      <line x1={msx(0, 0)} y1={msy(0, 0) - WH} x2={msx(MEET_COLS, 0)} y2={msy(MEET_COLS, 0) - WH} stroke="#4e2a10" strokeWidth="2.5" />

      {/* Projector screen — left wall */}
      <MWallRect wall="left" g1={0.3} g2={8.3} h1={12} h2={94} fill="#08080a" />
      <MWallRect wall="left" g1={0.44} g2={8.16} h1={16} h2={90} fill="#060d1f" />
      <MWallRect wall="left" g1={0.44} g2={8.16} h1={16} h2={90} fill="#1e40af" opacity="0.08" />
      <MWallRect wall="left" g1={0.6} g2={7.2} h1={80} h2={86} fill="#1e3a8a" opacity="0.7" />
      <MWallRect wall="left" g1={0.7} g2={1.25} h1={20} h2={64} fill="#2563eb" opacity="0.72" />
      <MWallRect wall="left" g1={1.4} g2={1.95} h1={20} h2={52} fill="#60a5fa" opacity="0.55" />
      <MWallRect wall="left" g1={2.1} g2={2.65} h1={20} h2={76} fill="#1d4ed8" opacity="0.82" />
      <MWallRect wall="left" g1={2.8} g2={3.35} h1={20} h2={44} fill="#3b82f6" opacity="0.55" />
      <MWallRect wall="left" g1={3.5} g2={4.05} h1={20} h2={84} fill="#1e40af" opacity="0.88" />
      <MWallRect wall="left" g1={4.2} g2={4.75} h1={20} h2={56} fill="#60a5fa" opacity="0.6" />
      <MWallRect wall="left" g1={4.9} g2={5.45} h1={20} h2={70} fill="#2563eb" opacity="0.72" />
      <MWallRect wall="left" g1={5.6} g2={6.15} h1={20} h2={48} fill="#3b82f6" opacity="0.55" />
      <MWallRect wall="left" g1={6.3} g2={6.85} h1={20} h2={62} fill="#1d4ed8" opacity="0.65" />
      <MWallRect wall="left" g1={7.0} g2={7.55} h1={20} h2={36} fill="#60a5fa" opacity="0.5" />
      <MWallRect wall="left" g1={0.7} g2={7.55} h1={70} h2={73} fill="#f59e0b" opacity="0.7" />

      {/* Panoramic window — right wall */}
      <MWallRect wall="right" g1={3} g2={11} h1={18} h2={88} fill="#4e2a10" />
      <MWallRect wall="right" g1={3.12} g2={10.88} h1={22} h2={85} fill="#0f172a" />
      <MWallRect wall="right" g1={3.12} g2={10.88} h1={22} h2={52} fill="#1e3a5f" opacity="0.8" />
      <MWallRect wall="right" g1={3.2} g2={4.2} h1={22} h2={64} fill="#0a0e1a" />
      <MWallRect wall="right" g1={4.4} g2={5.5} h1={22} h2={75} fill="#0a0e1a" />
      <MWallRect wall="right" g1={5.7} g2={6.7} h1={22} h2={55} fill="#0a0e1a" />
      <MWallRect wall="right" g1={6.9} g2={8.2} h1={22} h2={80} fill="#0a0e1a" />
      <MWallRect wall="right" g1={8.4} g2={9.4} h1={22} h2={50} fill="#0a0e1a" />
      <MWallRect wall="right" g1={9.6} g2={10.6} h1={22} h2={68} fill="#0a0e1a" />
      <MWallRect wall="right" g1={3.4} g2={3.6} h1={54} h2={58} fill="#fbbf24" opacity="0.8" />
      <MWallRect wall="right" g1={4.7} g2={4.9} h1={62} h2={66} fill="#fbbf24" opacity="0.7" />
      <MWallRect wall="right" g1={7.2} g2={7.4} h1={68} h2={72} fill="#fbbf24" opacity="0.9" />
      <MWallRect wall="right" g1={9.0} g2={9.2} h1={44} h2={48} fill="#fbbf24" opacity="0.8" />

      {/* Spotlight glows — tinted by client theme */}
      <ellipse cx={msx(6, 4.5)} cy={msy(6, 4.5)} rx={150} ry={60} fill={theme.glow} opacity="0.06" />
      <ellipse cx={msx(6, 4.5)} cy={msy(6, 4.5)} rx={90} ry={36} fill={theme.glow} opacity="0.05" />
      <ellipse cx={msx(3, 5)} cy={msy(3, 5) + 16} rx={80} ry={30} fill={theme.screenAccent} opacity="0.08" />

      {/* Floor tiles */}
      {tiles.map(({ gx, gy }) => (
        <MTile key={`mt${gx}-${gy}`} gx={gx} gy={gy} fill={carpetFill(gx, gy)} />
      ))}

      {/* Furniture — back to front */}
      <MPlant gx={0} gy={0} big />
      <MPlant gx={11} gy={0} />
      <MGlobe gx={0.5} gy={1.0} />
      <MTrophy gx={10.3} gy={1.0} />

      {/* Back chairs */}
      <MExecutiveChair gx={2.8} gy={2.0} />
      <MExecutiveChair gx={5.4} gy={1.5} />
      <MExecutiveChair gx={8.0} gy={2.0} />

      {/* Grand meeting table */}
      <MGrandMeetingTable gx={2.5} gy={2.5} />

      {/* Side & front chairs */}
      <MExecutiveChair gx={1.8} gy={4.5} />
      <MExecutiveChair gx={9.0} gy={4.5} />
      <MExecutiveChair gx={3.5} gy={7.2} />
      <MExecutiveChair gx={7.8} gy={7.2} />

      <MPlant gx={0} gy={8} />
      <MPlant gx={11} gy={8} />
    </>
  )
}
