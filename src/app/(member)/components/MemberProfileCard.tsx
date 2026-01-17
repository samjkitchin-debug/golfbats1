"use client";

import { useEffect } from "react";

type Member = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  profile_photo_path: string | null;
  created_at: string;
  last_seen: string | null;
};

type MemberProfileCardProps = {
  member: Member | null;
  onClose: () => void;
};

export default function MemberProfileCard({ member, onClose }: MemberProfileCardProps) {
  // Handle ESC key
  useEffect(() => {
    if (!member) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [member, onClose]);

  if (!member) return null;

  const displayName = member.display_name || member.full_name || "—";
  const photoUrl = member.profile_photo_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: "var(--overlay-scrim)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-surface rounded-xl border border-border shadow-lg max-w-md w-full max-h-[80vh] overflow-y-auto pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">{displayName}</h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="px-5 py-4 space-y-4">
            {/* Photo */}
            {photoUrl ? (
              <div className="flex justify-center">
                <img
                  src={photoUrl}
                  alt={displayName}
                  className="h-24 w-24 rounded-full object-cover border border-border"
                />
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="h-24 w-24 rounded-full bg-background border border-border flex items-center justify-center text-2xl font-medium text-muted">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              </div>
            )}

            {/* Handicap */}
            {member.declared_handicap !== null && member.declared_handicap !== undefined && (
              <div className="text-sm">
                <span className="text-secondary">Handicap index: </span>
                <span className="text-foreground font-medium">{member.declared_handicap}</span>
              </div>
            )}

            {/* Nationality */}
            {member.nationality && (
              <div className="text-sm">
                <span className="text-secondary">Nationality: </span>
                <span className="text-foreground">{member.nationality}</span>
              </div>
            )}

            {/* Footer note */}
            <div className="pt-4 border-t border-border">
              <p className="text-xs text-muted text-center">
                Profile details are set by the member.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
