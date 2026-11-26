import Link from 'next/link'
import type { ReactNode } from 'react'

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="c-header">
        <div className="c-header-inner">
          <Link href="/" className="brand-logo">
            <span className="brand-mark">M</span>
            <span>MotoAI</span>
            <span className="brand-city-pill">Chennai</span>
          </Link>

          <nav className="c-nav" aria-label="Public navigation">
            <Link href="/" className="c-nav-link">
              Cars
            </Link>
            <Link href="/whatsapp" className="c-nav-link">
              WhatsApp Advisor
            </Link>
            <Link href="/compare" className="c-nav-link">
              Compare
            </Link>
            <Link href="/admin" className="c-nav-ops">
              Ops Console
            </Link>
          </nav>
        </div>
      </header>

      <div className="zero-spam-bar" role="note">
        🔒 100% Anonymous Chennai On-Road Prices — Zero spam calls. Share WhatsApp only when
        you book a test drive.
      </div>

      <main>{children}</main>
    </>
  )
}
