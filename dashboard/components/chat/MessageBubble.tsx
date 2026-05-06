import { motion } from 'framer-motion'
import { AGENT_MAP, type AgentId } from '@/lib/agents'
import { type Message } from '@/lib/useChat'
import CharacterSprite from '../office/CharacterSprite'

export function exportTxt(messages: Message[]) {
  const lines: string[] = ['LEMMON PRODUÇÕES — Relatório de Sessão', '='.repeat(50), '']
  for (const msg of messages) {
    if (msg.role === 'user') {
      lines.push('VOCÊ:', msg.content, '')
    } else {
      const agent = AGENT_MAP[msg.role as AgentId] ?? AGENT_MAP[msg.role.replace(/_v\d+$/, '') as AgentId]
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

export function UserMessage({ msg }: { msg: Message }) {
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

export function AgentMessage({ msg }: { msg: Message }) {
  const agent = AGENT_MAP[msg.role as AgentId] ?? AGENT_MAP[msg.role.replace(/_v\d+$/, '') as AgentId]
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
