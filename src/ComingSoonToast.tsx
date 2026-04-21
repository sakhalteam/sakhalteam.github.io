// ComingSoonToast.tsx
//
// Single mount point for "coming soon" feedback across every scene. A toast
// slides down from the top-center, auto-dismisses after AUTO_DISMISS_MS, and
// also dismisses on × click or any click outside itself.

import { useEffect, useRef } from "react";
import { useComingSoon, hideComingSoon } from "./comingSoonStore";

const AUTO_DISMISS_MS = 2500;

export default function ComingSoonToast() {
  const label = useComingSoon();
  const toastRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!label) return;

    const dismissTimer = window.setTimeout(hideComingSoon, AUTO_DISMISS_MS);

    const onDocClick = (e: MouseEvent) => {
      if (toastRef.current && toastRef.current.contains(e.target as Node)) {
        return;
      }
      hideComingSoon();
    };
    // Next-tick so the click that opened the toast doesn't immediately close it.
    const registerTimer = window.setTimeout(() => {
      document.addEventListener("click", onDocClick);
    }, 0);

    return () => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(registerTimer);
      document.removeEventListener("click", onDocClick);
    };
  }, [label]);

  if (!label) return null;

  return (
    <div
      key={label}
      ref={toastRef}
      className="coming-soon-toast"
      role="status"
      aria-live="polite"
    >
      <div className="modal-tag">⚑ COMING SOON</div>
      <h2 className="modal-name">{label}</h2>
      <p className="modal-text">
        This zone is still under construction. Check back later.
      </p>
      <button
        className="coming-soon-toast__close"
        onClick={hideComingSoon}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
