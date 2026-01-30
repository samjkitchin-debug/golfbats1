"use client";

import { useState, useEffect, useCallback } from "react";
import { PixelTimePicker } from "./PixelTimePicker";

const DEFAULT_EMPTY_HHMM = "08:00";

export type TimePickerProps = {
  /** 24h "HH:MM" or null/undefined for empty. */
  valueHHMM?: string | null;
  onChangeHHMM: (hhmm: string) => void;
  label?: string;
  placeholder?: string;
  defaultPeriod?: "AM" | "PM";
  minuteStep?: number;
};

/** Format 24h HH:MM to 12h display e.g. "7:30 AM". No Date, no locale. */
function formatHHMMTo12h(hhmm: string | null | undefined): string {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm.trim())) return "";
  const [hStr, mStr] = hhmm.trim().split(":");
  const h24 = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  if (Number.isNaN(h24) || Number.isNaN(m)) return "";
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const period = h24 >= 12 ? "PM" : "AM";
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Single global time-picking component. Renders a field that opens a modal
 * with a clock-face picker. PixelTimePicker is internal; the app must only
 * import and use TimePicker.
 */
export function TimePicker({
  valueHHMM,
  onChangeHHMM,
  label = "Time",
  placeholder = "Select time",
  defaultPeriod = "AM",
  minuteStep = 5,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftHHMM, setDraftHHMM] = useState<string>(() => valueHHMM?.trim() || DEFAULT_EMPTY_HHMM);

  const displayValue = formatHHMMTo12h(valueHHMM ?? null);
  const hasValue = Boolean(valueHHMM?.trim() && /^\d{2}:\d{2}$/.test(valueHHMM!.trim()));

  useEffect(() => {
    if (open) {
      setDraftHHMM(valueHHMM?.trim() || DEFAULT_EMPTY_HHMM);
    }
  }, [open, valueHHMM]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  const handleBackdropClick = () => setOpen(false);

  const handleSetTime = () => {
    const hhmm = draftHHMM.trim() && /^\d{2}:\d{2}$/.test(draftHHMM.trim()) ? draftHHMM.trim()! : DEFAULT_EMPTY_HHMM;
    onChangeHHMM(hhmm);
    setOpen(false);
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        {label && (
          <label className="text-xs font-semibold text-foreground">{label}</label>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm text-foreground outline-none focus:border-foreground/30"
        >
          <span className={hasValue ? "text-foreground" : "text-muted"}>
            {hasValue ? displayValue : placeholder}
          </span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"
          onClick={handleBackdropClick}
          role="dialog"
          aria-modal="true"
          aria-label="Pick time"
        >
          <div
            className="w-full max-w-[360px] rounded-xl border border-border bg-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <PixelTimePicker
              valueHHMM={draftHHMM}
              onChangeHHMM={setDraftHHMM}
              defaultPeriod={defaultPeriod}
              minuteStep={minuteStep}
              hideSetTimeButton
              onDraftChange={setDraftHHMM}
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetTime}
                className="flex-1 rounded-xl btn-anticipation px-4 py-2 text-sm font-medium hover:opacity-90"
              >
                Set time
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
