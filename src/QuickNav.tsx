import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getIslandZones, getSisterSites, getActiveZones, sceneMap } from './sceneMap'
import type { SceneNode } from './sceneMap'

const sisterSites = getSisterSites().map(s => ({ label: s.label, url: s.url! }))
const activeKeys = new Set(getActiveZones().map(z => z.key))

/** Build a flat list of zone entries with depth for indentation */
function buildZoneTree(): { node: SceneNode; depth: number }[] {
  const result: { node: SceneNode; depth: number }[] = []

  function walk(node: SceneNode, depth: number) {
    result.push({ node, depth })
    // Add child zones (not toys/portals)
    for (const childKey of node.children) {
      const child = sceneMap.get(childKey)
      if (child && child.type === 'zone') {
        walk(child, depth + 1)
      }
    }
  }

  for (const zone of getIslandZones()) {
    walk(zone, 0)
  }

  return result
}

const zoneTree = buildZoneTree()

export default function QuickNav() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

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
        aria-label="Quick navigate"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect y="2" width="16" height="1.5" rx="0.75" fill="currentColor" />
          <rect y="7.25" width="16" height="1.5" rx="0.75" fill="currentColor" />
          <rect y="12.5" width="16" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
        <span>Map</span>
      </button>

      {open && (
        <div className="quick-nav-menu">
          <div className="quick-nav-section">Zones</div>
          {zoneTree.map(({ node, depth }) => {
            const isActive = activeKeys.has(node.key)
            return (
              <button
                key={node.key}
                className={`quick-nav-item ${!isActive ? 'quick-nav-item--disabled' : ''}`}
                style={{ paddingLeft: `${0.85 + depth * 0.9}rem` }}
                onClick={() => {
                  if (isActive && node.path) {
                    navigate(node.path)
                    setOpen(false)
                  }
                }}
                disabled={!isActive}
              >
                {depth > 0 && <span className="quick-nav-indent">└</span>}
                {node.label}
                {!isActive && <span className="quick-nav-soon">soon</span>}
              </button>
            )
          })}

          <div className="quick-nav-section">Sites</div>
          {sisterSites.map(s => (
            <a key={s.url} href={s.url} className="quick-nav-item">
              {s.label}
              <span className="quick-nav-external">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
