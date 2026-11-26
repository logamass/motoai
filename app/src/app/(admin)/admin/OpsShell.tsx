'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { OPS_ROLES, useOps, type OpsRole } from './ops-context'

interface NavItem {
  label: string
  href: string
  icon: string
  badgeKey?: 'conversations' | 'leads'
}

interface NavSection {
  title: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'OPERATIONS',
    items: [
      { label: 'Overview', href: '/admin', icon: '📊' },
      {
        label: 'Live Advisor Inbox',
        href: '/admin/inbox',
        icon: '💬',
        badgeKey: 'conversations',
      },
      {
        label: 'Lead & Showroom Router',
        href: '/admin/leads',
        icon: '🧭',
        badgeKey: 'leads',
      },
    ],
  },
  {
    title: 'CATALOG & DATA',
    items: [
      { label: 'PDF Upload & Price Editor', href: '/admin/upload', icon: '📄' },
      { label: 'Vehicle Catalog', href: '/admin/catalog', icon: '🚘' },
      { label: 'AI Playbooks', href: '/admin/playbooks', icon: '📘' },
    ],
  },
  {
    title: 'PLATFORM',
    items: [
      { label: 'WhatsApp Business Setup', href: '/admin/whatsapp', icon: '📱' },
      { label: 'Team & Roles', href: '/admin/team', icon: '👥' },
      { label: 'Analytics', href: '/admin/analytics', icon: '📈' },
      { label: 'AI Guardrails & Settings', href: '/admin/settings', icon: '🛡️' },
    ],
  },
]

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Operations Overview',
  '/admin/inbox': 'Live Advisor Inbox',
  '/admin/leads': 'Lead & Showroom Router',
  '/admin/upload': 'PDF Upload & Price Editor',
  '/admin/catalog': 'Vehicle Catalog & On-Road Prices',
  '/admin/playbooks': 'AI Playbooks',
  '/admin/whatsapp': 'WhatsApp Business Setup',
  '/admin/team': 'Team & Role Control',
  '/admin/analytics': 'Analytics & Funnel Telemetry',
  '/admin/settings': 'AI Guardrails & Settings',
}

export function OpsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { activeRole, setActiveRole, activePermissions } = useOps()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [counts, setCounts] = useState<{ conversations: number | null; leads: number | null }>({
    conversations: null,
    leads: null,
  })

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    let active = true
    fetch('/api/modules/analytics/summary')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { totalConversations?: number; totalLeads?: number } | null) => {
        if (!active || !data) return
        setCounts({
          conversations:
            typeof data.totalConversations === 'number' ? data.totalConversations : null,
          leads: typeof data.totalLeads === 'number' ? data.totalLeads : null,
        })
      })
      .catch(() => {
        // Keep counts unset if API/DB is offline
      })
    return () => {
      active = false
    }
  }, [pathname])

  const activePermissionCount = useMemo(
    () => Object.values(activePermissions).filter(Boolean).length,
    [activePermissions]
  )

  const pageTitle = PAGE_TITLES[pathname] ?? 'MotoAI Ops Console'

  return (
    <div className="ops-shell-root">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            zIndex: 80,
          }}
        />
      )}

      {/* Fixed 240px Dark-Navy Left Sidebar */}
      <aside className={`ops-sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Ops sidebar">
        <div className="ops-side-brand">
          <div className="ops-brand-left">
            <div className="ops-brand-mark">M</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#FFFFFF', lineHeight: 1.2 }}>
                MotoAI Ops
              </div>
              <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 600 }}>
                Internal Console
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ops-mobile-toggle"
            aria-label="Close navigation"
            style={{
              background: 'transparent',
              borderColor: 'rgba(255,255,255,0.2)',
              color: '#E2E8F0',
            }}
          >
            ✕
          </button>
        </div>

        <nav className="ops-nav">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="ops-sec-label">{section.title}</div>
              {section.items.map((item) => {
                const isActive =
                  item.href === '/admin'
                    ? pathname === '/admin'
                    : pathname === item.href || pathname.startsWith(`${item.href}/`)
                const countVal =
                  item.badgeKey === 'conversations'
                    ? counts.conversations
                    : item.badgeKey === 'leads'
                      ? counts.leads
                      : null

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`ops-nav-item ${isActive ? 'active' : ''}`}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span aria-hidden="true" style={{ fontSize: 14, flexShrink: 0 }}>
                        {item.icon}
                      </span>
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.label}
                      </span>
                    </span>
                    {typeof countVal === 'number' && countVal > 0 && (
                      <span className="ops-nav-count">{countVal}</span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className="ops-sidebar-footer">
          <Link href="/" className="ops-site-link">
            <span>↗ View Customer Site</span>
          </Link>

          <div className="ops-user-card">
            <div className="ops-avatar">L</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.25 }}>
                Loga · Platform Admin
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: '#94A3B8',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Preview: {activeRole}
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Main Column */}
      <div className="ops-main">
        <header className="ops-topbar">
          <div className="ops-topbar-left">
            <button
              type="button"
              className="ops-mobile-toggle"
              onClick={() => setSidebarOpen((prev) => !prev)}
              aria-label="Open navigation"
            >
              ☰
            </button>
            <h1
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: '-0.01em',
                color: '#0F172A',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {pageTitle}
            </h1>
            <span className="ops-badge ops-badge-brand">
              {activePermissionCount}/7 Permissions
            </span>
          </div>

          <div className="ops-topbar-right">
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#64748B',
              }}
            >
              <span>Role Preview:</span>
              <select
                aria-label="Role Preview Switcher"
                className="ops-select"
                value={activeRole}
                onChange={(e) => setActiveRole(e.target.value as OpsRole)}
                style={{ padding: '5px 10px', fontSize: 12.5 }}
              >
                {OPS_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>

            <Link
              href="/admin/whatsapp"
              className="ops-badge ops-badge-ok"
              style={{ textDecoration: 'none' }}
            >
              <span>● WABA Ready</span>
            </Link>
          </div>
        </header>

        <div className="ops-content">{children}</div>
      </div>
    </div>
  )
}
