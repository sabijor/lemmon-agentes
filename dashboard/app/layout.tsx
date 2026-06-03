import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/lib/theme-provider'

export const metadata: Metadata = {
  title: 'Lemmon | Agentes',
  description: 'Time IA da sua clínica — conversa, valida e entrega',
  manifest: '/manifest.json',  // PROD-6 — PWA
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lemmon',
  },
}

// Next.js 14+: themeColor / colorScheme / viewport pertencem ao export viewport
export const viewport: Viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="noise">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="lemmon-theme">
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
