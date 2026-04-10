import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PlanPilot',
  description: 'AI-powered project planning',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
