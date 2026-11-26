'use client'

import { useState, type CSSProperties } from 'react'

interface CarImageProps {
  slug: string
  alt: string
  src?: string | null
  className?: string
  style?: CSSProperties
}

export function CarImage({ slug, alt, src, className, style }: CarImageProps) {
  const localFallback = `/cars/${encodeURIComponent(slug)}.jpg`
  const [stage, setStage] = useState<'primary' | 'local' | 'svg'>(
    src ? 'primary' : 'local'
  )

  if (stage === 'svg') {
    return (
      <div
        className={className}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: 'linear-gradient(135deg, #e6f4f4 0%, #f1f5f9 100%)',
          color: 'var(--brand)',
          padding: 16,
          textAlign: 'center',
          ...style,
        }}
        role="img"
        aria-label={alt}
      >
        <svg
          width="48"
          height="28"
          viewBox="0 0 64 36"
          fill="none"
          aria-hidden="true"
          style={{ opacity: 0.85 }}
        >
          <path
            d="M8 24H56M13 24L18 12C19.2 9.4 21.8 8 24.7 8H40.5C43.2 8 45.7 9.4 47 11.8L52 20L55 21.5C56.2 22.1 57 23.3 57 24.6V26H7V24.5C7 24.2 7.4 24 8 24Z"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="18" cy="26" r="4.5" fill="var(--surface)" stroke="currentColor" strokeWidth="2.4" />
          <circle cx="46" cy="26" r="4.5" fill="var(--surface)" stroke="currentColor" strokeWidth="2.4" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{alt}</span>
      </div>
    )
  }

  const activeSrc = stage === 'primary' && src ? src : localFallback

  return (
    <img
      src={activeSrc}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        ...style,
      }}
      onError={() => {
        if (stage === 'primary') setStage('local')
        else setStage('svg')
      }}
    />
  )
}
