// environment/AtmospherePanel.tsx
//
// Dark sectioned popover styled to match the codepen control layout:
//   • Time Controls  (phase label + hour slider/input + minute slider/input)
//   • Time Animation (timescale slider with readout)
//   • Weather        (pill buttons — our semantic weather layer)
//
// Toggled open/closed by a floating ⚙ button. Click-outside / Escape close.

import { useEffect, useRef, useState } from "react";
import { WEATHERS, WEATHER_LABELS } from "./presets";
import { useAtmosphere } from "./AtmosphereContext";

function formatClock(hour: number, minute: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${minute.toString().padStart(2, "0")} ${ampm}`;
}

const TIMESCALE_STOPS = [0, 60, 300, 600, 1200, 3600];

function nearestStop(ts: number): number {
  let best = TIMESCALE_STOPS[0];
  let bestDist = Math.abs(ts - best);
  for (const s of TIMESCALE_STOPS) {
    const d = Math.abs(ts - s);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

export default function AtmospherePanel() {
  const [open, setOpen] = useState(false);
  const {
    hour,
    minute,
    timescale,
    weather,
    setHour,
    setMinute,
    setTimescale,
    setWeather,
    params,
  } = useAtmosphere();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tsLabel =
    timescale === 0 ? "0x (Paused)" : `${timescale}x`;

  return (
    <div className="atmosphere-panel" ref={ref}>
      <button
        className="atmosphere-toggle"
        onClick={() => setOpen((o) => !o)}
        title="Atmosphere"
        aria-label="Atmosphere settings"
      >
        {open ? "\u2715" : "\u2699"}
      </button>
      {open && (
        <div className="atmosphere-popover">
          {/* Time Controls */}
          <section className="atm-section">
            <h4 className="atm-header">Time Controls</h4>
            <div className="atm-clock-row">
              <span className="atm-clock">{formatClock(hour, minute)}</span>
              <span className="atm-phase">{params.phaseLabel}</span>
            </div>

            <label className="atm-field">
              <span className="atm-field-label">Hour</span>
              <input
                type="range"
                min={0}
                max={23}
                step={1}
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value))}
                className="atm-slider"
              />
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value) || 0)}
                className="atm-number"
              />
            </label>

            <label className="atm-field">
              <span className="atm-field-label">Minute</span>
              <input
                type="range"
                min={0}
                max={59}
                step={1}
                value={minute}
                onChange={(e) => setMinute(parseInt(e.target.value))}
                className="atm-slider"
              />
              <input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(parseInt(e.target.value) || 0)}
                className="atm-number"
              />
            </label>
          </section>

          {/* Time Animation */}
          <section className="atm-section">
            <h4 className="atm-header">Time Animation</h4>
            <label className="atm-field">
              <span className="atm-field-label">Timescale</span>
              <input
                type="range"
                min={0}
                max={TIMESCALE_STOPS.length - 1}
                step={1}
                value={TIMESCALE_STOPS.indexOf(nearestStop(timescale))}
                onChange={(e) =>
                  setTimescale(TIMESCALE_STOPS[parseInt(e.target.value)])
                }
                className="atm-slider"
              />
              <span className="atm-readout">{tsLabel}</span>
            </label>
          </section>

          {/* Weather */}
          <section className="atm-section">
            <h4 className="atm-header">Weather</h4>
            <div className="atmosphere-options">
              {WEATHERS.map((w) => (
                <button
                  key={w}
                  className={`atmosphere-option ${weather === w ? "is-active" : ""}`}
                  onClick={() => setWeather(w)}
                >
                  {WEATHER_LABELS[w]}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
