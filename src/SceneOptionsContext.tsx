// SceneOptionsContext.tsx
//
// Per-zone user-facing toggles (rendered in the atmosphere cog panel).
// Components that provide toggle options (e.g. FlightPath) flip hasX flags so
// the panel knows whether to show the corresponding control.

import { createContext, useContext, useState, type ReactNode } from "react";

interface SceneOptionsState {
  allRangeMode: boolean;
  setAllRangeMode: (v: boolean) => void;
  hasFlightVariants: boolean;
  setHasFlightVariants: (v: boolean) => void;
}

const Ctx = createContext<SceneOptionsState | null>(null);

export function SceneOptionsProvider({ children }: { children: ReactNode }) {
  const [allRangeMode, setAllRangeMode] = useState(true);
  const [hasFlightVariants, setHasFlightVariants] = useState(false);
  return (
    <Ctx.Provider
      value={{
        allRangeMode,
        setAllRangeMode,
        hasFlightVariants,
        setHasFlightVariants,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * Read scene options. Returns no-op defaults if no provider is in the tree, so
 * consumers (like AtmospherePanel) don't blow up outside a zone.
 */
export function useSceneOptions(): SceneOptionsState {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  return {
    allRangeMode: true,
    setAllRangeMode: () => {},
    hasFlightVariants: false,
    setHasFlightVariants: () => {},
  };
}
