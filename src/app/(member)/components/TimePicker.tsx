"use client";

import { useState } from "react";

type TimePickerProps = {
  value: string; // "hh:mm" or ""
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function TimePicker({ value, onChange, placeholder = "Time", disabled = false }: TimePickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [stage, setStage] = useState<"hour" | "minute">("hour");

  // Parse existing value
  const currentHour = value ? parseInt(value.split(":")[0], 10) : null;
  const currentMinute = value ? parseInt(value.split(":")[1], 10) : null;

  // Initialize from value if picker is opening
  const handleOpen = () => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      setSelectedHour(h);
      setStage("minute");
    } else {
      setSelectedHour(null);
      setStage("hour");
    }
    setShowPicker(true);
  };

  const handleHourSelect = (hour: number) => {
    setSelectedHour(hour);
    setStage("minute");
  };

  const handleMinuteSelect = (minute: number) => {
    if (selectedHour !== null) {
      const hh = String(selectedHour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      onChange(`${hh}:${mm}`);
      setShowPicker(false);
      setStage("hour");
      setSelectedHour(null);
    }
  };

  const handleClear = () => {
    onChange("");
    setShowPicker(false);
    setStage("hour");
    setSelectedHour(null);
  };

  const handleCancel = () => {
    setShowPicker(false);
    setStage("hour");
    setSelectedHour(null);
  };

  // Format display value
  const displayValue = value
    ? (() => {
        const [h, m] = value.split(":").map(Number);
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const period = h >= 12 ? "pm" : "am";
        return `${hour12}:${String(m).padStart(2, "0")}${period}`;
      })()
    : "";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        className={`w-full rounded-xl border border-border px-3 py-2 text-sm text-left outline-none focus:border-foreground/30 ${
          disabled
            ? "bg-muted cursor-not-allowed text-muted"
            : "bg-surface text-foreground hover:border-foreground/20 cursor-pointer"
        }`}
      >
        {displayValue || <span className="text-muted">{placeholder}</span>}
      </button>

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {stage === "hour" ? "Select hour" : "Select minute"}
              </h3>
              <button
                type="button"
                onClick={handleCancel}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {stage === "hour" ? (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {Array.from({ length: 24 }, (_, i) => i).map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    onClick={() => handleHourSelect(hour)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      selectedHour === hour || currentHour === hour
                        ? "border-foreground/30 bg-muted/20 text-foreground"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    {String(hour).padStart(2, "0")}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((minute) => (
                  <button
                    key={minute}
                    type="button"
                    onClick={() => handleMinuteSelect(minute)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      currentMinute === minute
                        ? "border-foreground/30 bg-muted/20 text-foreground"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    {String(minute).padStart(2, "0")}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
