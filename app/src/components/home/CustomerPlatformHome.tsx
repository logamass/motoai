'use client'

import Link from 'next/link'
import { useMemo, useState, type FormEvent } from 'react'
import { CarImage } from '@/components/car/CarImage'
import { ChatWidget } from '@/components/chat-widget/ChatWidget'

export interface ShowroomModelCard {
  id: string
  brandSlug: string
  brandName: string
  slug: string
  name: string
  bodyType: string
  segment: 'private' | 'taxi' | 'commercial'
  seatsLabel: string
  fuels: string[]
  variantCount: number
  minExShowroom: number | null
  minOnroad1p3: number | null
  minOnroad3p3: number | null
  effectiveDate: string | null
  imageUrl?: string | null
}

interface CustomerPlatformHomeProps {
  models: ShowroomModelCard[]
  dbAvailable: boolean
}

type LangCode = 'en' | 'ta' | 'tanglish'
type CategoryFilter = 'all' | 'hatchback' | 'suv' | 'hybrid' | 'mpv' | 'premium'
type SortOrder = 'low' | 'high'

const HERO_COPY: Record<
  LangCode,
  {
    eyebrow: string
    headline: string
    sub: string
    placeholder: string
    cta: string
    chips: string[]
  }
> = {
  en: {
    eyebrow: '⚡ Chennai RTO + Insurance Verified',
    headline: 'Find the right car for your family — with exact Chennai On-Road prices.',
    sub: 'Compare real 1+3 & 3+3 insurance breakups, honest OMR/Velachery city mileage, and ask MotoAI without sharing your phone number.',
    placeholder: 'Try: Automatic Hybrid SUV under ₹22L in Chennai...',
    cta: 'Ask MotoAI →',
    chips: [
      '5 seater under ₹15L',
      'Best Hybrid for OMR traffic',
      '7 seater family MPV',
      'Hyryder exact breakup',
    ],
  },
  ta: {
    eyebrow: '⚡ சென்னை RTO + இன்சூரன்ஸ் சரிபார்க்கப்பட்டது',
    headline: 'உங்கள் குடும்பத்திற்கான சரியான கார் — துல்லியமான சென்னை ஆன்-ரோடு விலையுடன்.',
    sub: '1+3 மற்றும் 3+3 இன்சூரன்ஸ் விவரங்களை ஒப்பிட்டு, உங்கள் போன் நம்பரைப் பகிராமல் MotoAI-இடம் உடனே கேளுங்கள்.',
    placeholder: 'கேளுங்கள்: ₹22 லட்சத்திற்குள் ஆட்டோமேட்டிக் Hybrid SUV...',
    cta: 'MotoAI-இடம் கேள் →',
    chips: [
      '₹15 லட்சத்திற்குள் 5 சீட்டர் கார்',
      'சென்னை டிராபிக்கிற்கு சிறந்த Hybrid',
      '7 சீட்டர் குடும்ப MPV எது?',
      'Hyryder முழு ஆன்-ரோடு விலை',
    ],
  },
  tanglish: {
    eyebrow: '⚡ Chennai RTO + Insurance Verified',
    headline: 'Family-ku correct-ana car — exact Chennai On-Road price-oda.',
    sub: 'Real 1+3 & 3+3 insurance breakup, Chennai traffic mileage ellam anonymous-a check pannunga. Spam calls zero!',
    placeholder: 'Kelunga: ₹22L kulla Automatic Hybrid SUV in Chennai...',
    cta: 'Ask MotoAI →',
    chips: [
      '5 seater under ₹15L sollu',
      'OMR traffic-ku best Hybrid edhu?',
      '7 seater family MPV options',
      'Hyryder exact Chennai breakup',
    ],
  },
}

const FILTER_TABS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'hatchback', label: 'Hatchback' },
  { id: 'suv', label: 'SUV' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'mpv', label: '7-Seater MPV' },
  { id: 'premium', label: 'Premium' },
]

function formatLakhs(amount: number): string {
  return `₹${(amount / 100_000).toFixed(2)}L`
}

function estimateMonthlyEmi(onRoad: number): number {
  // Indicative EMI: 20% down payment, 5 years (60 months), 9.0% p.a.
  const principal = Math.round(onRoad * 0.8)
  const monthlyRate = 0.09 / 12
  const months = 60
  const factor = Math.pow(1 + monthlyRate, months)
  return Math.round((principal * monthlyRate * factor) / (factor - 1))
}

