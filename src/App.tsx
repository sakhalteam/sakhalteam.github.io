import { useState, useRef, useCallback } from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import IslandScene from "./IslandScene";
import ZoneScene from "./ZoneScene";
import QuickNav from "./QuickNav";
import CloudTransition from "./CloudTransition";
import { useSceneTransition } from "./useSceneTransition";
import { getActiveZones } from "./sceneMap";

/** Zones that use ZoneScene (all active zones except the island root) */
const zoneRoutes = getActiveZones().filter((z) => z.key !== "island");

function HomePage() {
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const turntableToggleRef = useRef<(() => void) | null>(null);
  const [turntablePlaying, setTurntablePlaying] = useState(true);
  const [islandReady, setIslandReady] = useState(false);
  const { wrapStyle } = useSceneTransition(islandReady);

  const onTurntableChange = useCallback(
    (toggle: () => void, playing: boolean) => {
      turntableToggleRef.current = toggle;
      setTurntablePlaying(playing);
    },
    [],
  );

  return (
    <div className="ocean" onClick={() => setComingSoon(null)}>
      <header className="site-header">
        <h1 className="site-title">SAKHALTEAM</h1>
        <p className="site-subtitle">an archipelago of small projects</p>
      </header>

      <div className="map-wrap" style={wrapStyle}>
        <IslandScene
          style={{ width: "100%", height: "100%" }}
          onComingSoon={setComingSoon}
          onTurntableChange={onTurntableChange}
          onReady={() => setIslandReady(true)}
        />
      </div>

      {comingSoon && (
        <div className="modal-overlay" onClick={() => setComingSoon(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-tag">⚑ COMING SOON</div>
            <h2 className="modal-name">{comingSoon}</h2>
            <p className="modal-text">
              This zone is still under construction. Check back later.
            </p>
            <button className="modal-close" onClick={() => setComingSoon(null)}>
              close
            </button>
          </div>
        </div>
      )}

      <footer className="site-footer">
        <span className="footer-hint">
          <span className="legend-dot legend-dot--active" />
          active &nbsp;·&nbsp;
          <span className="legend-dot legend-dot--inactive" />
          uninhabited &nbsp;·&nbsp; drag to rotate · scroll to zoom ·
          WASD/QE/RF/ZX for keyboard
        </span>
        <button
          className="turntable-toggle"
          onClick={() => turntableToggleRef.current?.()}
          title={turntablePlaying ? "Pause rotation" : "Resume rotation"}
        >
          {turntablePlaying ? "\u23F8" : "\u23F5"}
        </button>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <>
      <QuickNav />
      <CloudTransition />
      <Routes>
        <Route path="/" element={<HomePage />} />
        {zoneRoutes.map((z) => (
          <Route
            key={z.key}
            path={z.path!}
            element={
              <ZoneScene
                glbPath={z.glbPath!}
                zoneKey={z.key}
                title={z.label.toUpperCase()}
                environmentPreset={z.environmentPreset as any}
                {...(z.camera && { camera: z.camera })}
              />
            }
          />
        ))}
      </Routes>
    </>
  );
}
