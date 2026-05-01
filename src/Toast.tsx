// Toast.tsx
//
// Small bottom-right ephemeral notifier. Mounted once in App.tsx and
// driven via showToast() from anywhere in the codebase.

import { useEffect, useState } from "react";
import { subscribeToast } from "./toastStore";

export default function Toast() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => subscribeToast(setMessage), []);
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.88)",
        color: "#e5e7eb",
        padding: "10px 16px",
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.4,
        letterSpacing: "0.04em",
        maxWidth: 360,
        boxShadow:
          "0 4px 14px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255,255,255,0.06) inset",
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
