'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, animate } from 'framer-motion'
import { AGENTS, type AgentId } from '@/lib/agents'
import { type AgentStatus, type Message } from '@/lib/useChat'
import CharacterSprite from './CharacterSprite'

// ─── Meeting room themes per cliente espelho ─────────────────────────
interface MeetingTheme { floor: string[]; glow: string; screenAccent: string; wallTone: string }
const MEETING_THEMES: Record<string, MeetingTheme> = {
  pedro_abrahao: {
    floor: ['#0d4440', '#0a3a37', '#10524e', '#083530', '#0e4e4a', '#0d5450'],
    glow: '#0f766e',
    screenAccent: '#14b8a6',
    wallTone: '#0f766e',
  },
  // Future clients added here automatically via onboard_cliente.py
}
const DEFAULT_THEME: MeetingTheme = {
  floor: ['#7c1d1d', '#6b1818', '#8b2020', '#5c1414', '#701c1c', '#7c2020'],
  glow: '#fbbf24',
  screenAccent: '#3b82f6',
  wallTone: '#9a6030',
}
function getMeetingTheme(clientId: string): MeetingTheme {
  return MEETING_THEMES[clientId] ?? DEFAULT_THEME
}

// ─── Work room constants ──────────────────────────────────────────────
const TW = 64, TH = 32, WH = 96
const OX = 420, OY = 120
const COLS = 14, ROWS = 10
const sx = (gx: number, gy: number) => OX + (gx - gy) * (TW / 2)
const sy = (gx: number, gy: number) => OY + (gx + gy) * (TH / 2)

// ─── Meeting room constants ────────────────────────────────────────────
// MEET_OX=1560 ensures NO overlap with work room (right edge≈868) after camera pan
// CAMERA_MEETING = msx(6,4.5) - 480 = 1608 - 480 = 1128  (meeting room is at positive x)
const MEET_OX = 1560, MEET_OY = 120
const MEET_COLS = 12, MEET_ROWS = 9
const msx = (gx: number, gy: number) => MEET_OX + (gx - gy) * (TW / 2)
const msy = (gx: number, gy: number) => MEET_OY + (gx + gy) * (TH / 2)
const CAMERA_MEETING = 1128

// ─── Reception room constants ─────────────────────────────────────────
const RECEP_OX = -480, RECEP_OY = 180
const RECEP_COLS = 8, RECEP_ROWS = 7
const rsx = (gx: number, gy: number) => RECEP_OX + (gx - gy) * (TW / 2)
const rsy = (gx: number, gy: number) => RECEP_OY + (gx + gy) * (TH / 2)
const CAMERA_RECEP = -944

// ─── Roles ───────────────────────────────────────────────────────────
const ROLES: Record<AgentId, string> = {
  otto: 'Estrateg.',
  heitor: 'Complian.',
  salles: 'Roteiri.',
  sonia: 'Perform.',
  aya: 'Assistente',
  pedro_abrahao: 'Consultor',
}

// ─── Idle speech quotes ──────────────────────────────────────────────
const IDLE_QUOTES: Record<AgentId, string[]> = {
  otto:   ['Os dados indicam...', 'Hipótese validada.', 'Q3 up 18%.', 'Revisando briefing.'],
  heitor: ['Risco: amarelo.', 'Revisar antes de pub.', '⚠ Termo crítico.', 'Monitorando...'],
  salles: ['Isso tem alma.', 'Mais tensão aqui.', 'E se abrirmos com...', '...mais café.'],
  sonia:  ['CTR +23%!', 'Novo criativo: GO!', 'ROI aprovado!', 'Métricas no verde!'],
  aya:    ['Compilando outputs.', 'Dossiê pronto.', 'Fluxos conectados.', 'Processando...'],
  pedro_abrahao: ['Faz sentido pra mim.', 'Como paciente...', 'Isso ressoa.', 'Autenticidade.'],
}

