// useSceneTransition.ts

import { useEffect, useCallback, useRef } from "react";
import {
  useTransitionPhase,
  sceneReady,
  startTransition,
} from "./transitionStore";

/**
 * Hook for scene components to participate in cloud transitions.
 *
 * - Signals scene readiness (dismisses clouds) when `ready` becomes true
 * - Provides `navigateWithTransition` for triggering outbound transitions
 * - Returns `wrapStyle` for the entrance scale animation (1.15 → 1.0)
 */
export function useSceneTransition(ready: boolean) {
  const phase = useTransitionPhase();

  // Track whether this component mounted INTO a transition (arriving scene)
  // vs. already being mounted before one started (departing scene).
  const mountedDuringTransition = useRef(phase === "holding");

  // Reset after transition completes so subsequent transitions from
  // THIS scene don't accidentally apply the entrance animation.
  useEffect(() => {
    if (phase === "idle") {
      mountedDuringTransition.current = false;
    }
  }, [phase]);

  // Signal scene ready when camera is positioned and clouds are waiting.
  // Short delay ensures the user perceives full cloud coverage before reveal.
  useEffect(() => {
    if (ready && phase === "holding") {
      const timer = setTimeout(() => sceneReady(), 250);
      return () => clearTimeout(timer);
    }
  }, [ready, phase]);

  // Trigger a cloud transition to navigate away
  const navigateWithTransition = useCallback(
    (url: string, internal: boolean) => {
      startTransition(url, internal);
    },
    [],
  );

  // Entrance scale: pre-scale at 1.15 behind clouds, settle to 1.0 as clouds part
  const wrapStyle: React.CSSProperties = (() => {
    if (!mountedDuringTransition.current) return {};

    if (phase === "holding") {
      return { transform: "scale(1.15)" };
    }
    if (phase === "clouds-out") {
      return {
        transform: "scale(1)",
        transition: "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
      };
    }
    return {};
  })();

  return { navigateWithTransition, wrapStyle, phase };
}
