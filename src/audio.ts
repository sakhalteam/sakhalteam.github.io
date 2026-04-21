// audio.ts
//
// Shared sound cache + cycling sound player. Used by both ToyInteractor (toy
// clicks) and IslandScene (coming-soon zone clicks).
//
// - One HTMLAudioElement per URL (browser-cached playback, no re-download)
// - Per-key rotating index: pass the same `key` each call and the array will
//   cycle. Zones use marker.name, toys use obj.name — separate keys so toy and
//   zone cycles don't interfere.

const audioCache = new Map<string, HTMLAudioElement>();
const cycleIndex = new Map<string, number>();

/** Play a single URL. Creates + caches an HTMLAudioElement on first use. */
export function playSound(url: string, volume = 0.4) {
  let audio = audioCache.get(url);
  if (!audio) {
    audio = new Audio(url);
    audioCache.set(url, audio);
  }
  audio.volume = volume;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/**
 * Play one of `urls`, advancing the cycle index for `key` so consecutive calls
 * rotate through the list. A single-entry array just plays that one sound.
 */
export function playCyclingSound(key: string, urls: string[], volume = 0.4) {
  if (!urls.length) return;
  const idx = cycleIndex.get(key) ?? 0;
  cycleIndex.set(key, idx + 1);
  playSound(urls[idx % urls.length], volume);
}