// ─── Speech bubble ───────────────────────────────────────────────────
function SpeechBubble({ text }: { text: string }) {
  const MAX_LINE = 20
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > MAX_LINE) { if (cur) lines.push(cur.trim()); cur = w }
    else cur = (cur + ' ' + w).trim()
  }
  if (cur) lines.push(cur.trim())
  const PH = 13, PAD = 7, bW = 116, bH = lines.length * PH + PAD * 2
  return (
    <g>
      <rect x={-bW / 2} y={-bH - 10} width={bW} height={bH} rx={7}
        fill="white" stroke="#d6d3d1" strokeWidth="1" opacity="0.97" />
      <polygon points={`-5,-10 5,-10 0,-3`} fill="white" stroke="#d6d3d1" strokeWidth="1" />
      {lines.map((line, i) => (
        <text key={i} x={0} y={-bH - 10 + PAD + (i + 1) * PH - 2}
          textAnchor="middle" fontSize="8.5" fill="#292524"
          fontFamily="JetBrains Mono, monospace">{line}</text>
      ))}
    </g>
  )
}

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
    <g>
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
          {/* Line 5 — shorter */}
          {filled >= 0.7 && <WallRect wall="left" g1={gy1 + 0.2} g2={gy1 + 0.2 + boardW * Math.min((filled - 0.4) / 0.6, 0.55)} h1={63} h2={65} fill={color} opacity="0.40" />}
          {/* Line 6 */}
          {filled >= 0.85 && <WallRect wall="left" g1={gy1 + 0.2} g2={gy1 + 0.2 + boardW * Math.min((filled - 0.5) / 0.5, 0.45)} h1={70} h2={72} fill={color} opacity="0.35" />}
        </>
      ) : (
        <>
          <WallRect wall="left" g1={gy1 + 0.2} g2={gy2 - 0.4} h1={60} h2={62} fill="#64748b" opacity="0.6" />
          <WallRect wall="left" g1={gy1 + 0.2} g2={gy2 - 0.6} h1={66} h2={68} fill="#64748b" opacity="0.5" />
          <WallRect wall="left" g1={gy1 + 0.5} g2={gy2 - 0.3} h1={72} h2={74} fill="#3b82f6" opacity="0.5" />
          <WallRect wall="left" g1={gy1 + 0.3} g2={gy1 + 0.9} h1={40} h2={56} fill="#dbeafe" opacity="0.7" />
          <WallRect wall="left" g1={gy1 + 1.1} g2={gy1 + 1.7} h1={40} h2={56} fill="#dcfce7" opacity="0.7" />
        </>
      )}
      {/* Markers */}
      <WallRect wall="left" g1={gy1 + 0.15} g2={gy1 + 0.35} h1={22} h2={24} fill="#ef4444" />
      <WallRect wall="left" g1={gy1 + 0.4} g2={gy1 + 0.6} h1={22} h2={24} fill={filled > 0 ? color : '#3b82f6'} />
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

// Glass door — right wall, leads to meeting room
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

// Central collab table (Lemmon Produções identity)
function CollabTable({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      {/* Table surface */}
      <Box gx={gx} gy={gy} w={3.2} d={1.8} h={22} top="#e2e8f0" left="#cbd5e1" right="#dce4ef" />
      <Box gx={gx + 0.08} gy={gy + 0.08} w={3.04} d={1.64} h={23} top="#f8fafc" left="#e2e8f0" right="#eef2f7" />
      {/* Laptop 1 */}
      <Box gx={gx + 0.2} gy={gy + 0.2} w={0.85} d={0.55} h={26} top="#1c1917" left="#111827" right="#221c1a" />
      <Box gx={gx + 0.22} gy={gy + 0.22} w={0.81} d={0.05} h={34} top="#0f172a" left="#020617" right="#0f172a" />
      <Box gx={gx + 0.24} gy={gy + 0.23} w={0.77} d={0.04} h={30} top="#1e3a8a" left="#172554" right="#1d4ed8" />
      {/* Claquete "Lemmon - Take 1" */}
      <Box gx={gx + 1.3} gy={gy + 0.25} w={0.6} d={0.42} h={27} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx + 1.3} gy={gy + 0.25} w={0.6} d={0.1} h={35} top="#1c1917" left="#111827" right="#1c1917" />
      <Box gx={gx + 1.34} gy={gy + 0.26} w={0.15} d={0.08} h={35} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx + 1.52} gy={gy + 0.26} w={0.15} d={0.08} h={35} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      {/* Coffee mugs */}
      <Box gx={gx + 2.5} gy={gy + 0.35} w={0.28} d={0.28} h={28} top="#f8fafc" left="#e2e8f0" right="#f8fafc" />
      <Box gx={gx + 2.52} gy={gy + 0.37} w={0.24} d={0.24} h={26} top="#7c3aed" left="#6d28d9" right="#7c3aed" />
      <Box gx={gx + 2.5} gy={gy + 0.7} w={0.28} d={0.28} h={28} top="#f8fafc" left="#e2e8f0" right="#f8fafc" />
      <Box gx={gx + 2.52} gy={gy + 0.72} w={0.24} d={0.24} h={26} top="#f97316" left="#ea580c" right="#f97316" />
      {/* Post-it cluster */}
      <Box gx={gx + 1.9} gy={gy + 0.12} w={0.42} d={0.38} h={24} top="#fef9c3" left="#fde68a" right="#fef08a" />
      <Box gx={gx + 2.36} gy={gy + 0.16} w={0.38} d={0.32} h={24} top="#fce7f3" left="#fbcfe8" right="#fce7f3" />
      {/* Sony camera on table */}
      <Box gx={gx + 0.9} gy={gy + 0.2} w={0.38} d={0.28} h={28} top="#1c1917" left="#111827" right="#292524" />
      <Box gx={gx + 0.92} gy={gy + 0.22} w={0.06} d={0.04} h={34} top="#0f172a" left="#020617" right="#0f172a" />
      {/* Storyboard sheets */}
      <Box gx={gx + 1.8} gy={gy + 0.65} w={0.58} d={0.42} h={24} top="#f8fafc" left="#e2e8f0" right="#f8fafc" />
      <Box gx={gx + 1.83} gy={gy + 0.67} w={0.52} d={0.38} h={23.5} top="#e2e8f0" left="#cbd5e1" right="#e2e8f0" />
    </g>
  )
}

