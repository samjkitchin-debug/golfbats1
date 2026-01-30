"use client";

import { useState, useEffect, useMemo } from "react";

const DEFAULT_EMPTY_HHMM = "08:00"; // 8:00 AM when value is empty

export type Period = "AM" | "PM";

export type PixelTimePickerProps = {
  /** 24h "HH:MM" or null/undefined for empty (defaults to 8:00 AM in UI). */
  valueHHMM?: string | null;
  onChangeHHMM: (hhmm: string) => void;
  defaultPeriod?: Period;
  minuteStep?: number;
  /** When true, do not render the "Set time" button (e.g. when used inside a modal with its own footer). */
  hideSetTimeButton?: boolean;
  /** Called whenever the current selection (hour/minute/period) changes, with 24h HH:MM. Use for modal draft sync. */
  onDraftChange?: (hhmm: string) => void;
};

/** Parse 24h HH:MM to { hour12, minute, period }. No Date, no locale. */
function hhmmTo12h(hhmm: string | null | undefined): { hour12: number; minute: number; period: Period } | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return null;
  const [hStr, mStr] = hhmm.trim().split(":");
  const h24 = parseInt(hStr!, 10);
  let minute = parseInt(mStr!, 10);
  if (Number.isNaN(h24) || Number.isNaN(minute)) return null;
  if (h24 < 0 || h24 > 23 || minute < 0 || minute > 59) return null;
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const period: Period = h24 >= 12 ? "PM" : "AM";
  return { hour12, minute, period };
}

/** Round minute to nearest step (e.g. 5 -> 0,5,10,...,55). */
function roundMinuteToStep(minute: number, step: number): number {
  const rounded = Math.round(minute / step) * step;
  return Math.min(55, Math.max(0, rounded));
}

