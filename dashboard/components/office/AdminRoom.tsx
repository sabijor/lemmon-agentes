/**
 * AdminRoom — Escritório Administrativo da Hator Clinic (T171).
 *
 * Sala isométrica paralela ao WorkRoom. Identidade visual de clínica/escritório
 * corporativo: paleta off-white + azul-acinzentado + verde água (Hator) + madeira
 * clara. Layout: open space com 3 mesas (Ana Maria, Prichina, Kelly) + sala
 * fechada de vidro pro COO (Caíto).
 */
import { TW, TH, ADMIN_COLS, ADMIN_ROWS, asx, asy, HATOR_PALETTE as P } from './constants'

// ─── Primitivas isométricas (mesma lógica do WorkRoom/MeetingRoom) ─────
function ABox({ gx, gy, w = 1, d = 1, h = 32, top, left, right }: {
  gx: number; gy: number; w?: number; d?: number; h?: number
  top: string; left: string; right: string
}) {
  const p = (arr: [number, number][]) => arr.map(v => v.join(',')).join(' ')
  const T = (x: number, y: number): [number, number] => [x, y]
  const bk = T(asx(gx, gy), asy(gx, gy) - h)
  const rt = T(asx(gx + w, gy), asy(gx + w, gy) - h)
  const lf = T(asx(gx, gy + d), asy(gx, gy + d) - h)
  const fr = T(asx(gx + w, gy + d), asy(gx + w, gy + d) - h)
  const rtB = T(asx(gx + w, gy), asy(gx + w, gy))
  const lfB = T(asx(gx, gy + d), asy(gx, gy + d))
  const frB = T(asx(gx + w, gy + d), asy(gx + w, gy + d))
  return (
    <g>
      <polygon points={p([rt, fr, frB, rtB])} fill={right} />
      <polygon points={p([lf, fr, frB, lfB])} fill={left} />
      <polygon points={p([bk, rt, fr, lf])} fill={top} />
    </g>
  )
}

function ATile({ gx, gy, fill, accent = false }: { gx: number; gy: number; fill: string; accent?: boolean }) {
  const x = asx(gx, gy), y = asy(gx, gy)
  return (
    <polygon
      points={`${x},${y} ${x + TW / 2},${y + TH / 2} ${x},${y + TH} ${x - TW / 2},${y + TH / 2}`}
      fill={fill}
      stroke={accent ? P.accent : P.floorGrid}
      strokeWidth={accent ? 0.6 : 0.3}
      opacity={accent ? 0.95 : 1}
    />
  )
}

function AWallRect({ wall, g1, g2, h1, h2, fill, opacity }: {
  wall: 'left' | 'right'; g1: number; g2: number
  h1: number; h2: number; fill?: string; opacity?: string | number
}) {
  const pts = wall === 'left'
    ? [[asx(0, g1), asy(0, g1) - h2], [asx(0, g2), asy(0, g2) - h2],
      [asx(0, g2), asy(0, g2) - h1], [asx(0, g1), asy(0, g1) - h1]]
    : [[asx(g1, 0), asy(g1, 0) - h2], [asx(g2, 0), asy(g2, 0) - h2],
      [asx(g2, 0), asy(g2, 0) - h1], [asx(g1, 0), asy(g1, 0) - h1]]
  return <polygon points={pts.map(p => p.join(',')).join(' ')} fill={fill ?? 'none'} opacity={opacity} />
}

// ─── Móveis Hator ─────────────────────────────────────────────────────

/** Mesa de escritório moderna (madeira clara). Pra Ana Maria, Prichina, Kelly. */
function HatorDesk({ gx, gy, w = 2.2, d = 1, h = 22 }: { gx: number; gy: number; w?: number; d?: number; h?: number }) {
  return (
    <g>
      {/* tampo */}
      <ABox gx={gx} gy={gy} w={w} d={d} h={h} top={P.woodLight} left={P.woodDark} right="#bfa074" />
      {/* veio madeira */}
      <ABox gx={gx + 0.1} gy={gy + 0.1} w={w - 0.2} d={d - 0.2} h={h + 0.5} top="#e0c8a0" left={P.woodDark} right="#c2a378" />
      {/* base/pés (centro) */}
      <ABox gx={gx + w / 2 - 0.1} gy={gy + d / 2 - 0.05} w={0.2} d={0.1} h={h - 4} top="#6b5b3b" left="#4a3f29" right="#5c4f33" />
    </g>
  )
}

/** Cadeira de escritório giratória discreta. */
function HatorChair({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <ABox gx={gx} gy={gy} w={0.7} d={0.7} h={14} top="#374151" left="#1f2937" right="#2d3748" />
      <ABox gx={gx + 0.05} gy={gy + 0.55} w={0.6} d={0.1} h={42} top="#1f2937" left="#111827" right="#1f2937" />
    </g>
  )
}

