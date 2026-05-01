// toastStore.ts
//
// Tiny module-level pubsub for ephemeral "toast" notifications. Used
// primarily by the leva lighting copy button. One global toast at a time;
// new calls replace the current message.

type Listener = (message: string | null) => void;

const listeners = new Set<Listener>();
let current: string | null = null;
let timeoutId: number | null = null;

export function showToast(message: string, durationMs = 3500) {
  current = message;
  for (const listener of listeners) listener(current);
  if (timeoutId !== null) window.clearTimeout(timeoutId);
  timeoutId = window.setTimeout(() => {
    current = null;
    for (const listener of listeners) listener(null);
    timeoutId = null;
  }, durationMs);
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