// TV studio camera on tripod
function CameraOnTripod({ gx, gy }: { gx: number; gy: number }) {
  const bx = sx(gx, gy) + TW / 4, by = sy(gx, gy)
  return (
    <g>
      {/* Tripod base */}
      <Box gx={gx + 0.05} gy={gy + 0.05} w={0.5} d={0.5} h={6} top="#374151" left="#1f2937" right="#374151" />
      {/* Pole */}
      <line x1={bx} y1={by - 6} x2={bx} y2={by - 58} stroke="#4b5563" strokeWidth="3" />
      {/* Camera body */}
      <Box gx={gx - 0.05} gy={gy + 0.08} w={0.75} d={0.42} h={46} top="#1c1917" left="#111827" right="#292524" />
      <Box gx={gx + 0.05} gy={gy + 0.1} w={0.55} d={0.04} h={54} top="#0f172a" left="#020617" right="#0f172a" />
      {/* Lens */}
      <circle cx={bx + 16} cy={by - 50} r={9} fill="#0f172a" stroke="#4b5563" strokeWidth="1.2" />
      <circle cx={bx + 16} cy={by - 50} r={5.5} fill="#1e3a5f" />
      <circle cx={bx + 17} cy={by - 51} r={2.5} fill="#60a5fa" opacity="0.5" />
      {/* REC dot */}
      <circle cx={bx + 26} cy={by - 54} r={2.2} fill="#ef4444" opacity="0.9" />
      {/* Tripod legs */}
      <line x1={bx} y1={by - 6} x2={bx - 14} y2={by + 5} stroke="#374151" strokeWidth="1.5" />
      <line x1={bx} y1={by - 6} x2={bx + 18} y2={by + 5} stroke="#374151" strokeWidth="1.5" />
    </g>
  )
}

// Studio softbox light
function StudioLight({ gx, gy }: { gx: number; gy: number }) {
  const bx = sx(gx, gy) + TW / 4, by = sy(gx, gy)
  return (
    <g>
      <Box gx={gx + 0.1} gy={gy + 0.1} w={0.28} d={0.28} h={6} top="#374151" left="#1f2937" right="#374151" />
      <line x1={bx} y1={by - 6} x2={bx} y2={by - 52} stroke="#4b5563" strokeWidth="2" />
      {/* Softbox head */}
      <Box gx={gx - 0.1} gy={gy + 0.04} w={0.8} d={0.06} h={60} top="#f8fafc" left="#e2e8f0" right="#f1f5f9" />
      <Box gx={gx - 0.08} gy={gy + 0.05} w={0.76} d={0.05} h={58} top="#fffbeb" left="#fef3c7" right="#fffbeb" />
      {/* Light glow */}
      <ellipse cx={bx + 4} cy={by - 62} rx={24} ry={10} fill="#fef9c3" opacity="0.15" />
    </g>
  )
}