function formatInr(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(amount))}`
}

function matchesCategory(car: ShowroomModelCard, category: CategoryFilter): boolean {
  if (category === 'all') return true
  const body = car.bodyType.toLowerCase()
  const seats = car.seatsLabel.toLowerCase()
  const fuelsLower = car.fuels.map((f) => f.toLowerCase())

  switch (category) {
    case 'hatchback':
      return body.includes('hatch')
    case 'suv':
      return body.includes('suv')
    case 'hybrid':
      return fuelsLower.some((f) => f.includes('hybrid'))
    case 'mpv':
      return body.includes('mpv') || seats.includes('7') || seats.includes('8')
    case 'premium':
      return (
        (car.minOnroad1p3 !== null && car.minOnroad1p3 >= 2_400_000) ||
        car.slug.includes('fortuner') ||
        car.slug.includes('hycross')
      )
    default:
      return true
  }
}

function openMotoAiWithPrompt(prompt: string) {
  window.dispatchEvent(
    new CustomEvent('motoai:open-chat', {
      detail: { initialMessage: prompt },
    })
  )
}

export function CustomerPlatformHome({ models, dbAvailable }: CustomerPlatformHomeProps) {
  const [lang, setLang] = useState<LangCode>('en')
  const [heroPrompt, setHeroPrompt] = useState('')
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('low')

  const copy = HERO_COPY[lang]

  const filteredModels = useMemo(() => {
    const filtered = models.filter((car) => matchesCategory(car, activeFilter))
    return [...filtered].sort((a, b) => {
      if (a.minOnroad1p3 !== null && b.minOnroad1p3 !== null) {
        return sortOrder === 'low'
          ? a.minOnroad1p3 - b.minOnroad1p3
          : b.minOnroad1p3 - a.minOnroad1p3
      }
      if (a.minOnroad1p3 !== null) return -1
      if (b.minOnroad1p3 !== null) return 1
      return a.name.localeCompare(b.name)
    })
  }, [models, activeFilter, sortOrder])

  function handleHeroSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const query = heroPrompt.trim()
    if (!query) return
    openMotoAiWithPrompt(query)
  }

  return (
    <>
      {/* Interactive AI Hero Prompt Bar */}
      <section className="ai-hero">
        <div className="hero-card">
          <div className="hero-top-row">
            <span className="hero-eyebrow">{copy.eyebrow}</span>

            <div className="lang-pill" role="group" aria-label="Language switcher">
              <button
                type="button"
                className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => setLang('en')}
              >
                EN
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === 'ta' ? 'active' : ''}`}
                onClick={() => setLang('ta')}
              >
                தமிழ்
              </button>
              <button
                type="button"
                className={`lang-btn ${lang === 'tanglish' ? 'active' : ''}`}
                onClick={() => setLang('tanglish')}
              >
                Tanglish
              </button>
            </div>
          </div>

          <h1 className="hero-title">{copy.headline}</h1>
          <p className="hero-sub">{copy.sub}</p>

          <form className="ai-search-box" onSubmit={handleHeroSubmit}>
            <span aria-hidden="true" style={{ fontSize: 18 }}>
              ✨
            </span>
            <input
              type="text"
              value={heroPrompt}
              onChange={(e) => setHeroPrompt(e.target.value)}
              placeholder={copy.placeholder}
              aria-label="Ask MotoAI about Chennai cars and on-road prices"
            />
            <button type="submit" className="btn btn-primary">
              {copy.cta}
            </button>
          </form>

          <div className="chips-row" aria-label="Suggested prompts">
            {copy.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="prompt-chip"
                onClick={() => openMotoAiWithPrompt(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          <div className="trust-strip">
            <span>✓ Exact SQL-Backed RTO + Insurance Breakup</span>
            <span>✓ Zero Spam Calls</span>
            <span>✓ English · தமிழ் · Tanglish</span>
          </div>
        </div>
      </section>

      {/* Live Showroom Catalog */}
      <section className="showroom-wrap" aria-label="Showroom cars">
        <div className="toolbar">
          <div className="filter-pills" role="group" aria-label="Filter by car category">
            {FILTER_TABS.map((tab) => {
              const count =
                tab.id === 'all'
                  ? models.length
                  : models.filter((m) => matchesCategory(m, tab.id)).length
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`filter-pill ${activeFilter === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveFilter(tab.id)}
                >
                  {tab.label}
                  {tab.id === 'all' ? ` (${count})` : ''}
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/compare" className="btn btn-outline btn-sm">
              Compare Cars
            </Link>
            <select
              aria-label="Sort cars by price"
              className="sort-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            >
              <option value="low">Sort: Low → High</option>
              <option value="high">Sort: High → Low</option>
            </select>
          </div>
        </div>

        {filteredModels.length === 0 ? (
          <div className="moto-card">
            <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>
              {models.length === 0
                ? dbAvailable
                  ? 'No published showroom models yet'
                  : 'Showroom inventory offline'
                : 'No models match this category'}
            </h2>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.94rem' }}>
              {models.length === 0
                ? dbAvailable
                  ? 'Publish a dealer price list in the Ops Console to show live Chennai on-road prices here.'
                  : 'Unable to reach PostgreSQL right now. Once the database is running and seeded, live showroom models will appear automatically.'
                : 'Try selecting "All" or asking MotoAI for personalized recommendations.'}
            </p>
          </div>
        ) : (
          <div className="cars-grid">
            {filteredModels.map((car) => {
              const indicativeEmi =
                car.minOnroad1p3 !== null ? estimateMonthlyEmi(car.minOnroad1p3) : null

              return (
                <article key={car.id} className="car-card">
                  <div className="car-media">
                    <CarImage
                      slug={car.slug}
                      src={car.imageUrl}
                      alt={`${car.brandName} ${car.name}`}
                    />
                    <div className="car-media-overlay" />
                    <span className="car-pill-top-left">
                      {car.brandName} · {car.bodyType}
                    </span>
                    <span className="car-pill-top-right">{car.seatsLabel}</span>
                  </div>

                  <div className="car-body">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
                    >
                      <div>
                        <h2 className="car-name">{car.name}</h2>
                        <div className="car-sub">
                          {car.variantCount} variant{car.variantCount === 1 ? '' : 's'}
                          {car.effectiveDate ? ` · Price list ${car.effectiveDate}` : ''}
                        </div>
                      </div>
                      {car.segment === 'taxi' && (
                        <span className="badge badge-accent">Commercial</span>
                      )}
                    </div>

                    <div className="car-tags">
                      {car.fuels.map((fuel) => (
                        <span key={fuel} className="badge badge-slate">
                          {fuel}
                        </span>
                      ))}
                    </div>

                    <div className="car-price-block">
                      <div className="car-price-label">Exact Chennai On-Road (1+3)</div>
                      <div className="car-price-row">
                        <span className="car-price num">
                          {car.minOnroad1p3 !== null
                            ? `${formatLakhs(car.minOnroad1p3)} on-road`
                            : 'Price on request'}
                        </span>
                        {indicativeEmi !== null && (
                          <span className="car-emi num">
                            {formatInr(indicativeEmi)}/mo
                          </span>
                        )}
                      </div>
                      <div className="car-ex num">
                        {car.minExShowroom !== null
                          ? `Starts Ex-Showroom ${formatLakhs(car.minExShowroom)}`
                          : 'Dealer quote available on request'}
                      </div>
                    </div>

                    <div className="car-actions">
                      <Link
                        href={`/cars/${car.brandSlug}/${car.slug}`}
                        className="btn btn-primary btn-sm"
                      >
                        View Breakup →
                      </Link>
                      <button
                        type="button"
                        className="btn btn-soft btn-sm"
                        onClick={() =>
                          openMotoAiWithPrompt(
                            `Tell me the exact Chennai on-road price breakup and best variant for ${car.brandName} ${car.name}`
                          )
                        }
                      >
                        💬 Ask MotoAI
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <p style={{ marginTop: 18, fontSize: 12.5, color: 'var(--muted)' }}>
          * Indicative EMI calculated at 20% down payment, 5-year tenure, 9.0% p.a. Price
          prevailing at delivery applies. Always pay only at the showroom.
        </p>
      </section>

      <ChatWidget />
    </>
  )
}
