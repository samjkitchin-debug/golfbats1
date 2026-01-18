"use client";

import { useState, useEffect, useRef } from "react";

type TimeDialPickerProps = {
  value: string; // "hh:mm" or ""
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
};

export function TimeDialPicker({ 
  value, 
  onChange, 
  onClear, 
  placeholder = "Time", 
  disabled = false 
}: TimeDialPickerProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [stage, setStage] = useState<"hour" | "minute">("hour");
  const dialRef = useRef<HTMLDivElement>(null);

  // Parse existing value
  const currentHour = value ? parseInt(value.split(":")[0], 10) : null;
  const currentMinute = value ? parseInt(value.split(":")[1], 10) : null;

  // Initialize from value if picker is opening
  const handleOpen = () => {
    if (value) {
      const [h, m] = value.split(":").map(Number);
      setSelectedHour(h);
      setSelectedMinute(m);
      setStage("minute");
    } else {
      setSelectedHour(null);
      setSelectedMinute(null);
      setStage("hour");
    }
    setShowPicker(true);
  };

  // Handle hour selection (12-hour format for dial)
  const handleHourSelect = (hour12: number) => {
    // Convert 12-hour to 24-hour for storage
    // Preserve AM/PM period from existing value or default to AM
    const wasPM = currentHour !== null && currentHour >= 12;
    
    let hour24: number;
    if (hour12 === 12) {
      hour24 = wasPM ? 12 : 0; // 12 PM or 12 AM
    } else {
      hour24 = wasPM ? hour12 + 12 : hour12; // PM hours or AM hours
    }
    
    setSelectedHour(hour24);
    setStage("minute");
  };

  // Handle minute selection
  const handleMinuteSelect = (minute: number) => {
    if (selectedHour !== null) {
      setSelectedMinute(minute);
      // Auto-confirm after minute selection
      const hh = String(selectedHour).padStart(2, "0");
      const mm = String(minute).padStart(2, "0");
      onChange(`${hh}:${mm}`);
      setShowPicker(false);
      setStage("hour");
      setSelectedHour(null);
      setSelectedMinute(null);
    }
  };

  const handleOK = () => {
    if (selectedHour !== null && selectedMinute !== null) {
      const hh = String(selectedHour).padStart(2, "0");
      const mm = String(selectedMinute).padStart(2, "0");
      onChange(`${hh}:${mm}`);
    }
    setShowPicker(false);
    setStage("hour");
    setSelectedHour(null);
    setSelectedMinute(null);
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    } else {
      onChange("");
    }
    setShowPicker(false);
    setStage("hour");
    setSelectedHour(null);
    setSelectedMinute(null);
  };

  const handleCancel = () => {
    setShowPicker(false);
    setStage("hour");
    // Reset to original values
    if (value) {
      const [h, m] = value.split(":").map(Number);
      setSelectedHour(h);
      setSelectedMinute(m);
    } else {
      setSelectedHour(null);
      setSelectedMinute(null);
    }
  };

  // Handle Escape key
  useEffect(() => {
    if (!showPicker) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showPicker, value]);

  // Format display value (12-hour format)
  const displayValue = value
    ? (() => {
        const [h, m] = value.split(":").map(Number);
        const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
        const period = h >= 12 ? "pm" : "am";
        return `${hour12}:${String(m).padStart(2, "0")}${period}`;
      })()
    : "";

  // Get current hour in 12-hour format for display
  const displayHour = selectedHour !== null 
    ? (selectedHour === 0 ? 12 : selectedHour > 12 ? selectedHour - 12 : selectedHour)
    : (currentHour !== null ? (currentHour === 0 ? 12 : currentHour > 12 ? currentHour - 12 : currentHour) : null);
  
  const isPM = selectedHour !== null 
    ? selectedHour >= 12
    : (currentHour !== null ? currentHour >= 12 : false);

  // Generate hour positions for 12-hour dial (like clock face)
  const hourPositions = [
    { num: 12, angle: 0 },
    { num: 1, angle: 30 },
    { num: 2, angle: 60 },
    { num: 3, angle: 90 },
    { num: 4, angle: 120 },
    { num: 5, angle: 150 },
    { num: 6, angle: 180 },
    { num: 7, angle: 210 },
    { num: 8, angle: 240 },
    { num: 9, angle: 270 },
    { num: 10, angle: 300 },
    { num: 11, angle: 330 },
  ];

  // Generate minute positions (5-minute intervals in a circle)
  const minutePositions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((min, idx) => ({
    num: min,
    angle: idx * 30, // 30 degrees per 5-minute interval
  }));

  // Calculate position on dial (radius ~100px from center)
  const getDialPosition = (angle: number) => {
    const radius = 100;
    const rad = (angle - 90) * (Math.PI / 180); // Start from top (12 o'clock)
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * radius;
    return { x, y };
  };

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
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCancel();
            }
          }}
        >
          <div 
            className="w-full max-w-sm rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {stage === "hour" ? "Select hour" : "Select minute"}
              </h3>
              <button
                type="button"
                onClick={handleCancel}
                className="text-muted hover:text-foreground"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Watch dial */}
            <div className="relative mx-auto mb-6" style={{ width: 240, height: 240 }}>
              <div 
                ref={dialRef}
                className="relative mx-auto rounded-full border-2 border-border"
                style={{ width: 240, height: 240 }}
              >
                {/* Hour dial */}
                {stage === "hour" && hourPositions.map(({ num, angle }) => {
                  const { x, y } = getDialPosition(angle);
                  const isSelected = displayHour === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleHourSelect(num)}
                      className={`absolute rounded-full text-sm font-medium transition-all ${
                        isSelected
                          ? "bg-anticipation text-anticipation-fg border-2 border-anticipation"
                          : "bg-surface text-foreground border border-border hover:bg-surface-2"
                      }`}
                      style={{
                        left: `calc(50% + ${x}px)`,
                        top: `calc(50% + ${y}px)`,
                        transform: "translate(-50%, -50%)",
                        width: 40,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {num}
                    </button>
                  );
                })}

                {/* Minute dial */}
                {stage === "minute" && minutePositions.map(({ num, angle }) => {
                  const { x, y } = getDialPosition(angle);
                  const isSelected = (selectedMinute ?? currentMinute) === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleMinuteSelect(num)}
                      className={`absolute rounded-full text-sm font-medium transition-all ${
                        isSelected
                          ? "bg-anticipation text-anticipation-fg border-2 border-anticipation"
                          : "bg-surface text-foreground border border-border hover:bg-surface-2"
                      }`}
                      style={{
                        left: `calc(50% + ${x}px)`,
                        top: `calc(50% + ${y}px)`,
                        transform: "translate(-50%, -50%)",
                        width: 40,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {String(num).padStart(2, "0")}
                    </button>
                  );
                })}

                {/* Center indicator */}
                <div 
                  className="absolute rounded-full bg-muted/20"
                  style={{
                    left: "50%",
                    top: "50%",
                    transform: "translate(-50%, -50%)",
                    width: 8,
                    height: 8,
                  }}
                />
              </div>
            </div>

            {/* Selected time display */}
            {(selectedHour !== null || currentHour !== null) && stage === "minute" && (
              <div className="mb-4 text-center">
                <div className="text-2xl font-semibold text-foreground">
                  {String(displayHour).padStart(2, "0")}:{String(selectedMinute ?? currentMinute ?? 0).padStart(2, "0")}
                </div>
                <div className="mt-1 text-sm text-muted">{isPM ? "PM" : "AM"}</div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleClear}
                className="flex-1 rounded-lg btn-ghost px-4 py-2 text-sm font-medium"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex-1 rounded-lg btn-ghost px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              {stage === "minute" && selectedHour !== null && selectedMinute !== null && (
                <button
                  type="button"
                  onClick={handleOK}
                  className="flex-1 rounded-lg btn-anticipation px-4 py-2 text-sm font-medium"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}