/** 12h (hour12, minute, period) to 24h HH:MM. No Date, no locale. */
function toHHMM(hour12: number, minute: number, period: Period): string {
  let h24: number;
  if (period === "PM") {
    h24 = hour12 === 12 ? 12 : hour12 + 12;
  } else {
    h24 = hour12 === 12 ? 0 : hour12;
  }
  const mm = Math.min(59, Math.max(0, Math.round(minute)));
  return `${String(h24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Hour 1–12 to position index 0–11 (12 at top). */
function hourIdx(h: number): number {
  return h % 12;
}

/** Minute (0,5,…,55) to position index 0–11. */
function minuteIdx(m: number, step: number): number {
  return Math.round(m / step) % 12;
}

const FACE_SIZE = 280;
const FACE_CONTAINER_HEIGHT = 320;

/** ViewBox units (0 0 100 100) for single coordinate system. */
const CX = 50;
const CY = 50;
const R_RING = 42;   // numeral centres and puck centre
const R_OUTER = R_RING + 2; // faint face circle slightly outside ring
const HIT_R = 8;
const CENTRE_DOT_R = 1.6;
const PUCK_R = 6.8;
const ACCENT_OPACITY = 0.2; // hand and puck translucency

/** Position for idx 0..11 in viewBox; idx 0 = 12 o'clock, clockwise. */
function posInViewBox(idx: number, r: number = R_RING): { x: number; y: number } {
  const theta = (idx * Math.PI) / 6;
  return { x: CX + r * Math.sin(theta), y: CY - r * Math.cos(theta) };
}

export function PixelTimePicker({
  valueHHMM,
  onChangeHHMM,
  defaultPeriod = "AM",
  minuteStep = 5,
  hideSetTimeButton = false,
  onDraftChange,
}: PixelTimePickerProps) {
  const effectiveHHMM = valueHHMM?.trim() || DEFAULT_EMPTY_HHMM;
  const parsed = useMemo(() => hhmmTo12h(effectiveHHMM), [effectiveHHMM]);

  const [stage, setStage] = useState<"hour" | "minute">("hour");
  const [hour12, setHour12] = useState<number>(() => parsed?.hour12 ?? 8);
  const [minute, setMinute] = useState<number>(() =>
    parsed ? roundMinuteToStep(parsed.minute, minuteStep) : 0
  );
  const [period, setPeriod] = useState<Period>(() => parsed?.period ?? defaultPeriod);

  useEffect(() => {
    const p = hhmmTo12h(effectiveHHMM);
    if (p) {
      setHour12(p.hour12);
      setMinute(roundMinuteToStep(p.minute, minuteStep));
      setPeriod(p.period);
    } else {
      setHour12(8);
      setMinute(0);
      setPeriod(defaultPeriod);
    }
  }, [effectiveHHMM, minuteStep, defaultPeriod]);

  useEffect(() => {
    onDraftChange?.(toHHMM(hour12, minute, period));
  }, [hour12, minute, period, onDraftChange]);

  const handleSetTime = () => {
    const hhmm = toHHMM(hour12, minute, period);
    onChangeHHMM(hhmm);
  };

  const selectIdx = (idx: number) => {
    if (stage === "hour") {
      setHour12(idx === 0 ? 12 : idx);
      setStage("minute");
    } else {
      setMinute((idx * minuteStep) % 60);
    }
  };

  const idxSel = stage === "hour" ? hourIdx(hour12) : minuteIdx(minute, minuteStep);
  const thetaSel = (idxSel * Math.PI) / 6;
  const ux = Math.sin(thetaSel);
  const uy = -Math.cos(thetaSel);
  const puckX = CX + R_RING * ux;
  const puckY = CY + R_RING * uy;
  const handEndX = puckX - ux * PUCK_R;
  const handEndY = puckY - uy * PUCK_R;

  return (
    <div className="flex flex-col gap-4" style={{ minHeight: 360 }}>
      {/* Pixel header: hour tile | colon | minute tile | stacked AM/PM (larger, Pixel-like) */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setStage("hour")}
          className={`rounded-lg border px-5 py-3 text-3xl font-medium tabular-nums transition-colors ${
            stage === "hour"
              ? "border-anticipation bg-anticipation/10 text-foreground"
              : "border-border bg-surface text-foreground hover:bg-surface/80"
          }`}
          aria-pressed={stage === "hour"}
        >
          {String(hour12).padStart(2, "0")}
        </button>
        <span className="text-3xl font-medium text-foreground">:</span>
        <button
          type="button"
          onClick={() => setStage("minute")}
          className={`rounded-lg border px-5 py-3 text-3xl font-medium tabular-nums transition-colors ${
            stage === "minute"
              ? "border-anticipation bg-anticipation/10 text-foreground"
              : "border-border bg-surface text-foreground hover:bg-surface/80"
          }`}
          aria-pressed={stage === "minute"}
        >
          {String(minute).padStart(2, "0")}
        </button>
        <div className="ml-2 rounded-lg bg-surface/60 p-1 flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setPeriod("AM")}
            className={`w-full rounded px-3 py-2 text-sm font-medium transition-colors ${
              period === "AM" ? "text-foreground" : "bg-transparent text-muted hover:bg-surface/40"
            }`}
            style={period === "AM" ? { backgroundColor: "rgb(var(--anticipation) / 0.45)" } : undefined}
          >
            a.m.
          </button>
          <button
            type="button"
            onClick={() => setPeriod("PM")}
            className={`w-full rounded px-3 py-2 text-sm font-medium transition-colors ${
              period === "PM" ? "text-foreground" : "bg-transparent text-muted hover:bg-surface/40"
            }`}
            style={period === "PM" ? { backgroundColor: "rgb(var(--anticipation) / 0.45)" } : undefined}
          >
            p.m.
          </button>
        </div>
      </div>

      {/* Large clock face: fixed-height container so it does not overlap modal footer */}
      <div
        className="relative mx-auto flex items-center justify-center overflow-hidden"
        style={{ width: FACE_SIZE + 40, height: FACE_CONTAINER_HEIGHT }}
        aria-hidden
      >
        <div
          className="relative overflow-hidden rounded-full bg-surface border-2 border-border shadow-[var(--shadow-soft)] shadow-[var(--shadow-tight)]"
          style={{ width: FACE_SIZE, height: FACE_SIZE }}
          aria-label={stage === "hour" ? "Select hour" : "Select minutes"}
        >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          aria-label={stage === "hour" ? "Select hour" : "Select minutes"}
        >
          {/* Faint outer face circle (slightly outside numeral ring) */}
          <circle
            cx={CX}
            cy={CY}
            r={R_OUTER}
            fill="none"
            stroke="rgb(var(--foreground))"
            strokeOpacity={0.15}
            pointerEvents="none"
          />

          {/* Hand: thin translucent line from centre to puck edge (do not intercept clicks) */}
          <line
            x1={CX}
            y1={CY}
            x2={handEndX}
            y2={handEndY}
            stroke="rgb(var(--anticipation))"
            strokeOpacity={ACCENT_OPACITY}
            strokeWidth={1.2}
            strokeLinecap="round"
            pointerEvents="none"
          />

          {/* Centre dot above hand */}
          <circle
            cx={CX}
            cy={CY}
            r={CENTRE_DOT_R}
            fill="rgb(var(--foreground))"
            pointerEvents="none"
          />

          {/* Numeral labels: centred at ring positions (do not intercept clicks) */}
          {Array.from({ length: 12 }, (_, idx) => {
            const { x, y } = posInViewBox(idx);
            const label =
              stage === "hour"
                ? (idx === 0 ? 12 : idx)
                : String((idx * minuteStep) % 60).padStart(2, "0");
            const isHour = stage === "hour";
            return (
              <text
                key={idx}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={isHour ? 5.0 : 4.6}
                fontWeight={400}
                fill="rgb(var(--foreground))"
                opacity={0.72}
                className="select-none"
                pointerEvents="none"
              >
                {label}
              </text>
            );
          })}

          {/* Selection puck: centred on numeral ring, translucent, no outline (do not intercept clicks) */}
          <circle
            cx={puckX}
            cy={puckY}
            r={PUCK_R}
            fill="rgb(var(--anticipation))"
            fillOpacity={ACCENT_OPACITY}
            pointerEvents="none"
          />

          {/* Hit targets last: on top so they receive clicks */}
          {Array.from({ length: 12 }, (_, idx) => {
            const { x, y } = posInViewBox(idx);
            return (
              <circle
                key={idx}
                cx={x}
                cy={y}
                r={HIT_R}
                fill="transparent"
                pointerEvents="all"
                style={{ cursor: "pointer" }}
                onClick={() => selectIdx(idx)}
              />
            );
          })}
        </svg>
        </div>
      </div>

      {!hideSetTimeButton && (
        <button
          type="button"
          onClick={handleSetTime}
          className="rounded-xl btn-anticipation px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          Set time
        </button>
      )}
    </div>
  );
}
