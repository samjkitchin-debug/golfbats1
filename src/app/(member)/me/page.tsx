"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { COUNTRIES } from "@/app/lib/countries";
import { formatHandicap } from "@/app/lib/format";

type MemberStatus = "pending" | "active" | string;

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  handicap_type: string | null;
  profile_photo_path: string | null;
  created_at: string;
  last_seen: string | null;
  status: MemberStatus;
  is_admin: boolean;
};

// Legacy ProfileRow type - no longer used for passport data
// Passport data is now stored in member_passports (canonical source)

export default function MePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // Get highlighted fields from query params
  const highlightParam = searchParams?.get("highlight") || "";
  const highlightedFields = useMemo(() => {
    if (!highlightParam) return [];
    return highlightParam.split(",").map(f => f.trim()).filter(Boolean);
  }, [highlightParam]);

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);

  const [isAdmin, setIsAdmin] = useState(false);

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nationality, setNationality] = useState("");
  const [declaredHandicap, setDeclaredHandicap] = useState("");
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropModalTitle, setCropModalTitle] = useState<"Crop Profile Photo" | "Crop Passport Photo">("Crop Profile Photo");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Passport edit state (canonical source: member_passports)
  const [editingPassport, setEditingPassport] = useState(false);
  const [passportFullName, setPassportFullName] = useState("");
  const [passportNumber, setPassportNumber] = useState(""); // Plaintext input only, cleared after save
  const [passportCountry, setPassportCountry] = useState(""); // Maps to passport_country (labeled as "Nationality" in UI)
  const [passportExpiryDate, setPassportExpiryDate] = useState("");
  const [passportPhotoPath, setPassportPhotoPath] = useState<string | null>(null);
  const [passportPhotoUrl, setPassportPhotoUrl] = useState<string | null>(null);
  const [uploadingPassportPhoto, setUploadingPassportPhoto] = useState(false);
  const [savingPassport, setSavingPassport] = useState(false);
  const [passportSaveSuccess, setPassportSaveSuccess] = useState(false);
  const [hasPassportData, setHasPassportData] = useState(false);

  // Account deletion state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Password change state
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Handicap edit state
  const [editingHandicap, setEditingHandicap] = useState(false);
  const [handicapValue, setHandicapValue] = useState("");
  const [handicapType, setHandicapType] = useState<"declared_starter" | "declared_established" | "dayforeit_official">("declared_starter");
  const [savingHandicap, setSavingHandicap] = useState(false);
  const [roundsToOfficial, setRoundsToOfficial] = useState<number | null>(null);

  // Data security modal state
  const [showDataSecurityModal, setShowDataSecurityModal] = useState(false);

  // Group memberships state
  const [groupMemberships, setGroupMemberships] = useState<Array<{
    groupId: string;
    groupName: string;
    groupSlug: string;
    role: "admin" | "member";
    status: "approved" | "pending";
    isSoleAdmin: boolean;
  }>>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  
  // Group menu state
  const [openGroupMenuId, setOpenGroupMenuId] = useState<string | null>(null);
  const [leaveGroupModal, setLeaveGroupModal] = useState<{
    isOpen: boolean;
    groupId: string;
    groupName: string;
    isSoleAdmin: boolean;
  }>({
    isOpen: false,
    groupId: "",
    groupName: "",
    isSoleAdmin: false,
  });
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [leaveGroupError, setLeaveGroupError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Passport data (for checking if passport exists - no inline editing)
  // Passport editing is handled on /me/passport page

  // Sign out state
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    document.title = "DayForeIt - Profile";
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userErr || !user) {
        // Redirect to login if not authenticated
        router.push("/login?next=/me");
        return;
      }

      setAuthUser(user);

      const { data, error: memberErr } = await supabase
        .from("members")
        .select(
          "id,email,full_name,display_name,nationality,declared_handicap,handicap_type,profile_photo_path,created_at,last_seen,status,is_admin"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (memberErr) {
        // Database error - show error but don't redirect
        setError(memberErr.message);
        setMember(null);
        setLoading(false);
        return;
      }

      const m = data as MemberRow | null;
      
      // Load member data for profile editing
      // Initialize even if member is null (first visit)
      setMember(m);
      setIsAdmin(!!m?.is_admin);
      setFullName(m?.full_name ?? "");
      setDisplayName(m?.display_name ?? "");
      setNationality(m?.nationality ?? "");
      setDeclaredHandicap(
        m?.declared_handicap === null || m?.declared_handicap === undefined
          ? ""
          : String(m.declared_handicap)
      );
      setProfilePhotoPath(m?.profile_photo_path ?? null);
      
      // Ensure editing state is available even when member is null
      // This allows profile photo upload on first visit

      // Load passport data from member_passports (canonical source)
      const { data: passportData } = await supabase
        .from("member_passports")
        .select("passport_full_name,passport_country,passport_expiry_date,passport_photo_path")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (passportData) {
        setHasPassportData(true);
        setPassportFullName(passportData.passport_full_name ?? "");
        setPassportCountry(passportData.passport_country ?? "");
        setPassportExpiryDate(passportData.passport_expiry_date ?? "");
        setPassportPhotoPath(passportData.passport_photo_path ?? null);
        
        // Load signed photo URL if photo exists
        if (passportData.passport_photo_path) {
          try {
            const photoRes = await fetch("/me/passport/photo");
            if (photoRes.ok) {
              const photoJson = await photoRes.json();
              setPassportPhotoUrl(photoJson.photoUrl || null);
            }
          } catch (e) {
            // Silent failure - photo URL is optional
          }
        } else {
          setPassportPhotoUrl(null);
        }
        
        // Clear passport number input (never display decrypted value)
        setPassportNumber("");
      } else {
        setHasPassportData(false);
        setPassportFullName("");
        setPassportNumber("");
        setPassportCountry("");
        setPassportExpiryDate("");
        setPassportPhotoPath(null);
        setPassportPhotoUrl(null);
      }

      // Load group memberships: first get group_members, then fetch group details separately
      const { data: groupMembersData, error: groupMembersError } = await supabase
        .from("group_members")
        .select("group_id, role, status, joined_at")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: false });

      if (cancelled) return;

      // Check for actual error (error object should have message/code if real error)
      if (groupMembersError && (groupMembersError.message || groupMembersError.code || groupMembersError.details)) {
        console.error("Failed to load group memberships:", groupMembersError);
        setGroupMemberships([]);
        setLoadingGroups(false);
      } else if (groupMembersData && groupMembersData.length > 0) {
        // Extract group IDs and fetch group details
        const groupIds = groupMembersData.map((gm) => gm.group_id);
        const { data: groupsData, error: groupsError } = await supabase
          .from("groups")
          .select("id, name, slug, is_active")
          .in("id", groupIds);

        if (cancelled) return;

        if (groupsError) {
          console.error("Failed to load group details:", groupsError);
          setGroupMemberships([]);
          setLoadingGroups(false);
        } else {
          // Create a map of group data
          const groupsMap = new Map((groupsData || []).map((g: any) => [g.id, g]));
          
          // For each membership, check if user is sole approved admin and combine with group data
          const membershipsWithSoleAdmin = await Promise.all(
            groupMembersData.map(async (gm: any) => {
              const group = groupsMap.get(gm.group_id);
              if (!group || !group.is_active) return null;
              
              const role = (gm.role || "member") as "admin" | "member";
              const status = (gm.status || "pending") as "approved" | "pending";
              
              // Check if user is sole approved admin
              let isSoleAdmin = false;
              if (role === "admin" && status === "approved") {
                const { count } = await supabase
                  .from("group_members")
                  .select("*", { count: "exact", head: true })
                  .eq("group_id", group.id)
                  .eq("role", "admin")
                  .eq("status", "approved")
                  .neq("user_id", user.id);
                
                isSoleAdmin = count === 0;
              }
              
              return {
                groupId: group.id,
                groupName: group.name,
                groupSlug: group.slug || "",
                role,
                status,
                isSoleAdmin,
              };
            })
          );
          
          if (cancelled) return;
          
          const memberships = membershipsWithSoleAdmin.filter(
            (m): m is { groupId: string; groupName: string; groupSlug: string; role: "admin" | "member"; status: "approved" | "pending"; isSoleAdmin: boolean } => m !== null
          );
          
          setGroupMemberships(memberships);
          setLoadingGroups(false);
        }
      } else {
        setGroupMemberships([]);
        setLoadingGroups(false);
      }

      // Load handicap status
      try {
        const statusRes = await fetch("/api/me/handicap-status", {
          credentials: "include",
        });
        if (!cancelled && statusRes.ok) {
          const statusJson = await statusRes.json();
          if (statusJson.ok && typeof statusJson.roundsToOfficial === "number") {
            setRoundsToOfficial(statusJson.roundsToOfficial);
          }
        }
      } catch (e) {
        // Silent failure - handicap status is optional
        console.error("Failed to load handicap status:", e);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  // Helper function to generate a consistent color from a group ID (same as in home page)
  function getGroupColor(groupId: string): string {
    let hash = 0;
    for (let i = 0; i < groupId.length; i++) {
      hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const colors = [
      "hsl(210, 50%, 55%)",  // Blue
      "hsl(160, 50%, 50%)",  // Teal/Green
      "hsl(30, 65%, 55%)",   // Orange
      "hsl(280, 50%, 60%)",  // Purple
      "hsl(340, 55%, 60%)",  // Pink
      "hsl(200, 60%, 50%)",  // Cyan
      "hsl(15, 70%, 55%)",   // Red-orange
      "hsl(260, 50%, 60%)",  // Indigo
    ];
    
    return colors[Math.abs(hash) % colors.length];
  }

  // Helper function to get group avatar initials from group name
  function getGroupInitials(groupName: string): string {
    if (!groupName) return "?";
    const parts = groupName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return groupName.toUpperCase().slice(0, 2);
  }

  // Handler for leaving a group
  async function handleLeaveGroup(groupId: string, groupName: string, isSoleAdmin: boolean) {
    if (isSoleAdmin) {
      setLeaveGroupError("You are the only approved admin of this group. Assign another admin before leaving.");
      return;
    }

    setLeavingGroup(true);
    setLeaveGroupError(null);

    try {
      const res = await fetch("/api/groups/leave", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && json.reason === "sole_admin") {
          throw new Error(json.message || "You are the only approved admin of this group. Assign another admin before leaving.");
        }
        throw new Error(json.error || "Failed to leave group.");
      }

      // Reload group memberships using the same pattern as initial load
      const { data: { user: reloadUser } } = await supabase.auth.getUser();
      if (reloadUser) {
        // First get group_members
        const { data: reloadGroupMembersData, error: reloadGroupMembersError } = await supabase
          .from("group_members")
          .select("group_id, role, status, joined_at")
          .eq("user_id", reloadUser.id)
          .order("joined_at", { ascending: false });

        if (reloadGroupMembersError && (reloadGroupMembersError.message || reloadGroupMembersError.code || reloadGroupMembersError.details)) {
          console.error("Failed to reload group memberships:", reloadGroupMembersError);
          // Don't update state on error - keep existing memberships
        } else if (reloadGroupMembersData && reloadGroupMembersData.length > 0) {
          // Extract group IDs and fetch group details separately
          const reloadGroupIds = reloadGroupMembersData.map((gm) => gm.group_id);
          const { data: reloadGroupsData, error: reloadGroupsError } = await supabase
            .from("groups")
            .select("id, name, slug, is_active")
            .in("id", reloadGroupIds);

          if (reloadGroupsError && (reloadGroupsError.message || reloadGroupsError.code || reloadGroupsError.details)) {
            console.error("Failed to reload group details:", reloadGroupsError);
            // Don't update state on error - keep existing memberships
          } else {
            // Create a map of group data
            const reloadGroupsMap = new Map((reloadGroupsData || []).map((g: any) => [g.id, g]));
            
            // For each membership, check if user is sole approved admin and combine with group data
            const reloadMembershipsWithSoleAdmin = await Promise.all(
              reloadGroupMembersData.map(async (gm: any) => {
                const group = reloadGroupsMap.get(gm.group_id);
                if (!group || !group.is_active) return null;
                
                const role = (gm.role || "member") as "admin" | "member";
                const status = (gm.status || "pending") as "approved" | "pending";
                
                // Check if user is sole approved admin
                let isSoleAdmin = false;
                if (role === "admin" && status === "approved") {
                  const { count } = await supabase
                    .from("group_members")
                    .select("*", { count: "exact", head: true })
                    .eq("group_id", group.id)
                    .eq("role", "admin")
                    .eq("status", "approved")
                    .neq("user_id", reloadUser.id);
                  
                  isSoleAdmin = count === 0;
                }
                
                return {
                  groupId: group.id,
                  groupName: group.name,
                  groupSlug: group.slug || "",
                  role,
                  status,
                  isSoleAdmin,
                };
              })
            );
            
            const reloadMemberships = reloadMembershipsWithSoleAdmin.filter(
              (m): m is { groupId: string; groupName: string; groupSlug: string; role: "admin" | "member"; status: "approved" | "pending"; isSoleAdmin: boolean } => m !== null
            );
            
            setGroupMemberships(reloadMemberships);
          }
        } else {
          // No memberships found - clear the list
          setGroupMemberships([]);
        }
      }

      setLeaveGroupModal({ isOpen: false, groupId: "", groupName: "", isSoleAdmin: false });
    } catch (error) {
      setLeaveGroupError(error instanceof Error ? error.message : "Failed to leave group.");
    } finally {
      setLeavingGroup(false);
    }
  }

  // Click outside handler for group menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (openGroupMenuId !== null && !target.closest(`[data-group-menu="${openGroupMenuId}"]`)) {
        setOpenGroupMenuId(null);
      }
    }
    
    if (openGroupMenuId !== null) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [openGroupMenuId]);

  // Handler for uploading passport photo
  async function handleUploadPassportPhoto(file: File) {
    setUploadingPassportPhoto(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/me/passport/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to upload passport photo.");
      }

      // Store the returned path
      if (json.path) {
        setPassportPhotoPath(json.path);
      }
    } catch (error: any) {
      setError(error?.message || "Failed to upload passport photo.");
    } finally {
      setUploadingPassportPhoto(false);
    }
  }

  // Handler for saving passport details to member_passports (canonical source)
  async function handleSavePassport() {
    if (savingPassport) return;

    setSavingPassport(true);
    setError(null);
    setPassportSaveSuccess(false);

    try {
      const res = await fetch("/me/passport/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passport_full_name: passportFullName.trim(),
          passport_number: passportNumber.trim(), // Plaintext - server encrypts
          passport_country: passportCountry.trim(), // Maps to passport_country (labeled as "Nationality" in UI)
          passport_expiry_date: passportExpiryDate.trim(),
          passport_photo_path: passportPhotoPath,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to save passport details.");
      }

      // Success: reload passport data
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: passportData } = await supabase
          .from("member_passports")
          .select("passport_full_name,passport_country,passport_expiry_date,passport_photo_path")
          .eq("user_id", user.id)
          .maybeSingle();

        if (passportData) {
          setHasPassportData(true);
          setPassportFullName(passportData.passport_full_name ?? "");
          setPassportCountry(passportData.passport_country ?? "");
          setPassportExpiryDate(passportData.passport_expiry_date ?? "");
          setPassportPhotoPath(passportData.passport_photo_path ?? null);
          
          // Load signed photo URL if photo exists
          if (passportData.passport_photo_path) {
            try {
              const photoRes = await fetch("/me/passport/photo");
              if (photoRes.ok) {
                const photoJson = await photoRes.json();
                setPassportPhotoUrl(photoJson.photoUrl || null);
              }
            } catch (e) {
              // Silent failure
            }
          } else {
            setPassportPhotoUrl(null);
          }
        } else {
          setHasPassportData(false);
        }
      }

      // Clear passport number input (never display decrypted value)
      setPassportNumber("");
      setPassportSaveSuccess(true);
      setEditingPassport(false);
    } catch (error: any) {
      setError(error?.message || "Failed to save passport details.");
    } finally {
      setSavingPassport(false);
    }
  }

  const titleName =
    member?.display_name?.trim() ||
    member?.full_name?.trim() ||
    member?.email?.trim() ||
    "Me";

  const isApproved = (member?.status ?? "pending") === "active";
  // Passport completeness check removed - now handled by derived docsComplete from trips API
  // This local check is no longer needed

  // Check if required profile fields are missing
  const profileIncomplete =
    !member?.full_name?.trim() ||
    !member?.display_name?.trim() ||
    !member?.nationality?.trim();

  return (
    <div className="pb-24 pt-4">
      {/* Unboxed content rail - matches Home page padding */}
      <div className="px-5">
        {/* Top header & identity */}
        <div className="mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-foreground">Me</h1>
              <div className="mt-2">
                <div className="text-lg font-medium text-foreground">
                  {loading ? "Loading…" : titleName}
                </div>
                {!loading && member && (
                  <div className="mt-2 text-xs text-secondary leading-relaxed">
                    {isApproved ? "You're good to go" : "Profile incomplete"}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* TEMP: Sandbox access for GameDay prototype. Remove when integrated. */}
              {process.env.NEXT_PUBLIC_ENABLE_SANDBOX_LINKS === "true" && (
                <Link
                  href="/sandbox/gameday"
                  className="text-xs text-muted hover:text-foreground"
                >
                  Sandbox
                </Link>
              )}
              {isAdmin && (
                <Link
                  href="/members?mode=admin"
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background"
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Pending approval status message */}
        {!loading && !error && member && !isApproved && (
          <div className="mb-4 rounded-lg border border-border bg-surface/50 px-4 py-3">
            <p className="text-sm text-muted">
              Membership pending approval. An organiser will review your details shortly.
            </p>
          </div>
        )}

        {error ? (
          <div className="mb-4 rounded-lg border border-border bg-surface/50 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Error</p>
            <p className="mt-1 text-sm text-foreground">{error}</p>
          </div>
        ) : null}

        {profileSaveSuccess ? (
          <div className="mb-4 rounded-lg chip-success px-4 py-2">
            <p className="text-sm text-foreground">Profile saved</p>
          </div>
        ) : null}

        {/* Handicap instrument */}
        {!loading && member && (
          <div className="py-4 relative">
            <div className="absolute top-0 right-0">
              {member.handicap_type === "dayforeit_official" ? (
                <button
                  onClick={() => {
                    // Stub: no functionality yet
                  }}
                  className="text-xs text-muted hover:text-foreground underline"
                >
                  Add a past round
                </button>
              ) : (
                <button
                  onClick={() => {
                    setHandicapValue(
                      member.declared_handicap === null || member.declared_handicap === undefined
                        ? ""
                        : String(member.declared_handicap)
                    );
                    setHandicapType((member.handicap_type || "declared_starter") as "declared_starter" | "declared_established" | "dayforeit_official");
                    setEditingHandicap(true);
                  }}
                  className="text-xs text-muted hover:text-foreground underline"
                >
                  Edit
                </button>
              )}
            </div>
            {member.declared_handicap !== null && member.declared_handicap !== undefined ? (
              <>
                <div className="text-3xl font-light text-primary">
                  {formatHandicap(member.declared_handicap)}
                </div>
                <div className="mt-1 text-xs text-secondary">Your handicap</div>
                {member.handicap_type && (
                  <div className="mt-0.5 text-xs text-muted">
                    {member.handicap_type === "declared_starter" ? "Starter" :
                     member.handicap_type === "declared_established" ? "Established" :
                     member.handicap_type === "dayforeit_official" ? "Official (Day Fore It)" : ""}
                  </div>
                )}
                {member.handicap_type === "dayforeit_official" && (
                  <div className="mt-1 text-xs text-muted">Official handicaps are maintained from rounds.</div>
                )}
                {member.handicap_type !== "dayforeit_official" && roundsToOfficial !== null && (
                  <div className="mt-1 text-xs text-muted">{roundsToOfficial} rounds to Official</div>
                )}
              </>
            ) : (
              <div>
                <div className="text-sm text-secondary">Add your handicap</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Boxed sections - keep their own padding */}
      <div className="space-y-6">
        {/* Profile Block */}
        <div id="profile-section" className="border-t border-border pt-4 px-5">
        <ProfileBlock
          member={member}
          editing={editingProfile}
          onToggleEdit={() => {
            setEditingProfile(!editingProfile);
            setProfileSaved(false);
            setProfileSaveSuccess(false);
            if (!editingProfile) {
              // Reset to current values when starting edit
              setFullName(member?.full_name ?? "");
              setDisplayName(member?.display_name ?? "");
              setNationality(member?.nationality ?? "");
            }
          }}
          fullName={fullName}
          setFullName={(v) => {
            setFullName(v);
            // Reset saved state when user makes changes
            if (profileSaved) setProfileSaved(false);
          }}
          displayName={displayName}
          setDisplayName={(v) => {
            setDisplayName(v);
            // Reset saved state when user makes changes
            if (profileSaved) setProfileSaved(false);
          }}
          nationality={nationality}
          setNationality={(v) => {
            setNationality(v);
            // Reset saved state when user makes changes
            if (profileSaved) setProfileSaved(false);
          }}
          profilePhotoPath={profilePhotoPath}
          setProfilePhotoPath={setProfilePhotoPath}
          uploadingProfilePhoto={uploadingProfilePhoto}
          setUploadingProfilePhoto={setUploadingProfilePhoto}
          saving={savingProfile}
          saved={profileSaved}
          showCropModal={showCropModal}
          cropModalTitle={cropModalTitle}
          setCropModalTitle={setCropModalTitle}
          imageSrc={imageSrc}
          crop={crop}
          zoom={zoom}
          croppedAreaPixels={croppedAreaPixels}
          setShowCropModal={setShowCropModal}
          setImageSrc={setImageSrc}
          setCrop={setCrop}
          setZoom={setZoom}
          setCroppedAreaPixels={setCroppedAreaPixels}
          onSave={async () => {
            if (savingProfile) return; // Prevent double submission
            
            setSavingProfile(true);
            setError(null);
            setProfileSaveSuccess(false);

            try {
              const res = await fetch("/me/edit/save", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  full_name: fullName.trim(),
                  display_name: displayName.trim(),
                  nationality: nationality.trim(),
                }),
              });

              const json = await res.json().catch(() => ({}));

              if (!res.ok) {
                throw new Error(json?.error || "Failed to save profile.");
              }

              // Success: keep form open, show success message, re-enable button
              setProfileSaved(true);
              setSavingProfile(false); // Re-enable button to show "Saved" state
              setProfileSaveSuccess(true);
              setError(null);
              
              // Reload member data to reflect saved changes
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data } = await supabase
                  .from("members")
                  .select("id,email,full_name,display_name,nationality,declared_handicap,handicap_type,profile_photo_path,created_at,last_seen,status,is_admin")
                  .eq("id", user.id)
                  .maybeSingle();
                if (data) {
                  setMember(data as MemberRow);
                  setProfilePhotoPath(data.profile_photo_path ?? null);
                  // Don't update form fields - preserve user's current state
                  // This allows them to continue editing without losing their changes
                }
              }
              
              // Keep success message visible (don't auto-clear)
              // User can continue editing, and button will show "Save" again if they make changes
            } catch (e: any) {
              setError(e?.message || "Failed to save profile.");
              setSavingProfile(false); // Reset on error to allow retry
              setProfileSaveSuccess(false);
            }
          }}
          onProfilePhotoUpload={async (file: File) => {
            setUploadingProfilePhoto(true);
            setError(null);

            try {
              const formData = new FormData();
              formData.append("file", file);

              const res = await fetch("/me/profile-photo/upload", {
                method: "POST",
                body: formData,
              });

              const json = await res.json().catch(() => ({}));

              if (!res.ok) {
                throw new Error(json?.error || "Failed to upload photo.");
              }

              // Update state immediately without page reload
              setProfilePhotoPath(json.path);
              
              // Reload member data to sync state (no page reload needed)
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data } = await supabase
                  .from("members")
                  .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen,status,is_admin")
                  .eq("id", user.id)
                  .maybeSingle();
                if (data) {
                  setMember(data as MemberRow);
                  setIsAdmin(!!data.is_admin);
                  // Update form fields if they were empty
                  if (!fullName && data.full_name) setFullName(data.full_name);
                  if (!displayName && data.display_name) setDisplayName(data.display_name);
                  if (!nationality && data.nationality) setNationality(data.nationality);
                }
              }
            } catch (e: any) {
              setError(e?.message || "Failed to upload photo.");
            } finally {
              setUploadingProfilePhoto(false);
            }
          }}
          highlightedFields={highlightedFields}
        />
        </div>

        {/* My groups section */}
        <div className="rounded-2xl border border-border bg-surface/50 p-4">
          <div className="mb-3">
            <div className="text-sm font-medium text-foreground">My groups</div>
          </div>
          
          {loadingGroups ? (
            <div className="text-xs text-muted">Loading groups…</div>
          ) : groupMemberships.length === 0 ? (
            <div className="text-xs text-muted">You're not a member of any groups yet.</div>
          ) : (
            <div className="space-y-2">
              {groupMemberships.map((membership) => {
                const groupColor = getGroupColor(membership.groupId);
                const initials = getGroupInitials(membership.groupName);
                const isMenuOpen = openGroupMenuId === membership.groupId;
                const canLeave = !membership.isSoleAdmin;
                
                return (
                  <div
                    key={membership.groupId}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
                  >
                    {/* Group avatar - small circular */}
                    <div
                      className="h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                      style={{ backgroundColor: groupColor }}
                    >
                      {initials}
                    </div>
                    
                    {/* Group info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {membership.groupName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span>{membership.role === "admin" ? "Admin" : "Member"}</span>
                        {membership.status === "approved" && membership.groupSlug && (
                          <>
                            <span>·</span>
                            <span>Code: {membership.groupSlug}</span>
                          </>
                        )}
                      </div>
                      {membership.status === "approved" && membership.groupSlug && (
                        <div className="mt-2 flex gap-2 items-center">
                          <button
                            onClick={async () => {
                              const inviteLink = `${window.location.origin}/join?code=${membership.groupSlug}`;
                              try {
                                if (navigator.share) {
                                  await navigator.share({
                                    title: `Join ${membership.groupName} on DayForeIt`,
                                    text: `Join my group "${membership.groupName}" on DayForeIt`,
                                    url: inviteLink,
                                  });
                                } else {
                                  await navigator.clipboard.writeText(inviteLink);
                                  setCopyFeedback("Copied");
                                  setTimeout(() => setCopyFeedback(null), 1500);
                                }
                              } catch (err) {
                                // User cancelled share or error - try copy as fallback
                                try {
                                  await navigator.clipboard.writeText(inviteLink);
                                  setCopyFeedback("Copied");
                                  setTimeout(() => setCopyFeedback(null), 1500);
                                } catch (copyErr) {
                                  // Silent fail on clipboard error
                                }
                              }
                            }}
                            className="text-xs text-secondary hover:text-foreground underline"
                          >
                            Share invite
                          </button>
                          {copyFeedback && (
                            <span className="text-xs text-secondary">{copyFeedback}</span>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Kebab menu */}
                    <div className="relative flex-shrink-0" data-group-menu={membership.groupId}>
                      <button
                        onClick={() => setOpenGroupMenuId(isMenuOpen ? null : membership.groupId)}
                        className="rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground"
                        aria-label="Group options"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                          />
                        </svg>
                      </button>
                      {isMenuOpen && (
                        <div className="absolute right-0 top-9 z-10 w-48 rounded-lg border border-border bg-surface shadow-lg">
                          <div className="py-1">
                            {canLeave && (
                              <button
                                onClick={() => {
                                  setOpenGroupMenuId(null);
                                  setLeaveGroupModal({
                                    isOpen: true,
                                    groupId: membership.groupId,
                                    groupName: membership.groupName,
                                    isSoleAdmin: membership.isSoleAdmin,
                                  });
                                  setLeaveGroupError(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                              >
                                Leave group
                              </button>
                            )}
                            {!canLeave && (
                              <div className="px-4 py-2 text-xs text-muted">
                                Cannot leave (sole admin)
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Passport details section */}
        <div className="border-t border-border pt-4 px-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="text-sm font-medium text-foreground">Travel documents</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDataSecurityModal(true)}
                className="text-xs text-secondary hover:text-foreground underline"
              >
                Data security
              </button>
              <button
                onClick={() => {
                  setEditingPassport(!editingPassport);
                  setPassportSaveSuccess(false);
                  if (!editingPassport) {
                    // Reset to current values when starting edit
                    // Note: passportNumber is always empty (never display decrypted value)
                    setPassportFullName(hasPassportData ? passportFullName : "");
                    setPassportNumber(""); // Always clear - never display decrypted
                    setPassportCountry(hasPassportData ? passportCountry : "");
                    setPassportExpiryDate(hasPassportData ? passportExpiryDate : "");
                  }
                }}
                className="rounded-xl border border-border px-3 py-1 text-xs font-medium hover:bg-background"
              >
                {editingPassport ? "Cancel" : hasPassportData ? "Edit" : "Add"}
              </button>
            </div>
          </div>

          {!editingPassport ? (
            <div className="text-sm">
              {hasPassportData ? (
                <div className="space-y-1">
                  <div className="text-foreground">On file</div>
                  {passportExpiryDate && (
                    <div className="text-xs text-secondary">
                      Expires {new Date(passportExpiryDate + "T00:00:00").toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  )}
                  {passportFullName && (
                    <div className="text-xs text-secondary mt-1">
                      {passportFullName}
                    </div>
                  )}
                  {passportPhotoPath && (
                    <div className="text-xs text-secondary mt-1">
                      Photo: {passportPhotoUrl ? "Uploaded" : "Available"}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-secondary">Not on file</div>
              )}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold">Full name (as on passport)</div>
                <input
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                    highlightedFields.includes("passport_full_name")
                      ? "border-warning ring-2 ring-warning/30"
                      : "border-border"
                  }`}
                  value={passportFullName}
                  onChange={(e) => setPassportFullName(e.target.value)}
                  placeholder="e.g. John Smith"
                />
                {highlightedFields.includes("passport_full_name") && (
                  <p className="mt-1 text-xs text-warning">Needed to export your travel details</p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold">Passport number</div>
                <input
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                    highlightedFields.includes("passport_number")
                      ? "border-warning ring-2 ring-warning/30"
                      : "border-border"
                  }`}
                  value={passportNumber}
                  onChange={(e) => setPassportNumber(e.target.value)}
                  placeholder="Enter new passport number to change"
                />
                <p className="mt-1 text-xs text-muted">Stored securely and not shown. Enter a new number only if you want to change it.</p>
                {highlightedFields.includes("passport_number") && (
                  <p className="mt-1 text-xs text-warning">Needed to export your travel details</p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold">Nationality</div>
                <input
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                    highlightedFields.includes("passport_country") || highlightedFields.includes("passport_nationality")
                      ? "border-warning ring-2 ring-warning/30"
                      : "border-border"
                  }`}
                  value={passportCountry}
                  onChange={(e) => setPassportCountry(e.target.value)}
                  placeholder="e.g. Singaporean"
                />
                {(highlightedFields.includes("passport_country") || highlightedFields.includes("passport_nationality")) && (
                  <p className="mt-1 text-xs text-warning">Needed to export your travel details</p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold">Expiry date</div>
                <input
                  type="date"
                  className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                    highlightedFields.includes("passport_expiry_date")
                      ? "border-warning ring-2 ring-warning/30"
                      : "border-border"
                  }`}
                  value={passportExpiryDate}
                  onChange={(e) => setPassportExpiryDate(e.target.value)}
                />
                {highlightedFields.includes("passport_expiry_date") && (
                  <p className="mt-1 text-xs text-warning">Needed to export your travel details</p>
                )}
              </div>

              <div>
                <div className="text-xs font-semibold">Passport photo</div>
                <div className="mt-2 flex items-center gap-3">
                  {passportPhotoUrl ? (
                    <img
                      src={passportPhotoUrl}
                      alt="Passport"
                      className="h-16 w-16 rounded-lg object-cover border border-border"
                    />
                  ) : passportPhotoPath ? (
                    <div className="h-16 w-16 rounded-lg border border-border bg-background flex items-center justify-center text-xs text-muted">
                      Uploaded
                    </div>
                  ) : null}
                  <div>
                    <input
                      id="passport-photo-input"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.addEventListener("load", () => {
                            setImageSrc(reader.result as string);
                            setCropModalTitle("Crop Passport Photo");
                            setShowCropModal(true);
                            setZoom(1);
                            setCrop({ x: 0, y: 0 });
                          });
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                      disabled={uploadingPassportPhoto}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById("passport-photo-input")?.click()}
                      disabled={uploadingPassportPhoto}
                      className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-background disabled:opacity-60"
                    >
                      {passportPhotoPath ? "Change Photo" : "Add Photo"}
                    </button>
                    {uploadingPassportPhoto && (
                      <p className="mt-1 text-xs text-muted">Uploading photo…</p>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSavePassport}
                disabled={savingPassport || !passportFullName.trim() || !passportCountry.trim() || !passportExpiryDate.trim() || (!hasPassportData && !passportNumber.trim())}
                className="w-full rounded-xl btn-primary px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingPassport ? "Saving..." : "Save passport details"}
              </button>
            </div>
          )}

          {passportSaveSuccess && (
            <div className="mt-3 rounded-lg chip-success px-3 py-2 text-xs text-foreground">
              Passport details saved successfully
            </div>
          )}

          {/* Passport Photo Crop Modal */}
          {showCropModal && imageSrc && cropModalTitle === "Crop Passport Photo" && (
            <ImageCropModal
              title="Crop Passport Photo"
              imageSrc={imageSrc}
              crop={crop}
              zoom={zoom}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(croppedArea, croppedAreaPixels) => {
                setCroppedAreaPixels(croppedAreaPixels);
              }}
              onCancel={() => {
                setShowCropModal(false);
                setImageSrc(null);
              }}
              onSave={async () => {
                if (!croppedAreaPixels || !imageSrc) return;
                
                setShowCropModal(false);
                setUploadingPassportPhoto(true);
                
                try {
                  const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
                  const blob = await fetch(croppedImage).then((r) => r.blob());
                  const file = new File([blob], "passport.jpg", { type: "image/jpeg" });
                  await handleUploadPassportPhoto(file);
                  setImageSrc(null);
                } catch (error: any) {
                  console.error("Failed to crop passport image:", error);
                  setError("Failed to process passport photo. Please try again.");
                } finally {
                  setUploadingPassportPhoto(false);
                }
              }}
            />
          )}
        </div>

        {/* Security */}
        {(() => {
          const authProvider = authUser?.app_metadata?.provider;
          const canChangePassword = authProvider === "email";
          return canChangePassword ? (
            <div className="border-t border-border pt-4 px-5">
              <div className="mb-3">
                <div className="text-sm font-medium text-foreground">Security</div>
              </div>
              {!changingPassword ? (
            <div className="flex items-center justify-between">
              <div className="text-sm text-foreground">Password</div>
              <button
                onClick={() => {
                  setChangingPassword(true);
                  setNewPassword("");
                  setConfirmPassword("");
                  setPasswordChangeError(null);
                  setPasswordChangeSuccess(false);
                }}
                className="text-sm text-muted hover:text-foreground hover:underline"
              >
                Change password
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {passwordChangeError && (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground">
                  {passwordChangeError}
                </div>
              )}
              {passwordChangeSuccess && (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground">
                  Password updated.
                </div>
              )}
              <div>
                <label className="text-xs font-semibold">New password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold">Confirm password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setPasswordChangeError(null);
                    setPasswordChangeSuccess(false);

                    if (!newPassword) {
                      setPasswordChangeError("Enter a new password.");
                      return;
                    }

                    if (!confirmPassword) {
                      setPasswordChangeError("Confirm your password.");
                      return;
                    }

                    if (newPassword !== confirmPassword) {
                      setPasswordChangeError("Passwords do not match.");
                      return;
                    }

                    setUpdatingPassword(true);

                    try {
                      const { error } = await supabase.auth.updateUser({
                        password: newPassword,
                      });

                      if (error) throw error;
                      setPasswordChangeSuccess(true);
                      setNewPassword("");
                      setConfirmPassword("");
                      setTimeout(() => {
                        setChangingPassword(false);
                        setPasswordChangeSuccess(false);
                      }, 2000);
                    } catch (e: any) {
                      setPasswordChangeError("Couldn't update your password. Try again.");
                    } finally {
                      setUpdatingPassword(false);
                    }
                  }}
                  disabled={updatingPassword}
                  className="flex-1 rounded-xl btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {updatingPassword ? "Updating…" : "Update password"}
                </button>
                <button
                  onClick={() => {
                    setChangingPassword(false);
                    setNewPassword("");
                    setConfirmPassword("");
                    setPasswordChangeError(null);
                    setPasswordChangeSuccess(false);
                  }}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
            </div>
          ) : null;
        })()}

        {/* Preferences */}
        <div className="border-t border-border pt-4 px-5">
          <div className="text-xs text-secondary space-y-2">
            <div>
              <span className="text-muted">Appearance</span>
              <span className="text-muted"> · </span>
              <span>Light (locked)</span>
            </div>
            <div>
              <span className="text-muted">Distance units</span>
              <span className="text-muted"> · </span>
              <span>Coming soon</span>
            </div>
            {process.env.NEXT_PUBLIC_ENABLE_SANDBOX_LINKS === "true" && (
              <div>
                <Link
                  href="/sandbox/gameday"
                  className="text-muted hover:text-foreground hover:underline"
                >
                  Sandbox
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sign out + Delete account */}
        <div className="border-t border-border pt-4 px-5 space-y-3">
          <button
            type="button"
            onClick={async () => {
              if (signingOut) return;
              setSigningOut(true);
              try {
                await supabase.auth.signOut();
              } catch {
                // Non-fatal; still navigate to login
              } finally {
                router.replace("/login");
                router.refresh();
                setSigningOut(false);
              }
            }}
            className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          <div className="pt-3 border-t border-dashed border-border">
            <p className="mb-2 text-xs text-muted">
              Permanently delete your account and associated data. This cannot be undone.
            </p>
            <button
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteConfirmText("");
                setDeleteError(null);
              }}
              disabled={deletingAccount}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Delete my account
            </button>
            {deleteError && (
              <p className="mt-2 text-xs text-foreground">{deleteError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Leave group confirmation modal */}
      {leaveGroupModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Leave group</h3>
            <p className="mb-4 text-sm text-muted">
              Are you sure you want to leave "{leaveGroupModal.groupName}"? You will no longer have access to this group's trips and members.
            </p>
            {leaveGroupError && (
              <div className="mb-4 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
                {leaveGroupError}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setLeaveGroupModal({ isOpen: false, groupId: "", groupName: "", isSoleAdmin: false });
                  setLeaveGroupError(null);
                }}
                disabled={leavingGroup}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleLeaveGroup(leaveGroupModal.groupId, leaveGroupModal.groupName, leaveGroupModal.isSoleAdmin)}
                disabled={leavingGroup || leaveGroupModal.isSoleAdmin}
                className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {leavingGroup ? "Leaving..." : "Leave group"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6">
            <h3 className="mb-2 text-lg font-semibold text-foreground">Delete account</h3>
            <p className="mb-4 text-sm text-muted">
              This will permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <p className="mb-4 text-sm font-medium text-foreground">
              Type <span className="text-warning">DELETE</span> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE to confirm"
              disabled={deletingAccount}
              className="mb-6 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground focus:border-anticipation focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmText("");
                  setDeleteError(null);
                }}
                disabled={deletingAccount}
                className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteConfirmText !== "DELETE" || deletingAccount) return;

                  setDeletingAccount(true);
                  setDeleteError(null);

                  try {
                    const res = await fetch("/api/me/delete-account", {
                      method: "POST",
                    });

                    const json = await res.json().catch(() => ({}));

                    if (res.status === 409 && json.reason === "sole_admin_of_group") {
                      setDeleteError(
                        "You're the only admin of a group with other members. Assign another admin before deleting your account."
                      );
                      setDeletingAccount(false);
                      return;
                    }

                    if (!res.ok) {
                      setDeleteError(
                        json.error || "Failed to delete account. Please try again or contact support."
                      );
                      setDeletingAccount(false);
                      return;
                    }

                    if (json.ok === true) {
                      // Account deleted successfully - sign out and redirect to login
                      await supabase.auth.signOut();
                      router.replace("/login");
                      return;
                    }

                    // Unexpected response
                    setDeleteError("Unexpected response. Please try again or contact support.");
                    setDeletingAccount(false);
                  } catch (error) {
                    console.error("Delete account error:", error);
                    setDeleteError("An error occurred. Please try again or contact support.");
                    setDeletingAccount(false);
                  }
                }}
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingAccount ? "Deleting..." : "Delete account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Data security modal */}
      {showDataSecurityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4" onClick={() => setShowDataSecurityModal(false)}>
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Data security</h3>
              <button
                onClick={() => setShowDataSecurityModal(false)}
                className="rounded-lg p-1 text-muted hover:text-foreground hover:bg-background"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 text-xs text-muted leading-relaxed">
              <div>
                <div className="font-medium text-foreground mb-2">Protection measures</div>
                <ul className="ml-4 list-disc space-y-1">
                  <li>Passport numbers are encrypted using AES-256-GCM with server-side key management and cannot be read by anyone except authorised administrators with proper access controls</li>
                  <li>You can view, update, or delete your own passport information at any time</li>
                  <li>All administrator access to passport data is logged and audited</li>
                  <li>Images are stored securely and are only accessible to you and authorised administrators</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-foreground mb-2">Disclaimer</div>
                <p>
                  Passport information is collected only to organise trip logistics, such as ferry bookings and travel arrangements. Please do not upload passport data unless it is required for a specific trip you are attending. Your passport information may be deleted after the relevant trip is completed.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDataSecurityModal(false)}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Handicap edit modal */}
      {editingHandicap && (
        <div className="fixed inset-0 z-50 flex items-end bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-5">
            <h3 className="mb-4 text-lg font-semibold text-foreground">Edit handicap</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1">Handicap</label>
                <input
                  type="number"
                  min="0"
                  max="36"
                  step="0.1"
                  value={handicapValue}
                  onChange={(e) => setHandicapValue(e.target.value)}
                  placeholder="e.g. 18"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2">Type</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="handicap_type"
                      value="declared_starter"
                      checked={handicapType === "declared_starter"}
                      onChange={(e) => setHandicapType(e.target.value as "declared_starter")}
                      className="text-primary"
                    />
                    <span className="text-sm text-foreground">Starter</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="handicap_type"
                      value="declared_established"
                      checked={handicapType === "declared_established"}
                      onChange={(e) => setHandicapType(e.target.value as "declared_established")}
                      className="text-primary"
                    />
                    <span className="text-sm text-foreground">Established</span>
                  </label>
                  <label className="flex items-center gap-2 opacity-50 cursor-not-allowed">
                    <input
                      type="radio"
                      name="handicap_type"
                      value="dayforeit_official"
                      checked={handicapType === "dayforeit_official"}
                      disabled
                      className="text-primary"
                    />
                    <span className="text-sm text-foreground">Official (Day Fore It)</span>
                  </label>
                  <p className="text-xs text-muted ml-6">Coming later</p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setEditingHandicap(false)}
                className="flex-1 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (savingHandicap) return;
                  
                  setSavingHandicap(true);
                  setError(null);

                  const handicapNum = handicapValue.trim() === "" 
                    ? null 
                    : Number(handicapValue.trim());

                  if (handicapNum !== null && (Number.isNaN(handicapNum) || handicapNum < 0 || handicapNum > 36)) {
                    setError("Handicap must be a number between 0 and 36 (or blank).");
                    setSavingHandicap(false);
                    return;
                  }

                  try {
                    const res = await fetch("/me/edit/save", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        full_name: member?.full_name || "",
                        display_name: member?.display_name || "",
                        nationality: member?.nationality || "",
                        declared_handicap: handicapNum,
                        handicap_type: handicapType,
                      }),
                    });

                    const json = await res.json().catch(() => ({}));

                    if (!res.ok) {
                      throw new Error(json?.error || "Failed to save handicap.");
                    }

                    // Reload member data to reflect saved changes
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                      const { data } = await supabase
                        .from("members")
                        .select("id,email,full_name,display_name,nationality,declared_handicap,handicap_type,profile_photo_path,created_at,last_seen,status,is_admin")
                        .eq("id", user.id)
                        .maybeSingle();
                      if (data) {
                        setMember(data as MemberRow);
                      }
                    }

                    setEditingHandicap(false);
                    setError(null);
                  } catch (e: any) {
                    setError(e?.message || "Failed to save handicap.");
                  } finally {
                    setSavingHandicap(false);
                  }
                }}
                disabled={savingHandicap}
                className="flex-1 rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingHandicap ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to generate initials from name
function getInitials(member: MemberRow | null): string {
  if (!member) return "?";
  
  const displayName = member.display_name?.trim();
  const fullName = member.full_name?.trim();
  const email = member.email?.trim();
  
  // Try display name first
  if (displayName) {
    const parts = displayName.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return displayName[0].toUpperCase();
  }
  
  // Try full name
  if (fullName) {
    const parts = fullName.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fullName[0].toUpperCase();
  }
  
  // Fallback to email first letter
  if (email) {
    return email[0].toUpperCase();
  }
  
  return "?";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function ProfileBlock({
  member,
  editing,
  onToggleEdit,
  fullName,
  setFullName,
  displayName,
  setDisplayName,
  nationality,
  setNationality,
  profilePhotoPath,
  setProfilePhotoPath,
  uploadingProfilePhoto,
  setUploadingProfilePhoto,
  saving,
  saved,
  onSave,
  onProfilePhotoUpload,
  showCropModal,
  cropModalTitle,
  setCropModalTitle,
  imageSrc,
  crop,
  zoom,
  croppedAreaPixels,
  setShowCropModal,
  setImageSrc,
  setCrop,
  setZoom,
  setCroppedAreaPixels,
  highlightedFields = [],
}: {
  member: MemberRow | null;
  editing: boolean;
  onToggleEdit: () => void;
  fullName: string;
  setFullName: (v: string) => void;
  displayName: string;
  setDisplayName: (v: string) => void;
  nationality: string;
  setNationality: (v: string) => void;
  profilePhotoPath: string | null;
  setProfilePhotoPath: (v: string | null) => void;
  uploadingProfilePhoto: boolean;
  setUploadingProfilePhoto: (v: boolean) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => Promise<void>;
  onProfilePhotoUpload: (file: File) => Promise<void>;
  showCropModal: boolean;
  cropModalTitle: "Crop Profile Photo" | "Crop Passport Photo";
  setCropModalTitle: (v: "Crop Profile Photo" | "Crop Passport Photo") => void;
  imageSrc: string | null;
  crop: Point;
  zoom: number;
  croppedAreaPixels: Area | null;
  setShowCropModal: (v: boolean) => void;
  setImageSrc: (v: string | null) => void;
  setCrop: (v: Point) => void;
  setZoom: (v: number) => void;
  setCroppedAreaPixels: (v: Area | null) => void;
  highlightedFields?: string[];
}) {
  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div className="text-sm font-medium text-foreground">Profile</div>
        <button
          onClick={onToggleEdit}
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-background"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          {/* Profile photo moved to top with inline change button */}
          <div>
            <div className="text-xs font-semibold">Profile photo</div>
            <div className="mt-2 flex items-center gap-3">
              {profilePhotoPath ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${profilePhotoPath}`}
                  alt="Profile"
                  className="h-16 w-16 rounded-full object-cover border border-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-full border border-border bg-background flex items-center justify-center text-sm font-semibold text-muted">
                  {getInitials(member)}
                </div>
              )}
              <div>
                <input
                  id="profile-photo-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.addEventListener("load", () => {
                        setImageSrc(reader.result as string);
                        setCropModalTitle("Crop Profile Photo");
                        setShowCropModal(true);
                        setZoom(1);
                        setCrop({ x: 0, y: 0 });
                      });
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                  disabled={uploadingProfilePhoto}
                />
                <button
                  type="button"
                  onClick={() => document.getElementById("profile-photo-input")?.click()}
                  disabled={uploadingProfilePhoto}
                  className="rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-background disabled:opacity-60"
                >
                  {profilePhotoPath ? "Change Photo" : "Add Photo"}
                </button>
                {uploadingProfilePhoto && (
                  <p className="mt-1 text-xs text-muted">Uploading photo…</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold">Email</div>
            <div className="mt-1 text-sm text-muted">{member?.email ?? "—"}</div>
            <p className="mt-1 text-xs text-muted">Email cannot be changed</p>
          </div>

          <div>
            <div className="text-xs font-semibold">Full name</div>
            <input
              className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Smith"
            />
          </div>

          <div>
            <div className="text-xs font-semibold">Display name</div>
            <input
              className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sam"
            />
          </div>

          <div>
            <div className="text-xs font-semibold">Nationality</div>
            <select
              className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none"
              value={nationality || ""}
              onChange={(e) => setNationality(e.target.value)}
            >
              <option value="" disabled>
                Select nationality…
              </option>
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
          </div>

          {/* Profile Photo Crop Modal */}
          {showCropModal && imageSrc && cropModalTitle === "Crop Profile Photo" && (
            <ImageCropModal
              title="Crop Profile Photo"
              imageSrc={imageSrc}
              crop={crop}
              zoom={zoom}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(croppedArea, croppedAreaPixels) => {
                setCroppedAreaPixels(croppedAreaPixels);
              }}
              onCancel={() => {
                setShowCropModal(false);
                setImageSrc(null);
              }}
              onSave={async () => {
                if (!croppedAreaPixels || !imageSrc) return;
                
                setShowCropModal(false);
                setUploadingProfilePhoto(true);
                
                try {
                  const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
                  const blob = await fetch(croppedImage).then((r) => r.blob());
                  const file = new File([blob], "profile.jpg", { type: "image/jpeg" });
                  await onProfilePhotoUpload(file);
                  setImageSrc(null);
                } catch (error: any) {
                  // Error will be handled by onProfilePhotoUpload's error handling
                  console.error("Failed to crop image:", error);
                } finally {
                  setUploadingProfilePhoto(false);
                }
              }}
            />
          )}

          <button
            onClick={onSave}
            disabled={saving || uploadingProfilePhoto}
            className="w-full rounded-xl btn-primary px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <div className="mb-3 flex justify-center">
            {member?.profile_photo_path ? (
              <img
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="h-20 w-20 rounded-full border border-border bg-background flex items-center justify-center text-base font-semibold text-muted">
                {getInitials(member)}
              </div>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            {member?.full_name && member.full_name !== member?.display_name && (
              <div className="text-secondary">{member.full_name}</div>
            )}
            {member?.nationality && (
              <div className="text-secondary">{member.nationality}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// Helper function to create cropped image
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not get canvas context");
  }

  // Set canvas size to crop size
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Return as blob URL
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Canvas is empty"));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, "image/jpeg", 0.95);
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.src = url;
  });
}

// Image Crop Modal Component
function ImageCropModal({
  title,
  imageSrc,
  crop,
  zoom,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onCancel,
  onSave,
}: {
  title: string;
  imageSrc: string;
  crop: Point;
  zoom: number;
  onCropChange: (crop: Point) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (croppedArea: Area, croppedAreaPixels: Area) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/75 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface border border-border p-4">
        <h3 className="mb-4 text-lg font-semibold text-foreground">{title}</h3>
        
        <div className="relative h-64 w-full bg-background rounded-lg overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={title === "Crop Passport Photo" ? 1.5 : 1}
            cropShape={title === "Crop Passport Photo" ? "rect" : "round"}
            showGrid={true}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
            style={{
              containerStyle: {
                width: "100%",
                height: "100%",
                position: "relative",
              },
            }}
          />
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Zoom
            </label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-95"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
