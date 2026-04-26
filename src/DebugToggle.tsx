import { Frame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setDebugHitboxes, useDebugHitboxes } from "./debugFlags";
import { triggerCameraReset } from "./useCameraReset";

const CLOSE_DELAY_MS = 1800;

export default function DebugToggle() {
  const hitboxes = useDebugHitboxes();
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
      className={`debug-toggle ${open ? "debug-toggle--open" : ""}`}
      onPointerEnter={openDial}
      onPointerLeave={scheduleClose}
      onFocus={openDial}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose();
      }}
    >
      <button
        className="debug-toggle-trigger"
        type="button"
        aria-expanded={open}
        aria-label="Debug options"
        title="Debug options"
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      <div className="debug-toggle-panel" aria-hidden={!open}>
        <button
          type="button"
          className="debug-toggle-action"
          onClick={() => triggerCameraReset()}
        >
          <Frame size={14} strokeWidth={1.75} aria-hidden />
          reframe
        </button>
        <label className="debug-toggle-option">
          <input
            type="checkbox"
            checked={hitboxes}
            onChange={(event) => setDebugHitboxes(event.currentTarget.checked)}
          />
          hitboxes
        </label>
      </div>
    </div>
  );
}
