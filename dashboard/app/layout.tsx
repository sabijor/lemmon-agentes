import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lemmon | Agentes',
  description: 'Sistema multi-agente da Lemmon Produções',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="noise">{children}</body>
    </html>
  )
}
