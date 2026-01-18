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

function getFlagForNationality(nationality: string | null): string | null {
  if (!nationality) return null;
  const n = nationality.toLowerCase();

  if (n.includes("australia") || n.startsWith("au ")) return "🇦🇺";
  if (n.includes("british") || n === "uk" || n.includes("united kingdom")) return "🇬🇧";
  if (n.includes("english") || n === "england") return "🏴";
  if (n.includes("scotland") || n.includes("scottish")) return "🏴";
  if (n.includes("wales") || n.includes("welsh")) return "🏴";
  if (n.includes("singapore")) return "🇸🇬";
  if (n.includes("ireland") || n.includes("irish")) return "🇮🇪";
  if (n.includes("usa") || n.includes("united states") || n.includes("american")) return "🇺🇸";
  if (n.includes("canada") || n.includes("canadian")) return "🇨🇦";
  if (n.includes("new zealand") || n.includes("kiwi")) return "🇳🇿";
  if (n.includes("argentina")) return "🇦🇷";
  if (n.includes("belarus")) return "🇧🇾";

  return null;
}

type MemberProfileCardProps = {
  member: Member | null;
  onClose: () => void;
  adminMode?: boolean;
  isAdminOfSelectedGroup?: boolean;
  selectedGroupId?: string | null;
  memberships?: Array<{ userId: string; status: string; role: string }>;
  changingRole?: string | null;
  processingAction?: { userId: string; action: string } | null;
  currentUserId?: string | null;
  onSetRole?: (userId: string, role: "admin" | "member") => void;
  onRemoveMember?: (member: Member) => void;
};

export default function MemberProfileCard({
  member,
  onClose,
  adminMode = false,
  isAdminOfSelectedGroup = false,
  selectedGroupId = null,
  memberships = [],
  changingRole = null,
  processingAction = null,
  currentUserId = null,
  onSetRole,
  onRemoveMember,
}: MemberProfileCardProps) {
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
          <div className="sticky top-0 bg-surface border-b border-border px-5 py-4 flex items-center gap-3">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="h-10 w-10 rounded-full object-cover border border-border flex-shrink-0"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-background border border-border flex items-center justify-center text-sm font-medium text-muted flex-shrink-0">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <h2 className="text-lg font-semibold text-foreground flex-1 truncate">
              {member.full_name || displayName}
            </h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-foreground transition-colors flex-shrink-0"
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
            {/* Nationality and Handicap row */}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const flag = getFlagForNationality(member.nationality);
                return member.nationality ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-surface text-xs font-medium text-foreground">
                    {flag && <span className="text-base">{flag}</span>}
                    <span>{member.nationality}</span>
                  </span>
                ) : null;
              })()}
              {member.declared_handicap !== null && member.declared_handicap !== undefined ? (
                <div className="member-chip flex flex-col items-center justify-center">
                  <span className="text-[10px] font-medium text-secondary uppercase tracking-wide leading-tight">
                    HCP
                  </span>
                  <span className="text-sm font-semibold text-primary leading-tight">
                    {member.declared_handicap}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted">Handicap not set yet.</span>
              )}
            </div>

            {/* Admin Tools Section */}
            {adminMode && isAdminOfSelectedGroup && selectedGroupId !== "all" && onSetRole && onRemoveMember && (() => {
              const membership = memberships.find((m) => m.userId === member.id && m.status === "approved");
              const currentRole = membership?.role || "member";
              const isChanging = changingRole === member.id;
              const isProcessing = processingAction?.userId === member.id;
              const canRemove = currentUserId !== member.id;

              return (
                <div className="pt-4 border-t border-border space-y-4">
                  <h3 className="text-sm font-semibold text-foreground">Admin tools</h3>
                  
                  {/* Role subsection */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-secondary uppercase tracking-wide">
                      Role
                    </label>
                    <select
                      value={currentRole}
                      onChange={(e) => {
                        const newRole = e.target.value as "admin" | "member";
                        onSetRole(member.id, newRole);
                      }}
                      disabled={isChanging}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground disabled:opacity-50"
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                    <p className="text-xs text-muted">
                      Admins can manage group members and settings.
                    </p>
                  </div>

                  {/* Membership subsection */}
                  {canRemove && (
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-secondary uppercase tracking-wide">
                        Membership
                      </label>
                      <button
                        onClick={() => onRemoveMember(member)}
                        disabled={isProcessing}
                        className="w-full rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/15 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isProcessing ? "Removing..." : "Remove from group"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </>
  );
}