/** Vaso com planta de canto — toque corporativo. */
function HatorPlant({ gx, gy }: { gx: number; gy: number }) {
  const x = asx(gx, gy), y = asy(gx, gy) + TH / 2
  return (
    <g>
      {/* vaso */}
      <polygon points={`${x - 10},${y - 4} ${x + 10},${y - 4} ${x + 8},${y + 4} ${x - 8},${y + 4}`} fill={P.woodDark} />
      <polygon points={`${x - 11},${y - 7} ${x + 11},${y - 7} ${x + 10},${y - 4} ${x - 10},${y - 4}`} fill={P.woodLight} />
      {/* folhas verde-água */}
      <line x1={x} y1={y - 7} x2={x - 5} y2={y - 35} stroke={P.accent} strokeWidth={2} />
      <line x1={x} y1={y - 7} x2={x + 6} y2={y - 32} stroke={P.accent} strokeWidth={1.8} />
      <ellipse cx={x - 7} cy={y - 32} rx={11} ry={5} fill="#10b981" transform={`rotate(-25,${x - 7},${y - 32})`} />
      <ellipse cx={x + 8} cy={y - 28} rx={10} ry={5} fill="#34d399" transform={`rotate(28,${x + 8},${y - 28})`} />
      <ellipse cx={x} cy={y - 38} rx={12} ry={6} fill={P.accent} />
    </g>
  )
}

/** Painel financeiro/gráfico na parede — KPI visual. */
function FinancialDashboard({ gx, gy }: { gx: number; gy: number }) {
  const x = asx(gx, gy), y = asy(gx, gy)
  return (
    <g>
      {/* moldura */}
      <rect x={x - 50} y={y - 90} width={100} height={56} fill={P.textInk} rx={2} />
      {/* tela */}
      <rect x={x - 47} y={y - 87} width={94} height={50} fill={P.paperWhite} rx={1} />
      {/* títulos */}
      <text x={x - 44} y={y - 78} fontSize={5} fill={P.textInk} fontFamily="JetBrains Mono, monospace" fontWeight="bold">FATURAMENTO</text>
      <text x={x - 44} y={y - 73} fontSize={4} fill={P.accent} fontFamily="JetBrains Mono, monospace">+ 12.4%</text>
      {/* gráfico de barras */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <rect key={i}
          x={x - 38 + i * 13} y={y - 56 - (8 + i * 2.5)}
          width={8} height={8 + i * 2.5}
          fill={i === 5 ? P.accent : P.accentDim} rx={0.5}
        />
      ))}
      {/* linha base */}
      <line x1={x - 40} y1={y - 48} x2={x + 42} y2={y - 48} stroke={P.floorGrid} strokeWidth={0.3} />
    </g>
  )
}

/** Quadro de certificados — autoridade clínica. */
function CertificateFrame({ gx, gy, label = "CRM" }: { gx: number; gy: number; label?: string }) {
  const x = asx(gx, gy), y = asy(gx, gy)
  return (
    <g>
      <rect x={x - 18} y={y - 70} width={36} height={26} fill={P.woodDark} rx={1} />
      <rect x={x - 16} y={y - 68} width={32} height={22} fill={P.paperWhite} rx={0.5} />
      <line x1={x - 12} y1={y - 62} x2={x + 12} y2={y - 62} stroke={P.floorGrid} strokeWidth={0.3} />
      <line x1={x - 12} y1={y - 58} x2={x + 8} y2={y - 58} stroke={P.floorGrid} strokeWidth={0.3} />
      <line x1={x - 12} y1={y - 54} x2={x + 10} y2={y - 54} stroke={P.floorGrid} strokeWidth={0.3} />
      <circle cx={x + 10} cy={y - 51} r={2.5} fill={P.accent} />
      <text x={x} y={y - 73} fontSize={3.5} fill={P.paperWhite} fontFamily="JetBrains Mono, monospace" fontWeight="bold" textAnchor="middle">{label}</text>
    </g>
  )
}

/** Estante de livros tributários da Kelly. */
function LawBookshelf({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      {/* armário */}
      <ABox gx={gx} gy={gy} w={1.6} d={0.5} h={70} top={P.woodDark} left="#7d6244" right="#8e7050" />
      {/* prateleiras + livros */}
      {[60, 45, 30, 15].map((shelfH, idx) => (
        <g key={idx}>
          <ABox gx={gx + 0.1} gy={gy + 0.1} w={1.4} d={0.3} h={shelfH + 8} top={P.paperWhite} left="#e5e0d3" right="#ede8dc" />
          {/* livros coloridos */}
          {[0, 1, 2, 3, 4].map(b => {
            const colors = ['#7f1d1d', '#1e40af', '#166534', '#7c2d12', '#581c87']
            return (
              <ABox key={b}
                gx={gx + 0.15 + b * 0.27}
                gy={gy + 0.12}
                w={0.22} d={0.27} h={shelfH + 14}
                top={colors[(idx + b) % 5]}
                left={colors[(idx + b) % 5]}
                right={colors[(idx + b) % 5]}
              />
            )
          })}
        </g>
      ))}
    </g>
  )
}

