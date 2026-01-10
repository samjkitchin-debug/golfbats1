import type { AttendanceStatus } from "../lib/tripActions";

type TripRsvpActionsProps = {
  status?: AttendanceStatus | undefined;
  onJoin?: () => void;
  onLeave?: () => void;
  joinDisabled?: boolean;
  leaveDisabled?: boolean;
  showJoin?: boolean; // Controls if Join button should be visible (e.g., trip is open and not scheduled)
  showMicrocopy?: boolean; // Show optional muted microcopy "You're on the attendee list" (only if space allows, e.g., Trip Details page)
  className?: string; // Optional className for the container
};

export function TripRsvpActions({
  status,
  onJoin,
  onLeave,
  joinDisabled = false,
  leaveDisabled = false,
  showJoin = true,
  showMicrocopy = false,
  className = "",
}: TripRsvpActionsProps) {
  const isConfirmed = status === "confirmed";

  if (isConfirmed) {
    // User is IN (confirmed): Show Confirmed pill + I'm out button (if onLeave provided)
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-brand-green/10 border border-brand-green/30 px-3 py-1.5">
            <svg
              className="h-4 w-4 text-brand-green"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-sm font-medium text-brand-green">Confirmed</span>
          </div>
          {onLeave && (
            <button
              onClick={onLeave}
              disabled={leaveDisabled}
              className={`shrink-0 rounded border px-3 py-1.5 text-sm font-medium ${
                leaveDisabled
                  ? "border-border bg-background text-muted cursor-not-allowed"
                  : "border-brand-green bg-surface text-brand-green hover:bg-brand-green/5"
              }`}
            >
              I'm out
            </button>
          )}
        </div>
        {showMicrocopy && (
          <div className="mt-2 text-xs text-muted">You're on the attendee list</div>
        )}
      </div>
    );
  }

  // User is NOT IN: Show primary Join button (if onJoin provided and showJoin is true)
  if (!showJoin || !onJoin) {
    return null;
  }

  return (
    <div className={className}>
      <button
        onClick={onJoin}
        disabled={joinDisabled}
        className={`w-full rounded px-4 py-2 text-sm font-medium text-white ${
          joinDisabled
            ? "bg-border text-muted cursor-not-allowed"
            : "bg-brand-green hover:opacity-90"
        }`}
      >
        Join
      </button>
    </div>
  );
}
