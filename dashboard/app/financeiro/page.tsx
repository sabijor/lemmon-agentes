'use client'
/**
 * PROD-FIN v1.47 — Tela de planilha financeira.
 *
 * Fluxo:
 * 1. Drag-and-drop XLSX/CSV (ou seleção via botão)
 * 2. Upload → mostra resumo estrutural (colunas, total, candidatos-chave)
 * 3. Click "Analisar com Ana Maria" → loading + análise em markdown
 * 4. Lista lateral de planilhas anteriores
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  useFinanceiro,
  type PlanilhaMeta,
  type ResumoEstrutural,
  type AnaliseResultado,
} from '@/lib/useFinanceiro'

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function fmtData(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

function fmtBRL(usd: number) {
  return `R$ ${(usd * 5.5).toFixed(2).replace('.', ',')}`
}

export default function FinanceiroPage() {
  const { upload, listar, analisar, uploading, analyzing, error } = useFinanceiro()
  const [planilhas, setPlanilhas] = useState<PlanilhaMeta[]>([])
  const [selecionada, setSelecionada] = useState<PlanilhaMeta | null>(null)
  const [resumo, setResumo] = useState<ResumoEstrutural | null>(null)
  const [analise, setAnalise] = useState<AnaliseResultado | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Carrega lista inicial
  useEffect(() => {
    listar().then(setPlanilhas)
  }, [listar])

  // Toast erro
  useEffect(() => {
    if (error) toast.error(`Erro: ${error}`)
  }, [error])

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      toast.error('Aceita só .xlsx ou .csv')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error('Arquivo maior que 50MB. Reduza antes de enviar.')
      return
    }
    toast.info(`📤 Enviando ${file.name}…`)
    const result = await upload(file)
    if (!result) return
    toast.success(`✅ ${file.name} carregada. ${result.resumo.total_linhas} linhas.`)
    setResumo(result.resumo)
    setAviso(result.aviso)
    setAnalise(null)
    // Atualiza lista
    const lista = await listar()
    setPlanilhas(lista)
    const nova = lista.find(p => p.file_id === result.file_id)
    if (nova) setSelecionada(nova)
  }, [upload, listar])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleUpload(f)
  }, [handleUpload])

  const handleAnalisar = useCallback(async () => {
    if (!selecionada) return
    setAnalise(null)
    toast.info('🤖 Ana Maria analisando… (pode levar 30-60s)')
    const result = await analisar(selecionada.file_id)
    if (result) {
      setAnalise(result)
      toast.success(`✅ Análise pronta — ${fmtBRL(result.custo_usd)}`)
    }
  }, [selecionada, analisar])

  const handleSelecionar = useCallback(async (p: PlanilhaMeta) => {
    setSelecionada(p)
    setAnalise(null)
    setResumo(null)
    setAviso(null)
    // TODO: opcional — chamar /resumo pra atualizar o card. Por enquanto usa só meta.
  }, [])

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 px-6 py-6">
      <header className="flex items-center justify-between mb-6 max-w-7xl mx-auto">
        <div>
          <Link href="/" className="text-xs font-mono text-stone-500 hover:text-stone-700 dark:hover:text-stone-300">
            ← voltar ao chat
          </Link>
          <h1 className="text-2xl font-bold mt-1">💼 Análise Financeira</h1>
          <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
            Suba planilha (XLSX/CSV) da clínica. Ana Maria analisa receita, ticket médio, top procedimentos e alertas.
          </p>
        </div>
        <div className="text-xs font-mono text-stone-500">
          {planilhas.length} planilha{planilhas.length === 1 ? '' : 's'} no histórico
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-6 max-w-7xl mx-auto">
        {/* Sidebar — histórico */}
        <aside className="space-y-2">
          <h2 className="text-xs font-mono uppercase tracking-widest text-stone-500 px-1">Histórico</h2>
          {planilhas.length === 0 && (
            <div className="text-xs text-stone-500 px-1 py-3">
              Nada por aqui ainda. Sua primeira planilha vai aparecer assim que você subir.
            </div>
          )}
          {planilhas.map(p => (
            <button
              key={p.file_id}
              onClick={() => handleSelecionar(p)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selecionada?.file_id === p.file_id
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                  : 'border-stone-200 dark:border-stone-800 hover:bg-stone-100 dark:hover:bg-stone-900'
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs">{p.formato === 'xlsx' ? '📗' : '📄'}</span>
                {p.cifrado && <span className="text-[10px]" title="Cifrado">🔒</span>}
                <span className="text-xs font-medium truncate flex-1" title={p.filename_original}>
                  {p.filename_original}
                </span>
              </div>
              <div className="text-[10px] text-stone-500 font-mono">
                {p.total_linhas} linhas · {fmtBytes(p.tamanho_bytes)} · {fmtData(p.uploaded_at)}
              </div>
            </button>
          ))}
        </aside>

        {/* Main — upload + análise */}
        <main className="space-y-6">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
              dragging
                ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20'
                : 'border-stone-300 dark:border-stone-700 hover:border-stone-400'
            } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ''
              }}
            />
            {uploading ? (
              <div className="space-y-2">
                <div className="text-2xl animate-pulse">⏳</div>
                <p className="text-sm text-stone-600 dark:text-stone-400">Enviando + validando…</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-3xl">📤</div>
                <p className="text-sm font-medium">
                  {dragging ? 'Solte aqui' : 'Arraste sua planilha ou clique pra escolher'}
                </p>
                <p className="text-xs text-stone-500">
                  Aceita .xlsx e .csv até 50MB · cripto-at-rest se LEMMON_ENCRYPT_KEY estiver setada
                </p>
              </div>
            )}
          </div>

          {/* Aviso de cripto */}
          {aviso && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              {aviso}
            </div>
          )}

          {/* Resumo do upload OU da planilha selecionada */}
          {(resumo || selecionada) && (
            <section className="rounded-xl border border-stone-200 dark:border-stone-800 p-5 bg-white dark:bg-stone-900">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold">📊 Planilha carregada</h3>
                  <p className="text-xs text-stone-500 font-mono mt-1">
                    {selecionada?.filename_original}
                  </p>
                </div>
                <button
                  onClick={handleAnalisar}
                  disabled={analyzing || !selecionada}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {analyzing ? '⏳ Analisando…' : '🤖 Analisar com Ana Maria'}
                </button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <Stat label="Formato" value={(resumo?.formato || selecionada?.formato || '').toUpperCase()} />
                <Stat label="Total de linhas" value={String(resumo?.total_linhas ?? selecionada?.total_linhas ?? '?')} />
                <Stat label="Colunas" value={String(resumo?.colunas?.length ?? selecionada?.colunas?.length ?? '?')} />
                <Stat label="Tamanho" value={fmtBytes(resumo?.tamanho_bytes ?? selecionada?.tamanho_bytes ?? 0)} />
              </div>

              {resumo?.candidatos_colunas && Object.keys(resumo.candidatos_colunas).length > 0 && (
                <div className="text-xs space-y-1.5 border-t border-stone-200 dark:border-stone-800 pt-3">
                  <p className="font-mono uppercase tracking-widest text-stone-500">Colunas-chave detectadas</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(resumo.candidatos_colunas).map(([k, v]) => (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700"
                        title={v.join(', ')}
                      >
                        <strong>{k}</strong>: {v.join(', ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Análise da Ana Maria */}
          {analise && (
            <section className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="text-emerald-700 dark:text-emerald-300">👩‍💼 Ana Maria — análise</span>
                </h3>
                <span className="text-xs font-mono text-stone-500">
                  custo: {fmtBRL(analise.custo_usd)} ({analise.custo_usd.toFixed(4)} USD)
                </span>
              </div>
              <div
                className="prose prose-stone dark:prose-invert max-w-none text-sm
                  prose-headings:font-bold prose-h2:text-base prose-h3:text-sm
                  prose-table:text-xs prose-th:bg-stone-100 dark:prose-th:bg-stone-800"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(analise.analise) }}
              />
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/50">
      <div className="text-[10px] font-mono uppercase tracking-widest text-stone-500">{label}</div>
      <div className="text-base font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  )
}

/** Renderiza markdown simples (headings + lists + tables + bold/italic + code).
 *  Não é production-grade. Pra análise da Ana Maria basta. */
function renderMarkdown(md: string): string {
  // Sanitize básico (sem HTML cru — análise da Ana é só texto)
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Bold + italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Tables — detecta linhas com | e gera <table>
  const lines = html.split('\n')
  const out: string[] = []
  let inTable = false
  let inUl = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isTableRow = /^\s*\|.*\|\s*$/.test(line)
    const isTableSep = /^\s*\|[\s\-:|]+\|\s*$/.test(line)
    const isListItem = /^\s*[-*]\s+/.test(line)

    if (isTableRow && !isTableSep) {
      if (!inTable) {
        out.push('<table><tbody>')
        inTable = true
      }
      const cells = line.split('|').slice(1, -1).map(c => c.trim())
      const tag = (i + 1 < lines.length && /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])) ? 'th' : 'td'
      out.push('<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>')
      if (tag === 'th') {
        out.push('</tbody><tbody>')
      }
      continue
    }
    if (isTableSep) continue
    if (inTable) {
      out.push('</tbody></table>')
      inTable = false
    }

    if (isListItem) {
      if (!inUl) {
        out.push('<ul>')
        inUl = true
      }
      out.push('<li>' + line.replace(/^\s*[-*]\s+/, '') + '</li>')
      continue
    }
    if (inUl) {
      out.push('</ul>')
      inUl = false
    }

    if (line.trim()) {
      // Heading já foi processado acima — paragraph simples
      if (!/^<h[1-6]>/.test(line)) {
        out.push('<p>' + line + '</p>')
      } else {
        out.push(line)
      }
    }
  }
  if (inTable) out.push('</tbody></table>')
  if (inUl) out.push('</ul>')

  return out.join('\n')
}
