import { useState } from 'react'
import './App.css'

interface Zone {
  id: string
  name: string
  tagline: string
  flavorText: string
  link: string | null
  x: number
  y: number
}

const ZONES: Zone[] = [
  {
    id: 'bird-bingo',
    name: 'Bird Sanctuary',
    tagline: 'Sibley Bird Bingo',
    flavorText: '',
    link: '/bird-bingo/',
    x: 606,
    y: 150,
  },
  {
    id: 'japanese-articles',
    name: 'Reading Room',
    tagline: 'Japanese reading practice',
    flavorText: '',
    link: '/japanese-articles/',
    x: 476,
    y: 428,
  },
  {
    id: 'observatory',
    name: 'Observatory',
    tagline: 'Uninhabited',
    flavorText: 'These peaks are still uncharted. Explorers are on their way.',
    link: null,
    x: 196,
    y: 210,
  },
  {
    id: 'workshop',
    name: 'Workshop',
    tagline: 'Uninhabited',
    flavorText: 'The tools are laid out, but nothing has been built yet.',
    link: null,
    x: 265,
    y: 383,
  },
  {
    id: 'village',
    name: 'Village Square',
    tagline: 'Under construction',
    flavorText: 'The heart of the island. Something is being built here — check back later.',
    link: null,
    x: 384,
    y: 270,
  },
  {
    id: 'harbor',
    name: 'Old Harbor',
    tagline: 'Uninhabited',
    flavorText: 'No ships have docked here in a long time.',
    link: null,
    x: 630,
    y: 295,
  },
]

// Island outline path — 800×550 viewBox
const ISLAND_PATH =
  'M 248,128 C 295,95 355,80 415,87 C 460,92 500,78 542,100 C 572,118 600,108 628,130 ' +
  'C 655,150 663,182 654,215 C 646,242 652,270 645,298 C 635,340 615,372 575,400 ' +
  'C 543,422 520,442 478,452 C 445,460 408,464 368,458 C 325,450 282,438 245,418 ' +
  'C 200,392 163,360 155,320 C 145,278 157,238 170,208 C 183,178 205,150 232,138 ' +
  'C 238,134 244,130 248,128 Z'

export default function App() {
  const [selected, setSelected] = useState<Zone | null>(null)

  function handleZoneClick(zone: Zone, e: React.MouseEvent) {
    e.stopPropagation()
    if (zone.link) {
      window.location.href = zone.link
    } else {
      setSelected(prev => (prev?.id === zone.id ? null : zone))
    }
  }

  return (
    <div className="ocean" onClick={() => setSelected(null)}>
      {/* Header */}
      <header className="site-header">
        <h1 className="site-title">SAKHALTEAM</h1>
        <p className="site-subtitle">an archipelago of small projects</p>
      </header>

      {/* Island map */}
      <div className="map-wrap">
        <svg
          viewBox="0 0 800 550"
          className="island-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Island fill gradient */}
            <radialGradient id="islandGrad" cx="42%" cy="44%" r="58%">
              <stop offset="0%"   stopColor="#2e5e2e" />
              <stop offset="55%"  stopColor="#1e4220" />
              <stop offset="100%" stopColor="#112515" />
            </radialGradient>

            {/* Glow filter for active markers */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Drop shadow for island */}
            <filter id="islandShadow" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="4" dy="7" stdDeviation="14" floodColor="#01040a" floodOpacity="0.9" />
            </filter>
          </defs>

          {/* Island landmass */}
          <path
            d={ISLAND_PATH}
            fill="url(#islandGrad)"
            stroke="#2a5c2a"
            strokeWidth="1.5"
            filter="url(#islandShadow)"
          />

          {/* Terrain details — subtle hill shapes */}
          <ellipse cx="205" cy="224" rx="30" ry="15" fill="#163a16" opacity="0.65" />
          <ellipse cx="228" cy="210" rx="19" ry="10" fill="#1e4a1e" opacity="0.55" />
          <ellipse cx="398" cy="292" rx="24" ry="12" fill="#163a16" opacity="0.38" />
          <ellipse cx="470" cy="205" rx="18" ry="9"  fill="#163a16" opacity="0.45" />
          <ellipse cx="485" cy="400" rx="16" ry="8"  fill="#163a16" opacity="0.50" />

          {/* Coastline foam — very subtle highlight along shore */}
          <path
            d={ISLAND_PATH}
            fill="none"
            stroke="#4a8a4a"
            strokeWidth="1"
            opacity="0.22"
          />

          {/* Zone markers */}
          {ZONES.map(zone => {
            const isActive = Boolean(zone.link)
            const labelY = zone.y + 22

            return (
              <g
                key={zone.id}
                className={`zone ${isActive ? 'zone--active' : 'zone--inactive'}`}
                onClick={e => handleZoneClick(zone, e)}
              >
                {/* Pulse rings — active zones only */}
                {isActive && (
                  <>
                    <circle
                      cx={zone.x} cy={zone.y} r="10"
                      fill="none" stroke="#e05a3a" strokeWidth="1.2"
                      className="pulse-ring pulse-ring--1"
                    />
                    <circle
                      cx={zone.x} cy={zone.y} r="10"
                      fill="none" stroke="#e05a3a" strokeWidth="1.2"
                      className="pulse-ring pulse-ring--2"
                    />
                  </>
                )}

                {/* Marker dot */}
                <circle
                  cx={zone.x} cy={zone.y} r="8"
                  fill={isActive ? '#e05a3a' : '#1e2e42'}
                  stroke={isActive ? '#ff9070' : '#3a5068'}
                  strokeWidth="1.5"
                  filter={isActive ? 'url(#glow)' : undefined}
                  className="zone-dot"
                />

                {/* Specular highlight */}
                <circle
                  cx={zone.x - 2} cy={zone.y - 2} r="2.5"
                  fill={isActive ? 'rgba(255,210,190,0.45)' : 'rgba(80,110,140,0.25)'}
                />

                {/* Zone name label */}
                <text
                  x={zone.x} y={labelY}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="system-ui, -apple-system, sans-serif"
                  fontWeight="600"
                  letterSpacing="0.09em"
                  fill={isActive ? '#c8a098' : '#3a4e62'}
                  className="zone-label"
                >
                  {zone.name.toUpperCase()}
                </text>
              </g>
            )
          })}
        </svg>

      </div>

      {/* Inactive zone modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-tag">⚑ {selected.tagline.toUpperCase()}</div>
            <h2 className="modal-name">{selected.name}</h2>
            <p className="modal-text">{selected.flavorText}</p>
            <button className="modal-close" onClick={() => setSelected(null)}>
              close
            </button>
          </div>
        </div>
      )}

      {/* Footer legend */}
      <footer className="site-footer">
        <span className="footer-hint">
          <span className="legend-dot legend-dot--active" />
          active &nbsp;·&nbsp;
          <span className="legend-dot legend-dot--inactive" />
          uninhabited
        </span>
      </footer>
    </div>
  )
}
