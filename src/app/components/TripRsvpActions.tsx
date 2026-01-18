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
  neutralLeaveButton?: boolean; // If true, "Can't make it" button uses neutral styling instead of green
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
  neutralLeaveButton = false,
}: TripRsvpActionsProps) {
  const isConfirmed = status === "confirmed";

  if (isConfirmed) {
    // User is IN (confirmed): Show Confirmed pill + I'm out button (if onLeave provided)
    return (
      <div className={className}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-anticipation/10 border border-anticipation/30 px-3 py-1.5">
            <svg
              className="h-4 w-4 text-anticipation"
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
            <span className="text-sm font-medium text-anticipation">Confirmed</span>
          </div>
          {onLeave && (
            <button
              onClick={onLeave}
              disabled={leaveDisabled}
              className={`shrink-0 rounded border px-3 py-1.5 text-sm font-medium ${
                leaveDisabled
                  ? "border-border bg-background text-muted cursor-not-allowed"
                  : neutralLeaveButton
                  ? "border-border bg-transparent text-foreground hover:bg-surface"
                  : "border-anticipation bg-surface text-anticipation hover:bg-anticipation/5"
              }`}
            >
              Can't make it
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
        className={`w-full rounded px-4 py-2 text-sm font-medium ${
          joinDisabled
            ? "bg-border text-muted cursor-not-allowed"
            : "btn-primary hover:opacity-90"
        }`}
      >
        Join
      </button>
    </div>
  );
}
