"use client";

import { useState, useEffect, useRef, useMemo } from "react";

type InlineScrollableCalendarProps = {
  value: string | null; // YYYY-MM-DD
  onChange: (nextYYYYMMDD: string) => void;
  todayYYYYMMDD: string; // YYYY-MM-DD
};

type MonthData = {
  year: number;
  month: number; // 0-indexed
  monthKey: string; // YYYY-MM for unique key
  days: Array<{
    date: number;
    dateStr: string; // YYYY-MM-DD
    isCurrentMonth: boolean;
    isPast: boolean;
    isToday: boolean;
  }>;
};

function generateMonthData(year: number, month: number, todayYYYYMMDD: string): MonthData {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const mondayFirstDay = (startingDayOfWeek + 6) % 7; // Convert to Monday-first

  const days: MonthData["days"] = [];

  // Previous month's trailing days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = mondayFirstDay - 1; i >= 0; i--) {
    const date = prevMonthLastDay - i;
    const dateObj = new Date(year, month - 1, date);
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    days.push({
      date,
      dateStr,
      isCurrentMonth: false,
      isPast: dateStr < todayYYYYMMDD,
      isToday: dateStr === todayYYYYMMDD,
    });
  }

  // Current month's days
  for (let date = 1; date <= daysInMonth; date++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    days.push({
      date,
      dateStr,
      isCurrentMonth: true,
      isPast: dateStr < todayYYYYMMDD,
      isToday: dateStr === todayYYYYMMDD,
    });
  }

  // Next month's leading days to fill 6 rows (42 cells)
  const remainingCells = 42 - days.length;
  for (let date = 1; date <= remainingCells; date++) {
    const dateObj = new Date(year, month + 1, date);
    const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
    days.push({
      date,
      dateStr,
      isCurrentMonth: false,
      isPast: dateStr < todayYYYYMMDD,
      isToday: dateStr === todayYYYYMMDD,
    });
  }

  return {
    year,
    month,
    monthKey: `${year}-${String(month + 1).padStart(2, "0")}`,
    days,
  };
}