// Edit suite (2 monitors + desk)
function EditSuite({ gx, gy }: { gx: number; gy: number }) {
  return (
    <g>
      {/* Desk */}
      <Box gx={gx - 0.15} gy={gy} w={2.0} d={0.95} h={20} top="#292524" left="#1c1917" right="#27211f" />
      {/* Monitor 1 — timeline */}
      <Box gx={gx} gy={gy + 0.06} w={0.05} d={0.25} h={22} top="#374151" left="#1f2937" right="#374151" />
      <Box gx={gx} gy={gy + 0.07} w={1.02} d={0.06} h={52} top="#0f172a" left="#020617" right="#0f172a" />
      <Box gx={gx + 0.04} gy={gy + 0.08} w={0.94} d={0.05} h={46} top="#111827" left="#030712" right="#111827" />
      <Box gx={gx + 0.06} gy={gy + 0.09} w={0.72} d={0.04} h={40} top="#7c3aed" left="#5b21b6" right="#6d28d9" />
      {/* Monitor 2 — color grade */}
      <Box gx={gx + 1.1} gy={gy + 0.07} w={0.68} d={0.06} h={50} top="#0f172a" left="#020617" right="#0f172a" />
      <Box gx={gx + 1.14} gy={gy + 0.08} w={0.60} d={0.05} h={44} top="#111827" left="#030712" right="#111827" />
      <Box gx={gx + 1.16} gy={gy + 0.09} w={0.56} d={0.04} h={38} top="#1e3a8a" left="#172554" right="#1d4ed8" />
      {/* Headphones hanging */}
      <Box gx={gx + 1.65} gy={gy + 0.12} w={0.18} d={0.18} h={46} top="#18181b" left="#09090b" right="#27272a" />
    </g>
  )
}

// Arcade machine (pixel art)
function ArcadeMachine({ gx, gy, color }: { gx: number; gy: number; color: string }) {
  return (
    <g>
      {/* Cabinet */}
      <Box gx={gx} gy={gy} w={0.85} d={0.72} h={56} top="#1c1917" left="#111827" right="#221c1a" />
      {/* Screen bezel */}
      <Box gx={gx + 0.06} gy={gy + 0.06} w={0.73} d={0.05} h={72} top="#0a0a0a" left="#050505" right="#0a0a0a" />
      {/* Screen glow */}
      <Box gx={gx + 0.1} gy={gy + 0.08} w={0.65} d={0.04} h={66} top={color} left={`${color}99`} right={`${color}bb`} />
      {/* Marquise */}
      <Box gx={gx} gy={gy} w={0.85} d={0.72} h={64} top={`${color}bb`} left={`${color}77`} right={`${color}99`} />
      <Box gx={gx + 0.04} gy={gy + 0.04} w={0.77} d={0.64} h={60} top="#000000" left="#000000" right="#000000" />
      {/* Control panel */}
      <Box gx={gx + 0.1} gy={gy + 0.5} w={0.65} d={0.2} h={58} top="#2a2a2a" left="#1a1a1a" right="#2a2a2a" />
      {/* Joystick */}
      <Box gx={gx + 0.18} gy={gy + 0.55} w={0.14} d={0.14} h={61} top="#374151" left="#1f2937" right="#374151" />
      {/* Buttons */}
      <Box gx={gx + 0.44} gy={gy + 0.55} w={0.1} d={0.1} h={60} top="#ef4444" left="#dc2626" right="#ef4444" />
      <Box gx={gx + 0.57} gy={gy + 0.55} w={0.1} d={0.1} h={60} top="#22c55e" left="#16a34a" right="#22c55e" />
    </g>
  )
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

// ─── Work room background ─────────────────────────────────────────────
function RoomBackground({ onDoorClick, whiteBoardFill, whiteBoardColor }: { onDoorClick: () => void; whiteBoardFill?: number; whiteBoardColor?: string }) {
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

// ─── Meeting room background ─────────────────────────────────────────
function MeetingRoomBackground({ theme = DEFAULT_THEME }: { theme?: MeetingTheme }) {
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

// ─── Reception room background ───────────────────────────────────────
function ReceptionBackground() {
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

// ─── Character positions ──────────────────────────────────────────────
const DESK_POS: Record<AgentId, { gx: number; gy: number }> = {
  otto:          { gx: 10.2, gy: 2.45 },
  heitor:        { gx: 12.7, gy: 2.45 },
  salles:        { gx: 2.2,  gy: 8.45 },
  sonia:         { gx: 11.2, gy: 7.45 },
  aya:           { gx: 7.2,  gy: 2.45 },
  pedro_abrahao: { gx: 5.5,  gy: 2.0  },
}

const MEET_CHAR_POS: Record<AgentId, { gx: number; gy: number }> = {
  aya:           { gx: 5.6, gy: 2.0 },
  otto:          { gx: 2.2, gy: 4.5 },
  heitor:        { gx: 9.3, gy: 4.5 },
  salles:        { gx: 3.5, gy: 7.5 },
  sonia:         { gx: 8.1, gy: 7.5 },
  pedro_abrahao: { gx: 7.5, gy: 2.0 },
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

                  {/* Sprite */}
                  <foreignObject x={0} y={0} width={46} height={76}>
                    <div style={{ width: 46, height: 76, overflow: 'visible', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
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
