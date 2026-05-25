import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const CLOSE_DELAY_MS = 1800;

export default function LegendToggle() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current == null) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const openDial = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, CLOSE_DELAY_MS);
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      clearCloseTimer();
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`legend-toggle ${open ? "legend-toggle--open" : ""}`}
      onPointerEnter={openDial}
      onPointerLeave={scheduleClose}
      onFocus={openDial}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose();
      }}
    >
      <button
        className={`corner-btn ${open ? "corner-btn--open" : ""}`}
        type="button"
        aria-expanded={open}
        aria-label="Legend & controls"
        title="Legend & controls"
        onClick={() => setOpen((current) => !current)}
      >
        <HelpCircle size={14} strokeWidth={1.75} aria-hidden />
      </button>
      <div className="legend-toggle-panel" aria-hidden={!open}>
        <div className="legend-toggle-row">
          <span className="legend-dot legend-dot--active" />
          active
        </div>
        <div className="legend-toggle-row">
          <span className="legend-dot legend-dot--inactive" />
          uninhabited
        </div>
        <div className="legend-toggle-sep" />
        <div>drag to rotate · scroll to zoom</div>
        <div>WASD pan · QE orbit · RF zoom · ZX rise/lower</div>
      </div>
    </div>
  );
}