export function InlineScrollableCalendar({
  value,
  onChange,
  todayYYYYMMDD,
}: InlineScrollableCalendarProps) {
  // Determine current month from value or today
  const currentDate = value || todayYYYYMMDD;
  const [currentYear, currentMonth] = currentDate.split("-").map(Number);
  const currentMonthIndex = currentMonth - 1; // Convert to 0-indexed

  // State for the 3-month window [prev, current, next]
  const [centerYear, setCenterYear] = useState(currentYear);
  const [centerMonth, setCenterMonth] = useState(currentMonthIndex);

  // Update center when value changes externally
  useEffect(() => {
    const dateToUse = value || todayYYYYMMDD;
    const [y, m] = dateToUse.split("-").map(Number);
    const newMonthIndex = m - 1;
    const newCenterKey = `${y}-${String(m).padStart(2, "0")}`;
    
    // Only update if different to avoid unnecessary re-renders
    if (centerYear !== y || centerMonth !== newMonthIndex) {
      setCenterYear(y);
      setCenterMonth(newMonthIndex);
      setCenteredMonthKey(newCenterKey);
    }
  }, [value, todayYYYYMMDD, centerYear, centerMonth]);

  // Generate months: show 1 previous month and 11 future months (12 months total)
  const months = useMemo(() => {
    const monthsList: MonthData[] = [];
    
    // Add previous month
    const prevMonthDate = new Date(centerYear, centerMonth - 1, 1);
    monthsList.push(
      generateMonthData(
        prevMonthDate.getFullYear(),
        prevMonthDate.getMonth(),
        todayYYYYMMDD
      )
    );
    
    // Add current month
    monthsList.push(
      generateMonthData(centerYear, centerMonth, todayYYYYMMDD)
    );
    
    // Add next 10 months (total 12 months ahead)
    for (let i = 1; i <= 10; i++) {
      const nextMonthDate = new Date(centerYear, centerMonth + i, 1);
      monthsList.push(
        generateMonthData(
          nextMonthDate.getFullYear(),
          nextMonthDate.getMonth(),
          todayYYYYMMDD
        )
      );
    }
    
    return monthsList;
  }, [centerYear, centerMonth, todayYYYYMMDD]);

  // Scroll container ref
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Track which month is centered based on scroll position
  // Initialize to the middle month (current month)
  const [centeredMonthKey, setCenteredMonthKey] = useState(() => {
    const dateToUse = value || todayYYYYMMDD;
    const [y, m] = dateToUse.split("-").map(Number);
    return `${y}-${String(m).padStart(2, "0")}`;
  });

  // Update centered month key when center month changes externally (value prop change)
  useEffect(() => {
    const newCenterKey = months[1].monthKey;
    // Only update if the current centered month is not in the months array
    // This handles external value changes without interfering with scroll detection
    const currentCenterIndex = months.findIndex((m) => m.monthKey === centeredMonthKey);
    if (currentCenterIndex === -1 && newCenterKey !== centeredMonthKey) {
      setCenteredMonthKey(newCenterKey);
    }
  }, [months, centeredMonthKey]);

  // Handle scroll to detect month changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const containerRect = container.getBoundingClientRect();
      const containerCenter = containerRect.top + containerRect.height / 2;

      // Find which month is closest to center
      type ClosestMonth = { key: string; distance: number };
      let closestMonth: ClosestMonth | null = null;

      for (const [monthKey, element] of monthRefs.current.entries()) {
        const rect = element.getBoundingClientRect();
        const monthCenter = rect.top + rect.height / 2;
        const distance = Math.abs(containerCenter - monthCenter);

        if (!closestMonth || distance < closestMonth.distance) {
          closestMonth = { key: monthKey, distance };
        }
      }

      if (closestMonth && closestMonth.key !== centeredMonthKey) {
        setCenteredMonthKey(closestMonth.key);
        // No need to shift window since we have 12 months loaded
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [centerYear, centerMonth, centeredMonthKey, months]);

  // Set month refs
  const setMonthRef = (monthKey: string, element: HTMLDivElement | null) => {
    if (element) {
      monthRefs.current.set(monthKey, element);
    } else {
      monthRefs.current.delete(monthKey);
    }
  };

  // Format month header
  const formatMonthHeader = (year: number, month: number): string => {
    return new Date(year, month, 1).toLocaleDateString("en-SG", {
      month: "long",
      year: "numeric",
    });
  };

  // Get centered month header text
  const centeredMonthHeader = useMemo(() => {
    const centeredMonth = months.find((m) => m.monthKey === centeredMonthKey);
    if (centeredMonth) {
      return formatMonthHeader(centeredMonth.year, centeredMonth.month);
    }
    return formatMonthHeader(centerYear, centerMonth);
  }, [centeredMonthKey, months, centerYear, centerMonth]);

  // Format selected date for echo line
  const selectedDateFormatted = useMemo(() => {
    if (!value) return null;
    return new Date(value + "T00:00:00").toLocaleDateString("en-SG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [value]);

  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Handle date click
  const handleDateClick = (dateStr: string, isPast: boolean, isToday: boolean) => {
    if (!isPast || isToday) {
      onChange(dateStr);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Sticky month header */}
      <div className="sticky top-0 z-10 bg-surface border-b border-border py-1.5 mb-1">
        <div className="text-base font-semibold text-foreground text-center">
          {centeredMonthHeader}
        </div>
      </div>

      {/* Weekday labels - shown once at top */}
      <div className="grid grid-cols-7 gap-1 mb-1 px-0">
        {weekdayLabels.map((day) => (
          <div
            key={day}
            className="text-center text-xs font-medium text-muted py-0.5"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Scrollable calendar container */}
      <div
        ref={scrollContainerRef}
        className="overflow-y-auto"
        style={{
          maxHeight: "280px",
          scrollSnapType: "y mandatory",
          scrollPaddingTop: "40px", // Account for sticky header height (reduced)
          paddingTop: "40px", // Ensure first month isn't covered by sticky header
        }}
      >
        {months.map((monthData) => (
          <div
            key={monthData.monthKey}
            ref={(el) => setMonthRef(monthData.monthKey, el)}
            className="mb-4"
            style={{ scrollSnapAlign: "start" }}
          >
            {/* Month title (visually hidden since sticky header shows it) */}
            <div className="sr-only">
              {formatMonthHeader(monthData.year, monthData.month)}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {monthData.days.map((day, index) => {
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
                      ${
                        day.isPast && day.isCurrentMonth && !day.isToday
                          ? "text-muted opacity-50 cursor-not-allowed"
                          : ""
                      }
                      ${
                        (!day.isPast || day.isToday) && day.isCurrentMonth
                          ? "text-foreground hover:bg-muted/30 cursor-pointer"
                          : ""
                      }
                      ${isSelected ? "bg-foreground text-surface" : ""}
                      ${day.isToday && !isSelected ? "ring-2 ring-foreground/20" : ""}
                    `}
                  >
                    {day.date}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Echo line */}
      {selectedDateFormatted && (
        <div className="mt-2 pt-2 border-t border-border">
          <div className="text-xs text-muted">Selected:</div>
          <div className="text-sm font-semibold text-foreground mt-0.5">
            {selectedDateFormatted}
          </div>
        </div>
      )}
    </div>
  );
}
