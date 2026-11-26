import type { Metadata } from 'next'
import { Inter, Noto_Sans_Tamil } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const notoSansTamil = Noto_Sans_Tamil({
  subsets: ['tamil', 'latin'],
  variable: '--font-noto-tamil',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MotoAI — Chennai On-Road Car Prices & AI Advisor',
  description:
    'Customer-facing AI car advisor with exact SQL-backed Chennai on-road prices in English, Tamil, and Tanglish.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${notoSansTamil.variable}`}>
      <body>{children}</body>
    </html>
  )
}
