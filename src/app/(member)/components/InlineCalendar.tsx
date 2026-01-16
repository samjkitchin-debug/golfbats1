"use client";

import { useState, useEffect, useMemo } from "react";
import { todayInSGT } from "../../lib/tripDates";

type InlineCalendarProps = {
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void; // YYYY-MM-DD
};

export function InlineCalendar({ value, onChange }: InlineCalendarProps) {
  // Memoize todaySGT to avoid recalculating on every render
  const todaySGT = useMemo(() => todayInSGT(), []);
  
  // Parse current value or default to today
  const currentDate = value && value.trim() ? value : todaySGT;
  const [year, month] = currentDate.split("-").map(Number);
  
  // State for the month being viewed
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month - 1); // 0-indexed

  // Update view when value changes externally (e.g., when entering Q1)
  useEffect(() => {
    const dateToUse = value && value.trim() ? value : todaySGT;
    const [y, m] = dateToUse.split("-").map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  }, [value, todaySGT]);

  // Get first day of month and number of days
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Convert to Monday-first week (0 = Monday, 6 = Sunday)
  const mondayFirstDay = (startingDayOfWeek + 6) % 7;

  // Generate calendar grid
  const calendarDays: Array<{ date: number; dateStr: string; isCurrentMonth: boolean; isPast: boolean; isToday: boolean }> = [];
  
  // Previous month's trailing days
  const prevMonthLastDay = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = mondayFirstDay - 1; i >= 0; i--) {
    const date = prevMonthLastDay - i;
    const dateObj = new Date(viewYear, viewMonth - 1, date);
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    calendarDays.push({
      date,
      dateStr,
      isCurrentMonth: false,
      isPast: dateStr < todaySGT,
      isToday: dateStr === todaySGT,
    });
  }

  // Current month's days
  for (let date = 1; date <= daysInMonth; date++) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    calendarDays.push({
      date,
      dateStr,
      isCurrentMonth: true,
      isPast: dateStr < todaySGT,
      isToday: dateStr === todaySGT,
    });
  }

  // Next month's leading days to fill 6 rows (42 cells)
  const remainingCells = 42 - calendarDays.length;
  for (let date = 1; date <= remainingCells; date++) {
    const dateObj = new Date(viewYear, viewMonth + 1, date);
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    calendarDays.push({
      date,
      dateStr,
      isCurrentMonth: false,
      isPast: dateStr < todaySGT,
      isToday: dateStr === todaySGT,
    });
  }

  // Month navigation
  const handlePreviousMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Handle date selection
  const handleDateClick = (dateStr: string, isPast: boolean, isToday: boolean) => {
    // Allow selection if not past (today is not past, so it's clickable)
    if (!isPast || isToday) {
      onChange(dateStr);
    }
  };

  // Format month header
  const monthHeader = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-SG", {
    month: "long",
    year: "numeric",
  });

  // Format selected date for echo line
  const selectedDateFormatted = value
    ? new Date(value + "T00:00:00").toLocaleDateString("en-SG", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div>
      {/* Month header with navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handlePreviousMonth}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50 active:scale-[0.98] transition-all"
        >
          Previous
        </button>
        <div className="text-base font-semibold text-foreground">{monthHeader}</div>
        <button
          onClick={handleNextMonth}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted/50 active:scale-[0.98] transition-all"
        >
          Next
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekdayLabels.map((day) => (
          <div key={day} className="text-center text-xs font-medium text-muted py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          const isSelected = day.dateStr === value;
          const isClickable = !day.isPast || day.isToday;

          return (
            <button
              key={`${day.dateStr}-${index}`}
              onClick={() => handleDateClick(day.dateStr, day.isPast, day.isToday)}
              disabled={!isClickable && !day.isToday}
              className={`
                aspect-square rounded-lg text-sm font-medium transition-all
                ${!day.isCurrentMonth ? "text-muted opacity-40" : ""}
                ${day.isPast && day.isCurrentMonth && !day.isToday ? "text-muted opacity-50 cursor-not-allowed" : ""}
                ${(!day.isPast || day.isToday) && day.isCurrentMonth ? "text-foreground hover:bg-muted/30 cursor-pointer" : ""}
                ${isSelected ? "bg-foreground text-surface" : ""}
                ${day.isToday && !isSelected ? "ring-2 ring-foreground/20" : ""}
              `}
            >
              {day.date}
            </button>
          );
        })}
      </div>

      {/* Echo line */}
      {selectedDateFormatted && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="text-xs text-muted">Selected:</div>
          <div className="text-base font-semibold text-foreground mt-0.5">{selectedDateFormatted}</div>
        </div>
      )}
    </div>
  );
}
