import Link from 'next/link'
import { db, getAllFlags, getAllModules, getAllRoutes, getAllTools } from '@motoai/core'
import { conversations, customers, messages } from '@motoai/mod-customers/schema'
import { leads } from '@motoai/mod-leads/schema'
import { priceLists } from '@motoai/mod-pricing/schema'
import { ensureBooted } from '@/lib/bootstrap'

export const dynamic = 'force-dynamic'

interface DayTrafficBucket {
  key: string
  label: string
  whatsapp: number
  web: number
}

interface LiveOpsSnapshot {
  dbConnected: boolean
  activeBuyers: number
  conversationsCount: number
  humanTakeoverCount: number
  leadsCount: number
  testDriveCount: number
  publishedPriceListsCount: number
  whatsappTotal: number
  webTotal: number
  last7Days: DayTrafficBucket[]
}

function buildLast7DaysBuckets(): DayTrafficBucket[] {
  const buckets: DayTrafficBucket[] = []
  const now = new Date()

  for (let offset = 6; offset >= 0; offset -= 1) {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - offset)
    const key = d.toISOString().slice(0, 10)
    const label =
      offset === 0
        ? 'Today'
        : d.toLocaleDateString('en-IN', { weekday: 'short' })
    buckets.push({ key, label, whatsapp: 0, web: 0 })
  }

  return buckets
}

async function loadLiveOpsSnapshot(): Promise<LiveOpsSnapshot> {
  const buckets = buildLast7DaysBuckets()
  const bucketMap = new Map(buckets.map((b) => [b.key, b]))

  try {
    const [customerRows, conversationRows, leadRows, priceListRows, messageRows] =
      await Promise.all([
        db.select({ id: customers.id }).from(customers),
        db
          .select({
            id: conversations.id,
            humanTakeover: conversations.humanTakeover,
          })
          .from(conversations),
        db.select({ id: leads.id, stage: leads.stage }).from(leads),
        db.select({ id: priceLists.id, status: priceLists.status }).from(priceLists),
        db
          .select({
            channel: messages.channel,
            createdAt: messages.createdAt,
          })
          .from(messages),
      ])

    let whatsappTotal = 0
    let webTotal = 0

    for (const msg of messageRows) {
      if (msg.channel === 'whatsapp') whatsappTotal += 1
      else if (msg.channel === 'web') webTotal += 1

      const created = msg.createdAt instanceof Date ? msg.createdAt : new Date(msg.createdAt)
      if (!Number.isNaN(created.getTime())) {
        const dayKey = created.toISOString().slice(0, 10)
        const bucket = bucketMap.get(dayKey)
        if (bucket) {
          if (msg.channel === 'whatsapp') bucket.whatsapp += 1
          else if (msg.channel === 'web') bucket.web += 1
        }
      }
    }

    return {
      dbConnected: true,
      activeBuyers: customerRows.length,
      conversationsCount: conversationRows.length,
      humanTakeoverCount: conversationRows.filter((c) => c.humanTakeover).length,
      leadsCount: leadRows.length,
      testDriveCount: leadRows.filter((l) => l.stage === 'test_drive').length,
      publishedPriceListsCount: priceListRows.filter((p) => p.status === 'published').length,
      whatsappTotal,
      webTotal,
      last7Days: buckets,
    }
  } catch {
    return {
      dbConnected: false,
      activeBuyers: 0,
      conversationsCount: 0,
      humanTakeoverCount: 0,
      leadsCount: 0,
      testDriveCount: 0,
      publishedPriceListsCount: 0,
      whatsappTotal: 0,
      webTotal: 0,
      last7Days: buckets,
    }
  }
}

const QUICK_JUMPS = [
  {
    title: 'Live Advisor Inbox',
    description: 'Triage WhatsApp & Web chats, pause AI bot for human takeover, and send showroom handoffs.',
    href: '/admin/inbox',
    badge: 'Operations',
  },
  {
    title: 'WhatsApp Business Setup',
    description: 'Verify Meta Cloud API webhook, manage tokens, inspect templates, and test bot live.',
    href: '/admin/whatsapp',
    badge: 'Platform',
  },
  {
    title: 'PDF Upload & Price Editor',
    description: 'Upload dealer price PDFs/JSON, validate 1% TCS arithmetic diffs, and publish live.',
    href: '/admin/upload',
    badge: 'Catalog & Data',
  },
  {
    title: 'Team & Roles',
    description: 'Manage internal B2C team members and toggle the 4-role permission matrix.',
    href: '/admin/team',
    badge: 'Access Control',
  },
]

