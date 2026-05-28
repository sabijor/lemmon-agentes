'use client'
/**
 * T142 — componentes do header extraídos de app/page.tsx.
 *
 * Next 14 não permite exports não-default em `app/<route>/page.tsx` (só metadata,
 * generateStaticParams, etc). Mas Fast Refresh do Next quebra quando há funções
 * de componente NÃO-exportadas misturadas com `export default` no mesmo arquivo
 * — força full reload em vez de HMR incremental. Solução: extrair pra cá.
 */
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div className="w-8 h-8" />
  const isDark = resolvedTheme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      className="w-8 h-8 rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center justify-center hover:bg-stone-50 dark:hover:bg-stone-800 hover:border-stone-400 dark:hover:border-stone-500 transition-all text-stone-500 dark:text-stone-400"
    >
      {isDark
        ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      }
    </button>
  )
}

export function Clock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    const fmtDate = () => new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: 'short' })
    const update = () => setTime(`${fmtDate()} · ${fmt()}`)
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return <div className="text-[10px] font-mono text-stone-400 uppercase tracking-widest hidden lg:block">{time}</div>
}

export function AutoModeToggle({ autoMode, setAutoMode, disabled, showRecommended }: { autoMode: boolean; setAutoMode: (v: boolean) => void; disabled?: boolean; showRecommended?: boolean }) {
  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setAutoMode(!autoMode)}
        disabled={disabled}
        title={autoMode ? 'Modo Auto — IA escolhe os agentes' : 'Modo Expert — você escolhe manualmente'}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[10px] font-mono uppercase tracking-widest transition-all
          ${autoMode
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
            : 'bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className="text-sm leading-none">{autoMode ? '🤖' : '🔧'}</span>
        <span>{autoMode ? 'Auto' : 'Expert'}</span>
      </button>
      {/* T148 — badge "Recomendado" some quando cliente fez 1ª sessão */}
      {showRecommended && autoMode && (
        <span className="absolute -top-2 -right-2 text-[8px] font-mono uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold shadow-sm pointer-events-none whitespace-nowrap">
          recomendado
        </span>
      )}
    </div>
  )
}
