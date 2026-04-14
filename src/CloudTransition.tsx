import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useTransitionPhase,
  getTransitionTarget,
  cloudsFullyCovered,
  cloudsFullyCleared,
} from './transitionStore'
import './CloudTransition.css'

const CLOUDS_IN_MS = 800
const CLOUDS_OUT_MS = 900

// Bump definitions: { left (vw), width (vw), height (vh) }
// Staggered sizes create organic puffy cloud silhouettes
const TOP_BUMPS = [
  { left: -8,  width: 35, height: 16 },
  { left: 14,  width: 28, height: 14 },
  { left: 34,  width: 32, height: 18 },
  { left: 54,  width: 26, height: 13 },
  { left: 70,  width: 30, height: 16 },
  { left: 88,  width: 25, height: 14 },
]

const BOTTOM_BUMPS = [
  { left: -5,  width: 30, height: 15 },
  { left: 17,  width: 32, height: 17 },
  { left: 40,  width: 25, height: 13 },
  { left: 57,  width: 28, height: 16 },
  { left: 76,  width: 35, height: 18 },
  { left: 93,  width: 22, height: 12 },
]

export default function CloudTransition() {
  const navigate = useNavigate()
  const phase = useTransitionPhase()

  // When clouds finish covering → navigate + set holding
  useEffect(() => {
    if (phase !== 'clouds-in') return
    const timer = setTimeout(() => {
      const { url, internal } = getTransitionTarget()
      cloudsFullyCovered()
      if (internal) navigate(url)
      else window.location.href = url
    }, CLOUDS_IN_MS)
    return () => clearTimeout(timer)
  }, [phase, navigate])

  // When clouds finish parting → clean up
  useEffect(() => {
    if (phase !== 'clouds-out') return
    const timer = setTimeout(cloudsFullyCleared, CLOUDS_OUT_MS)
    return () => clearTimeout(timer)
  }, [phase])

  if (phase === 'idle') return null

  return (
    <div className={`cloud-overlay cloud-overlay--${phase}`} aria-hidden="true">
      {/* Top cloud bank */}
      <div className="cloud-bank cloud-bank--top">
        <div className="cloud-body" />
        {TOP_BUMPS.map((b, i) => (
          <div
            key={i}
            className="cloud-bump"
            style={{
              left: `${b.left}vw`,
              width: `${b.width}vw`,
              height: `${b.height}vh`,
            }}
          />
        ))}
      </div>
      {/* Bottom cloud bank */}
      <div className="cloud-bank cloud-bank--bottom">
        <div className="cloud-body" />
        {BOTTOM_BUMPS.map((b, i) => (
          <div
            key={i}
            className="cloud-bump"
            style={{
              left: `${b.left}vw`,
              width: `${b.width}vw`,
              height: `${b.height}vh`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
