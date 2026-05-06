'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { API_URL } from '@/lib/api'

interface ShareData {
  token: string
  session_id: string
  briefing: string
  agentes_usados: string[]
  respostas: Record<string, string>
  comentarios: Array<{ autor: string; texto: string; created_at: string }>
}

export default function SharePage() {
  const params = useParams()
  const token = params?.token as string

  const [data, setData] = useState<ShareData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [autor, setAutor] = useState('')
  const [texto, setTexto] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState('')

  useEffect(() => {
    if (!token) return
    fetch(`${API_URL}/share/${token}.json`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setNotFound(true))
  }, [token])

  const sendComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!texto.trim()) return
    setSending(true)
    setSendError('')
    try {
      const r = await fetch(`${API_URL}/share/${token}/comentar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autor: autor || 'Cliente', texto }),
      })
      if (!r.ok) {
        const err = await r.json()
        setSendError(err.detail ?? 'Erro ao enviar comentário')
        return
      }
      const updated = await fetch(`${API_URL}/share/${token}.json`).then(r => r.json())
      setData(updated)
      setTexto('')
      setSent(true)
      setTimeout(() => setSent(false), 3000)
    } catch {
      setSendError('Erro de conexão. Tente novamente.')
    } finally {
      setSending(false)
    }
  }

  if (notFound) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white text-sm font-bold">L</span>
        </div>
        <p className="text-sm font-mono text-stone-500">Link não encontrado ou expirado.</p>
      </div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <p className="text-[10px] font-mono text-stone-400 uppercase tracking-widest animate-pulse">Carregando...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center gap-3">
        <div className="w-7 h-7 bg-stone-900 rounded-lg flex items-center justify-center">
          <span className="text-white text-[11px] font-bold">L</span>
        </div>
        <div>
          <span className="font-semibold text-sm tracking-tight">Lemmon<span className="font-light text-stone-500"> Produções</span></span>
          <p className="text-[9px] font-mono text-stone-400 uppercase tracking-widest">Aprovação de conteúdo</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-10 space-y-8">
        <div className="bg-stone-100 border-l-4 border-stone-400 rounded-r-xl px-5 py-4">
          <p className="text-[9px] font-mono text-stone-400 uppercase tracking-widest mb-1">Briefing</p>
          <p className="text-sm text-stone-700 leading-relaxed">{data.briefing?.slice(0, 500)}</p>
        </div>

        {data.agentes_usados.map(ag => {
          const txt = data.respostas[ag]
          if (!txt) return null
          return (
            <div key={ag} className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
              <div className="bg-stone-900 px-5 py-3">
                <span className="text-[10px] font-mono text-white uppercase tracking-widest font-bold">{ag}</span>
              </div>
              <pre className="px-5 py-4 text-sm font-mono text-stone-700 leading-relaxed whitespace-pre-wrap">
                {txt}
              </pre>
            </div>
          )
        })}

        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-stone-100">
            <h2 className="text-[10px] font-mono text-stone-500 uppercase tracking-widest font-bold">Comentários</h2>
          </div>

          {data.comentarios.length === 0 ? (
            <p className="px-5 py-6 text-[10px] font-mono text-stone-400 uppercase tracking-widest text-center">
              Nenhum comentário ainda.
            </p>
          ) : (
            <div className="divide-y divide-stone-100">
              {data.comentarios.map((c, i) => (
                <div key={i} className="px-5 py-4">
                  <p className="text-[9px] font-mono text-stone-500 font-bold mb-1">{c.autor}</p>
                  <p className="text-sm text-stone-700 leading-relaxed">{c.texto}</p>
                  <p className="text-[8px] font-mono text-stone-300 mt-1">
                    {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={sendComment} className="px-5 py-5 border-t border-stone-100 space-y-3">
            <input value={autor} onChange={e => setAutor(e.target.value)}
              placeholder="Seu nome (opcional)"
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-700 font-mono focus:outline-none focus:border-stone-400" />
            <textarea value={texto} onChange={e => setTexto(e.target.value)}
              rows={3} required placeholder="Seu comentário..."
              maxLength={2000}
              className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-700 font-mono focus:outline-none focus:border-stone-400 resize-none" />
            {sendError && <p className="text-[10px] font-mono text-red-500">{sendError}</p>}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={sending || !texto.trim()}
                className="px-5 py-2.5 bg-stone-900 text-white text-[10px] font-mono font-bold uppercase tracking-widest rounded-xl
                  hover:bg-stone-700 active:scale-[0.98] transition-all disabled:opacity-40">
                {sending ? 'Enviando...' : 'Enviar comentário'}
              </button>
              {sent && <span className="text-[10px] font-mono text-green-600 uppercase tracking-widest">✓ Enviado!</span>}
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
