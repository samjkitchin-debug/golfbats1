/**
 * Shared server-side authentication and authorization helpers.
 * Ensures consistent auth.uid -> member.id mapping and group membership checks.
 */

import { createSupabaseServerClient } from "./supabaseServer";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Requires an authenticated user.
 * Returns user ID or throws guidance for 401 response.
 */
export async function requireAuthedUser(): Promise<{ userId: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED"); // Signal for 401 response
  }

  return { userId: user.id };
}

/**
 * Resolves member ID for a given user ID.
 * Uses canonical mapping: members.id == auth.uid() (per docs/schema.md).
 * Do not rely on members.user_id.
 * Throws if member not found.
 */
export async function requireMemberIdForUser(
  userId: string,
  supabase: SupabaseClient
): Promise<string> {
  // Canonical mapping: members.id == auth.uid()
  // So userId IS the member id
  const { data: memberData, error } = await supabase
    .from("members")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !memberData) {
    throw new Error("MEMBER_NOT_FOUND"); // Signal for 403 response
  }

  return memberData.id;
}

/**
 * Requires approved group membership.
 * Verifies group_members row exists with user_id == userId, status == "approved".
 * Throws if membership not found.
 */
export async function requireApprovedGroupMembership(params: {
  supabase: SupabaseClient;
  userId: string;
  groupId: string;
}): Promise<void> {
  const { supabase, userId, groupId } = params;

  const { data: groupMemberData, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();

  if (error || !groupMemberData) {
    throw new Error("FORBIDDEN"); // Signal for 403 response
  }
}

/**
 * Checks if user is a group admin.
 * Returns true if role == "admin" and status == "approved".
 */
export async function isGroupAdmin(params: {
  supabase: SupabaseClient;
  userId: string;
  groupId: string;
}): Promise<boolean> {
  const { supabase, userId, groupId } = params;

  const { data: groupMemberData, error } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "approved")
    .maybeSingle();

  if (error || !groupMemberData) {
    return false;
  }

  return (groupMemberData as any).role === "admin";
}
