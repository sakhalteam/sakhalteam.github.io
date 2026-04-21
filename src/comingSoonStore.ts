// comingSoonStore.ts
//
// Module-scope pub/sub for the "coming soon" toast. Anyone that detects a
// click on a not-yet-built zone calls showComingSoon(label); the toast
// component subscribes and renders.

import { useEffect, useState } from "react";

type Listener = (label: string | null) => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export function showComingSoon(label: string) {
  current = label;
  for (const l of listeners) l(current);
}

export function hideComingSoon() {
  current = null;
  for (const l of listeners) l(null);
}

/** React hook: returns the currently-shown label, or null. */
export function useComingSoon(): string | null {
  const [label, setLabel] = useState<string | null>(current);
  useEffect(() => {
    listeners.add(setLabel);
    return () => {
      listeners.delete(setLabel);
    };
  }, []);
  return label;
}