/** Parede divisória de vidro da sala do COO. */
function GlassWall({ from, to, height = 90 }: { from: { gx: number; gy: number }; to: { gx: number; gy: number }; height?: number }) {
  const x1 = asx(from.gx, from.gy), y1 = asy(from.gx, from.gy)
  const x2 = asx(to.gx, to.gy), y2 = asy(to.gx, to.gy)
  return (
    <g>
      {/* moldura inferior */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={P.glassEdge} strokeWidth={2} />
      {/* vidro semi-transparente */}
      <polygon
        points={`${x1},${y1} ${x2},${y2} ${x2},${y2 - height} ${x1},${y1 - height}`}
        fill={P.glass}
        opacity={0.35}
        stroke={P.glassEdge}
        strokeWidth={0.8}
      />
      {/* moldura superior */}
      <line x1={x1} y1={y1 - height} x2={x2} y2={y2 - height} stroke={P.glassEdge} strokeWidth={2} />
    </g>
  )
}

/** Sofá pra recepção interna. */
function ReceptionSofa({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      <ABox gx={gx} gy={gy} w={2.2} d={0.9} h={14} top={P.accent} left="#0d6261" right="#0e6a68" />
      <ABox gx={gx} gy={gy} w={2.2} d={0.3} h={32} top={P.accent} left="#0d6261" right="#0e6a68" />
      <ABox gx={gx + 0.1} gy={gy + 0.1} w={2.0} d={0.7} h={15.5} top="#14b8a6" left="#0f8f8a" right="#129692" />
    </g>
  )
}

// ─── Background da sala (piso + paredes) ──────────────────────────────
export function AdminRoomBackground() {
  const tiles: React.ReactNode[] = []
  for (let gy = 0; gy < ADMIN_ROWS; gy++) {
    for (let gx = 0; gx < ADMIN_COLS; gx++) {
      // padrão de piso quadriculado clínico
      const checker = (gx + gy) % 2 === 0 ? P.floorLight : P.floorMid
      // faixa de destaque verde-água em diagonal sutil (linha de acolhimento)
      const accent = (gx === 4 && gy === 4) || (gx === 5 && gy === 5)
      tiles.push(<ATile key={`t-${gx}-${gy}`} gx={gx} gy={gy} fill={accent ? P.accentDim : checker} accent={accent} />)
    }
  }
  return (
    <g>
      {/* piso */}
      {tiles}
      {/* parede esquerda (atrás) */}
      <AWallRect wall="left" g1={0} g2={ADMIN_ROWS} h1={0} h2={140} fill={P.wallLeft} />
      {/* parede direita (atrás) */}
      <AWallRect wall="right" g1={0} g2={ADMIN_COLS} h1={0} h2={140} fill={P.wallRight} />
      {/* topo (teto sutil) — só linha */}
    </g>
  )
}

// ─── Layout principal da sala — onde os móveis vão ────────────────────
export function AdminRoomFurniture() {
  return (
    <g>
      {/* Mesa Ana Maria (CFO) — canto esquerdo do open space */}
      <HatorDesk gx={1} gy={1.5} />
      <HatorChair gx={1.5} gy={2.7} />

      {/* Mesa Prichina (Admin/RH) — ao lado da Ana */}
      <HatorDesk gx={3.8} gy={1.5} />
      <HatorChair gx={4.3} gy={2.7} />

      {/* Mesa Kelly (Contábil) — fila de baixo */}
      <HatorDesk gx={1} gy={4.5} />
      <HatorChair gx={1.5} gy={5.7} />

      {/* Estante de livros tributários atrás da Kelly */}
      <LawBookshelf gx={0.2} gy={4.5} />

      {/* Painel financeiro grande na parede norte */}
      <FinancialDashboard gx={3} gy={0} />

      {/* Certificados na parede do canto */}
      <CertificateFrame gx={6} gy={0} label="CNPJ" />
      <CertificateFrame gx={7.5} gy={0} label="ANVISA" />

      {/* Plantas decorativas */}
      <HatorPlant gx={0.2} gy={0.2} />
      <HatorPlant gx={0.2} gy={8} />

      {/* ─── Sala fechada do COO (Caíto) — à direita ─────────────── */}
      {/* Parede de vidro entre as áreas */}
      <GlassWall from={{ gx: 6, gy: 2 }} to={{ gx: 6, gy: 7 }} height={90} />

      {/* Mesa do COO (maior, mais imponente) */}
      <HatorDesk gx={7} gy={3.5} w={2.5} d={1.2} h={24} />
      <HatorChair gx={7.5} gy={4.9} />

      {/* Sofá pra reunião informal no escritório do Caíto */}
      <ReceptionSofa gx={7} gy={6.5} />

      {/* Planta dentro da sala do COO */}
      <HatorPlant gx={8.5} gy={2.5} />
    </g>
  )
}
