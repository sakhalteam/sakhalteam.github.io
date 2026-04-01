import { useState, useRef, useEffect } from 'react'

const SITES = [
  { label: 'ADHDO', url: '/adhdo/' },
  { label: 'Bird Bingo', url: '/bird-bingo/' },
  { label: 'Japanese Articles', url: '/japanese-articles/' },
  { label: 'NikBeat', url: '/nikbeat/' },
  { label: 'Pokemon Park', url: '/pokemon-park/' },
  { label: 'Weather Report', url: '/weather-report/' },
]

export default function QuickNav() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="quick-nav" ref={ref}>
      <button
        className="quick-nav-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Quick navigate to sites"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect y="2" width="16" height="1.5" rx="0.75" fill="currentColor" />
          <rect y="7.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
          <rect y="12.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
        <span>Sites</span>
      </button>

      {open && (
        <div className="quick-nav-menu">
          {SITES.map(s => (
            <a key={s.url} href={s.url} className="quick-nav-item">
              {s.label}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
