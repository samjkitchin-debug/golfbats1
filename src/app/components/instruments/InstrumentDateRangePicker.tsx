"use client";

import { useState } from "react";

type InstrumentDateRangePickerProps = {
  openLabel: string;
  closeLabel: string;
  openValueIso: string | null;
  closeValueIso: string | null;
  onSave: (next: { openIso: string | null; closeIso: string | null }) => Promise<void> | void;
  onCancel: () => void;
  isSaving?: boolean;
};

/**
 * Shared date range picker for instrument date editing.
 * Renders two date inputs (open and close) with Save/Cancel buttons.
 * No card container - designed for inline use within instruments.
 */
export function InstrumentDateRangePicker({
  openLabel,
  closeLabel,
  openValueIso,
  closeValueIso,
  onSave,
  onCancel,
  isSaving = false,
}: InstrumentDateRangePickerProps) {
  // Convert ISO to YYYY-MM-DD for date inputs
  const isoToYmd = (iso: string | null): string => {
    if (!iso) return "";
    const date = new Date(iso);
    // For open dates: 00:00 SGT is stored as 16:00 UTC on previous day
    // For close dates: 23:59 SGT is stored as 15:59 UTC on same day
    // Add 8 hours to get SGT time, then extract the date
    const sgtTime = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const year = sgtTime.getUTCFullYear();
    const month = String(sgtTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(sgtTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Convert YYYY-MM-DD to ISO (23:59 SGT for close, 00:00 SGT for open)
  const ymdToIso = (ymd: string, isClose: boolean): string => {
    if (!ymd) return "";
    const [year, month, day] = ymd.split('-').map(Number);
    if (isClose) {
      // 23:59:59 SGT = 15:59:59 UTC
      return new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999)).toISOString();
    } else {
      // 00:00:00 SGT = 16:00:00 UTC on the previous calendar day
      // Match computeSignupOpenAt logic
      const openDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      openDateObj.setUTCDate(openDateObj.getUTCDate() - 1);
      openDateObj.setUTCHours(16, 0, 0, 0);
      return openDateObj.toISOString();
    }
  };

  const [openYmd, setOpenYmd] = useState(isoToYmd(openValueIso));
  const [closeYmd, setCloseYmd] = useState(isoToYmd(closeValueIso));

  const handleSave = async () => {
    const openIso = openYmd ? ymdToIso(openYmd, false) : null;
    const closeIso = closeYmd ? ymdToIso(closeYmd, true) : null;
    await onSave({ openIso, closeIso });
  };

  return (
    <div className="mt-3 space-y-3">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">{openLabel}</label>
        <input
          type="date"
          value={openYmd}
          onChange={(e) => setOpenYmd(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">{closeLabel}</label>
        <input
          type="date"
          value={closeYmd}
          onChange={(e) => setCloseYmd(e.target.value)}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg bg-transparent border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !openYmd || !closeYmd}
          className="flex-1 rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
