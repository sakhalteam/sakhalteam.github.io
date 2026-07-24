// QuickNav.tsx

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getIslandZones,
  getSisterSites,
  getPersonalSites,
  getActiveZones,
  sceneMap,
} from "./sceneMap";
import type { SceneNode } from "./sceneMap";

const sisterSites = getSisterSites().map((s) => ({
  label: s.label,
  url: s.url!,
}));
const personalSites = getPersonalSites().map((s) => ({
  label: s.label,
  url: s.url!,
}));
const activeKeys = new Set(getActiveZones().map((z) => z.key));

// Soft passphrase gate for personal sites. This is a CURTAIN, not a lock:
// the real protection is each personal tool's own auth (traction = Supabase
// login + RLS). We store only the SHA-256 hash so the plaintext never lives
// in the repo/bundle. Unlock state is in-memory only → auto-relocks on refresh.
const PERSONAL_HASH =
  "3b3b53c2a6bdd088d8b0fa6b73274972db439f6ae25393f680a77d6112cded94";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build a flat list of zone entries with depth for indentation */
function buildZoneTree(): { node: SceneNode; depth: number }[] {
  const result: { node: SceneNode; depth: number }[] = [];

  function walk(node: SceneNode, depth: number) {
    result.push({ node, depth });
    // Add child zones (not toys/portals)
    for (const childKey of node.children) {
      const child = sceneMap.get(childKey);
      if (child && child.type === "zone") {
        walk(child, depth + 1);
      }
    }
  }

  for (const zone of getIslandZones()) {
    walk(zone, 0);
  }

  return result;
}

const zoneTree = buildZoneTree();

export default function QuickNav() {
  const [open, setOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [entry, setEntry] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus the passphrase field the moment it appears.
  useEffect(() => {
    if (promptOpen) inputRef.current?.focus();
  }, [promptOpen]);

  // Clicking the inconspicuous +/− toggle next to "Sites".
  function handleGateToggle() {
    if (unlocked) {
      // − relocks and hides the personal sites again.
      setUnlocked(false);
      setPromptOpen(false);
      setEntry("");
    } else {
      setPromptOpen((p) => !p);
      setEntry("");
    }
  }

  // Live check — unfurls the instant the full passphrase is typed, no Enter.
  async function handleEntryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setEntry(value);
    if ((await sha256Hex(value)) === PERSONAL_HASH) {
      setUnlocked(true);
      setPromptOpen(false);
      setEntry("");
    }
  }

  return (
    <div className="quick-nav" ref={ref}>
      <button
        className="quick-nav-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Quick navigate"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <rect y="2" width="16" height="1.5" rx="0.75" fill="currentColor" />
          <rect
            y="7.25"
            width="16"
            height="1.5"
            rx="0.75"
            fill="currentColor"
          />
          <rect
            y="12.5"
            width="16"
            height="1.5"
            rx="0.75"
            fill="currentColor"
          />
        </svg>
        <span>Map</span>
      </button>

      {open && (
        <div className="quick-nav-menu">
          <div className="quick-nav-section">Zones</div>
          {zoneTree.map(({ node, depth }) => {
            const isActive = activeKeys.has(node.key);
            return (
              <button
                key={node.key}
                className={`quick-nav-item ${!isActive ? "quick-nav-item--disabled" : ""}`}
                style={{ paddingLeft: `${0.85 + depth * 0.9}rem` }}
                onClick={() => {
                  if (isActive && node.path) {
                    navigate(node.path);
                    setOpen(false);
                  }
                }}
                disabled={!isActive}
              >
                {depth > 0 && <span className="quick-nav-indent">└</span>}
                {node.label}
                {!isActive && <span className="quick-nav-soon">soon</span>}
              </button>
            );
          })}

          <div className="quick-nav-section quick-nav-section--sites">
            <span>Sites</span>
            <button
              className="quick-nav-gate"
              onClick={handleGateToggle}
              aria-label={unlocked ? "Hide personal sites" : "More"}
              title={unlocked ? "Hide" : "More"}
            >
              {unlocked ? "−" : "+"}
            </button>
          </div>

          {promptOpen && !unlocked && (
            <input
              ref={inputRef}
              type="password"
              className="quick-nav-gate-input"
              value={entry}
              onChange={handleEntryChange}
              placeholder="…"
              aria-label="Passphrase"
              autoComplete="off"
              spellCheck={false}
            />
          )}

          {sisterSites.map((s) => (
            <a key={s.url} href={s.url} className="quick-nav-item">
              {s.label}
              <span className="quick-nav-external">↗</span>
            </a>
          ))}

          {unlocked &&
            personalSites.map((s) => (
              <a
                key={s.url}
                href={s.url}
                className="quick-nav-item quick-nav-item--personal"
              >
                {s.label}
                <span className="quick-nav-external">↗</span>
              </a>
            ))}
        </div>
      )}
    </div>
  );
}
