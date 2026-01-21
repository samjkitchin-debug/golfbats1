/**
 * Role Engine
 * 
 * Centralized role resolution and capability checks for trip viewers.
 */

import type { Trip } from "../../tripActions";

export type ViewerRole = "host" | "admin" | "member" | "unknown";

export type Capability =
  | "basecamp.view"
  | "trip.edit"
  | "signups.manage"
  | "meet_details.edit"
  | "travel_outline.edit"
  | "travel_docs_requirement.toggle"
  | "export_docs.view"
  | "export_pack.build";

/**
 * Resolve the viewer's role based on trip context and admin status.
 * 
 * Rules:
 * - if no currentMemberId => "unknown"
 * - if isGroupAdmin => "admin"
 * - else if trip.createdByMemberId === currentMemberId OR trip.created_by_member_id === currentMemberId OR trip.hostMemberId === currentMemberId => "host"
 * - else => "member"
 */
export function resolveViewerRole(args: {
  currentMemberId: string | null;
  trip: Trip;
  isGroupAdmin: boolean;
}): ViewerRole {
  const { currentMemberId, trip, isGroupAdmin } = args;

  if (!currentMemberId) {
    return "unknown";
  }

  if (isGroupAdmin) {
    return "admin";
  }

  // Check host fields in order of preference
  if (trip.createdByMemberId === currentMemberId) return "host";
  if ((trip as any).created_by_member_id === currentMemberId) return "host";
  if ((trip as any).hostMemberId === currentMemberId) return "host";
  if ((trip as any).host_member_id === currentMemberId) return "host";

  return "member";
}

/**
 * Check if a role has a specific capability.
 * 
 * Rules:
 * - "unknown" => always false
 * - "host" and "admin" can all edit/manage/build capabilities above
 * - "member" can only view export docs (if allowed elsewhere) and non-basecamp read-only
 */
export function can(role: ViewerRole, cap: Capability): boolean {
  if (role === "unknown") {
    return false;
  }

  // Host and admin have all capabilities
  if (role === "host" || role === "admin") {
    return true;
  }

  // Member capabilities (limited)
  if (role === "member") {
    // Members can view export docs (but not build export pack)
    if (cap === "export_docs.view") {
      return true;
    }
    // All other capabilities require host/admin
    return false;
  }

  return false;
}
