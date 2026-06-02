import type { Metadata } from 'next'
import './globals.css'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/lib/theme-provider'

export const metadata: Metadata = {
  title: 'Lemmon | Agentes',
  description: 'Time IA da sua clínica — conversa, valida e entrega',
  manifest: '/manifest.json',  // PROD-6 — PWA
  themeColor: '#10b981',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Lemmon',
  },
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