export default async function AdminDashboardPage() {
  await ensureBooted()

  const [snapshot, modules, tools, routes, flags] = await Promise.all([
    loadLiveOpsSnapshot(),
    Promise.resolve(getAllModules()),
    Promise.resolve(getAllTools()),
    Promise.resolve(getAllRoutes()),
    Promise.resolve(getAllFlags()),
  ])

  const maxDayBar = Math.max(
    1,
    ...snapshot.last7Days.flatMap((d) => [d.whatsapp, d.web])
  )
  const enabledFlagsCount = Object.values(flags).filter(Boolean).length
  const totalFlagsCount = Object.keys(flags).length

  return (
    <div>
      {/* Compact Ops Header */}
      <div className="ops-page-head">
        <div>
          <h2 className="ops-page-title">Chennai Operations Command</h2>
          <p className="ops-page-sub">
            Live Postgres telemetry across WhatsApp, Web Showroom, Price Lists, and AI Agent tools.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            className={`ops-badge ${snapshot.dbConnected ? 'ops-badge-ok' : 'ops-badge-accent'}`}
          >
            {snapshot.dbConnected ? '● Postgres Connected' : '● Postgres Offline (Fallback 0)'}
          </span>
          <Link href="/admin/inbox" className="ops-btn ops-btn-primary ops-btn-sm">
            Open Live Inbox →
          </Link>
        </div>
      </div>

      {/* 4 Live Postgres KPI Cards */}
      <div className="ops-kpi-grid">
        <div className="ops-card">
          <div className="ops-kpi-label">Active Buyers</div>
          <div className="ops-kpi-val">{snapshot.activeBuyers}</div>
          <span className="ops-badge ops-badge-brand">Unique Postgres profiles</span>
        </div>

        <div className="ops-card">
          <div className="ops-kpi-label">Conversations</div>
          <div className="ops-kpi-val">{snapshot.conversationsCount}</div>
          <span
            className={`ops-badge ${
              snapshot.humanTakeoverCount > 0 ? 'ops-badge-accent' : 'ops-badge-slate'
            }`}
          >
            {snapshot.humanTakeoverCount} in human takeover
          </span>
        </div>

        <div className="ops-card">
          <div className="ops-kpi-label">Leads / Test Drives</div>
          <div className="ops-kpi-val">{snapshot.leadsCount}</div>
          <span className="ops-badge ops-badge-ok">
            {snapshot.testDriveCount} test drive booked
          </span>
        </div>

        <div className="ops-card">
          <div className="ops-kpi-label">Published Price Lists</div>
          <div className="ops-kpi-val">{snapshot.publishedPriceListsCount}</div>
          <span className="ops-badge ops-badge-brand">Verified SQL pricing</span>
        </div>
      </div>

      {/* 7-Day Channel Chart + Quick Jump Cards */}
      <div className="ops-overview-grid">
        <section className="ops-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <h3 className="ops-panel-title">WhatsApp vs Web Messages — Last 7 Days</h3>
              <div className="ops-panel-sub">
                Live message volume from Postgres ({snapshot.whatsappTotal} WhatsApp ·{' '}
                {snapshot.webTotal} Web all-time)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 12, fontWeight: 700 }}>
              <span style={{ color: '#075E54' }}>■ WhatsApp</span>
              <span style={{ color: '#0B6E6E' }}>■ Web</span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: 10,
              alignItems: 'end',
              height: 190,
              paddingTop: 18,
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            {snapshot.last7Days.map((bucket) => {
              const waPx =
                bucket.whatsapp > 0
                  ? Math.max(10, Math.round((bucket.whatsapp / maxDayBar) * 136))
                  : 4
              const webPx =
                bucket.web > 0
                  ? Math.max(10, Math.round((bucket.web / maxDayBar) * 136))
                  : 4

              return (
                <div
                  key={bucket.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 6,
                    height: '100%',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#64748B',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {bucket.whatsapp + bucket.web}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-end',
                      gap: 4,
                      height: 138,
                    }}
                  >
                    <div
                      title={`${bucket.label} WhatsApp: ${bucket.whatsapp}`}
                      style={{
                        width: 14,
                        height: waPx,
                        background: bucket.whatsapp > 0 ? '#25D366' : '#DCFCE7',
                        borderRadius: '4px 4px 0 0',
                      }}
                    />
                    <div
                      title={`${bucket.label} Web: ${bucket.web}`}
                      style={{
                        width: 14,
                        height: webPx,
                        background: bucket.web > 0 ? '#0B6E6E' : '#E2E8F0',
                        borderRadius: '4px 4px 0 0',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748B' }}>
                    {bucket.label}
                  </span>
                </div>
              )
            })}
          </div>
        </section>

        {/* Quick Jump Cards */}
        <section className="ops-card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <h3 className="ops-panel-title">Quick Jump Workspaces</h3>
            <div className="ops-panel-sub">Direct access to core operational consoles</div>
          </div>

          <div style={{ display: 'grid', gap: 9 }}>
            {QUICK_JUMPS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  textDecoration: 'none',
                  color: '#0F172A',
                }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>
                    {item.description}
                  </div>
                </div>
                <span className="ops-badge ops-badge-slate" style={{ flexShrink: 0 }}>
                  {item.badge}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Registered Modules & Agent Tools Compact Status Strip */}
      <section className="ops-card">
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            marginBottom: 12,
          }}
        >
          <div>
            <h3 className="ops-panel-title">Registered Modules &amp; Agent Tools Status</h3>
            <div className="ops-panel-sub">
              {modules.length} booted modules · {tools.length} SQL-backed agent tools ·{' '}
              {routes.length} API routes · {enabledFlagsCount}/{totalFlagsCount} flags enabled
            </div>
          </div>
          <Link href="/admin/settings" className="ops-btn ops-btn-outline ops-btn-sm">
            Inspect Flags &amp; Guardrails →
          </Link>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
            gap: 10,
            marginBottom: 14,
          }}
        >
          {modules.map((mod) => (
            <div
              key={mod.name}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{mod.name}</div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>
                  {mod.routes?.length ?? 0} routes · {mod.tools?.length ?? 0} tools
                </div>
              </div>
              <span className="ops-badge ops-badge-ok">ON</span>
            </div>
          ))}
        </div>

        {tools.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tools.map((tool) => (
              <span
                key={tool.name}
                title={tool.description}
                className="ops-badge ops-badge-slate"
                style={{ fontFamily: 'monospace', fontSize: 11.5 }}
              >
                {tool.name}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
