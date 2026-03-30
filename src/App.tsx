import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import './App.css'
import IslandScene from './IslandScene'
import BirdSanctuaryScene from './BirdSanctuaryScene'
import QuickNav from './QuickNav'

function HomePage() {
  const [comingSoon, setComingSoon] = useState<string | null>(null)

  return (
    <div className="ocean" onClick={() => setComingSoon(null)}>
      <QuickNav />
      <header className="site-header">
        <h1 className="site-title">SAKHALTEAM</h1>
        <p className="site-subtitle">an archipelago of small projects</p>
      </header>

      <div className="map-wrap">
        <IslandScene
          style={{ width: '100%', height: '100%' }}
          onComingSoon={setComingSoon}
        />
      </div>

      {comingSoon && (
        <div className="modal-overlay" onClick={() => setComingSoon(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-tag">⚑ COMING SOON</div>
            <h2 className="modal-name">{comingSoon}</h2>
            <p className="modal-text">This zone is still under construction. Check back later.</p>
            <button className="modal-close" onClick={() => setComingSoon(null)}>close</button>
          </div>
        </div>
      )}

      <footer className="site-footer">
        <span className="footer-hint">
          <span className="legend-dot legend-dot--active" />
          active &nbsp;·&nbsp;
          <span className="legend-dot legend-dot--inactive" />
          uninhabited &nbsp;·&nbsp;
          drag to rotate · scroll to zoom
        </span>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/bird-sanctuary" element={<BirdSanctuaryScene />} />
    </Routes>
  )
}
