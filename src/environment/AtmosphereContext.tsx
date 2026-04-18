// environment/AtmosphereContext.tsx
//
// Holds continuous time state (hour+minute) + weather + timescale.
// A single rAF loop advances the clock when timescale > 0 so subsystems
// and the panel share one animated source of truth.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  resolveAtmosphere,
  type AtmosphereParams,
  type Weather,
} from "./presets";

interface AtmosphereContextValue {
  /** 0..23 */
  hour: number;
  /** 0..59 */
  minute: number;
  /** Real-second → game-minute multiplier. 0 = paused. 60 ≈ 1 game-min / real-sec. */
  timescale: number;
  weather: Weather;
  setHour: (h: number) => void;
  setMinute: (m: number) => void;
  setTimescale: (ts: number) => void;
  setWeather: (w: Weather) => void;
  /** Decimal hour (hour + minute/60) — useful for panel displays and derived math. */
  hourDecimal: number;
  params: AtmosphereParams;
}

const AtmosphereContext = createContext<AtmosphereContextValue | null>(null);

interface ProviderProps {
  initialHour?: number;
  initialMinute?: number;
  initialWeather?: Weather;
  initialTimescale?: number;
  children: ReactNode;
}

export function AtmosphereProvider({
  initialHour = 12,
  initialMinute = 0,
  initialWeather = "clear",
  initialTimescale = 0,
  children,
}: ProviderProps) {
  const [hour, setHourState] = useState(initialHour);
  const [minute, setMinuteState] = useState(initialMinute);
  const [timescale, setTimescale] = useState(initialTimescale);
  const [weather, setWeather] = useState<Weather>(initialWeather);

  // rAF loop advances time when timescale > 0. Ref-based so we don't tear
  // down the animation every tick.
  const clockRef = useRef({ hour, minute });
  clockRef.current.hour = hour;
  clockRef.current.minute = minute;

  const tsRef = useRef(timescale);
  tsRef.current = timescale;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const ts = tsRef.current;
      if (ts > 0) {
        // game-minutes advanced this real-second = ts; over dt seconds:
        const deltaMin = ts * dt;
        const total =
          clockRef.current.hour * 60 + clockRef.current.minute + deltaMin;
        const wrapped = ((total % 1440) + 1440) % 1440;
        const newHour = Math.floor(wrapped / 60);
        const newMin = Math.floor(wrapped % 60);
        if (
          newHour !== clockRef.current.hour ||
          newMin !== clockRef.current.minute
        ) {
          clockRef.current.hour = newHour;
          clockRef.current.minute = newMin;
          setHourState(newHour);
          setMinuteState(newMin);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const setHour = useCallback((h: number) => {
    const clamped = Math.max(0, Math.min(23, Math.round(h)));
    setHourState(clamped);
  }, []);
  const setMinute = useCallback((m: number) => {
    const clamped = Math.max(0, Math.min(59, Math.round(m)));
    setMinuteState(clamped);
  }, []);

  const hourDecimal = hour + minute / 60;
  const params = useMemo(
    () => resolveAtmosphere(hourDecimal, weather),
    [hourDecimal, weather],
  );

  const value = useMemo<AtmosphereContextValue>(
    () => ({
      hour,
      minute,
      timescale,
      weather,
      setHour,
      setMinute,
      setTimescale,
      setWeather,
      hourDecimal,
      params,
    }),
    [hour, minute, timescale, weather, setHour, setMinute, hourDecimal, params],
  );

  return (
    <AtmosphereContext.Provider value={value}>
      {children}
    </AtmosphereContext.Provider>
  );
}

export function useAtmosphere() {
  const ctx = useContext(AtmosphereContext);
  if (!ctx) {
    throw new Error("useAtmosphere must be used within an AtmosphereProvider");
  }
  return ctx;
}
