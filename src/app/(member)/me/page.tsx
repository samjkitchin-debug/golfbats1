"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { COUNTRIES } from "@/app/lib/countries";

type MemberStatus = "pending" | "active" | string;

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  profile_photo_path: string | null;
  created_at: string;
  last_seen: string | null;
  status: MemberStatus;
  is_admin: boolean;
};

type PassportRow = {
  passport_full_name: string | null;
  passport_country: string | null;
  passport_expiry_date: string | null;
  passport_photo_path: string | null;
};

export default function MePage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<MemberRow | null>(null);
  const [passport, setPassport] = useState<PassportRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

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
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Passport data (for checking if passport exists - no inline editing)
  // Passport editing is handled on /me/passport page

  useEffect(() => {
    document.title = "GolfBats - Profile";
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

      const { data, error: memberErr } = await supabase
        .from("members")
        .select(
          "id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen,status,is_admin"
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

      // Load passport data
      const { data: passportData } = await supabase
        .from("member_passports")
        .select("passport_full_name,passport_country,passport_expiry_date,passport_photo_path")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (passportData) {
        const p = passportData as PassportRow;
        setPassport(p);
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const titleName =
    member?.display_name?.trim() ||
    member?.full_name?.trim() ||
    member?.email?.trim() ||
    "Me";

  const isApproved = (member?.status ?? "pending") === "active";
  const passportComplete =
    !!passport?.passport_full_name &&
    !!passport?.passport_country &&
    !!passport?.passport_expiry_date;

  // Check if required profile fields are missing
  const profileIncomplete =
    !member?.full_name?.trim() ||
    !member?.display_name?.trim() ||
    !member?.nationality?.trim();

  return (
    <div className="px-4 pb-24 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Me</h1>
          <p className="mt-1 text-sm">
            {loading ? "Loading…" : titleName}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-xl bg-brand-red px-4 py-2 text-sm font-semibold text-white"
            >
              Admin
            </Link>
          )}
        </div>
      </div>

      {/* Welcome orientation block - shown when profile is incomplete */}
      {!loading && !error && member && profileIncomplete && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Welcome to GolfBats</p>
          <p className="mt-1 text-sm text-gray-700">
            You're joining a private golf group. To get you set up, we just need a few basic details. You can update everything later.
          </p>
        </div>
      )}

      {/* Profile completion reminder */}
      {!loading && !error && member && profileIncomplete && (
        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Complete your profile</p>
          <p className="mt-1 text-sm text-gray-700">
            This helps organisers place you in groups and manage travel when required. You can update everything later.
          </p>
        </div>
      )}

      {/* Status & trip eligibility pills */}
      {!loading && !error && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 font-medium ${
              isApproved
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            Status: {isApproved ? "Active" : "Pending approval"}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 font-medium ${
              passportComplete
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            Trips:{" "}
            {passportComplete ? "Ready to join trips" : "Add passport details before joining trips"}
          </span>
        </div>
      )}

      {/* Pending approval status message */}
      {!loading && !error && member && !isApproved && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-sm text-gray-700">
            Membership pending approval. An organiser will review your details shortly.
          </p>
        </div>
      )}

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">Error</p>
          <p className="mt-1 text-sm text-red-900">{error}</p>
        </div>
      ) : null}

      {profileSaveSuccess ? (
        <div className="mt-4 rounded-2xl border border-green-400 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-900">Profile saved</p>
          <p className="mt-1 text-sm text-green-900">Your profile has been updated successfully.</p>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {/* Profile Block */}
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
              setDeclaredHandicap(
                member?.declared_handicap === null || member?.declared_handicap === undefined
                  ? ""
                  : String(member.declared_handicap)
              );
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
          declaredHandicap={declaredHandicap}
          setDeclaredHandicap={(v) => {
            setDeclaredHandicap(v);
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

            const handicapNum =
              declaredHandicap.trim() === ""
                ? null
                : Number(declaredHandicap.trim());

            if (handicapNum !== null && (Number.isNaN(handicapNum) || handicapNum < 0 || handicapNum > 36)) {
              setError("Declared handicap must be a number between 0 and 36 (or blank).");
              setSavingProfile(false);
              return;
            }

            try {
              const res = await fetch("/me/edit/save", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  full_name: fullName.trim(),
                  display_name: displayName.trim(),
                  nationality: nationality.trim(),
                  declared_handicap: handicapNum,
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
                  .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen")
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
        />

        {/* Passport details section - optional and deferrable */}
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3">
            <div className="text-sm font-semibold text-gray-900">Passport details (optional)</div>
            <p className="mt-1 text-xs text-gray-600">
              Only required for trips involving travel (e.g. ferries). You can add this later.
            </p>
          </div>
          <Link
            href="/me/passport"
            className="inline-block rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Add passport details
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-200 p-3">
          <div className="text-xs font-medium text-gray-600">Data security</div>

          <div className="mt-2 space-y-2 text-xs text-gray-600 leading-relaxed">
            <div>
              <div className="font-medium text-gray-700">Protection measures</div>
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li>Passport numbers are encrypted using AES-256-GCM with server-side key management and cannot be read by anyone except authorised administrators with proper access controls</li>
                <li>You can view, update, or delete your own passport information at any time</li>
                <li>All administrator access to passport data is logged and audited</li>
                <li>Images are stored securely and are only accessible to you and authorised administrators</li>
              </ul>
            </div>

            <div>
              <div className="font-medium text-gray-700">Disclaimer</div>
              <p className="mt-1">
                Passport information is collected only to organise trip logistics, such as ferry bookings and travel arrangements. Please do not upload passport data unless it is required for a specific trip you are attending. Your passport information may be deleted after the relevant trip is completed.
              </p>
            </div>
          </div>
        </div>
      </div>
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
  declaredHandicap,
  setDeclaredHandicap,
  profilePhotoPath,
  setProfilePhotoPath,
  uploadingProfilePhoto,
  setUploadingProfilePhoto,
  saving,
  saved,
  onSave,
  onProfilePhotoUpload,
  showCropModal,
  imageSrc,
  crop,
  zoom,
  croppedAreaPixels,
  setShowCropModal,
  setImageSrc,
  setCrop,
  setZoom,
  setCroppedAreaPixels,
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
  declaredHandicap: string;
  setDeclaredHandicap: (v: string) => void;
  profilePhotoPath: string | null;
  setProfilePhotoPath: (v: string | null) => void;
  uploadingProfilePhoto: boolean;
  setUploadingProfilePhoto: (v: boolean) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => Promise<void>;
  onProfilePhotoUpload: (file: File) => Promise<void>;
  showCropModal: boolean;
  imageSrc: string | null;
  crop: Point;
  zoom: number;
  croppedAreaPixels: Area | null;
  setShowCropModal: (v: boolean) => void;
  setImageSrc: (v: string | null) => void;
  setCrop: (v: Point) => void;
  setZoom: (v: number) => void;
  setCroppedAreaPixels: (v: Area | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-black p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-semibold">Profile</div>
          <p className="mt-0.5 text-xs text-gray-600">
            This helps organisers place you in groups and manage trips.
          </p>
        </div>
        <button
          onClick={onToggleEdit}
          className="rounded-xl border border-black px-3 py-1 text-xs font-semibold hover:bg-gray-50"
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
                  className="h-16 w-16 rounded-full object-cover border border-gray-300"
                />
              ) : (
                <div className="h-16 w-16 rounded-full border border-gray-300 bg-gray-200 flex items-center justify-center text-sm font-semibold text-gray-700">
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
                  className="rounded-xl border border-black bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                >
                  {profilePhotoPath ? "Change Photo" : "Add Photo"}
                </button>
                {uploadingProfilePhoto && (
                  <p className="mt-1 text-xs text-gray-600">Uploading photo…</p>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold">Email</div>
            <div className="mt-1 text-sm text-gray-600">{member?.email ?? "—"}</div>
            <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
          </div>

          <div>
            <div className="text-xs font-semibold">Full name</div>
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Smith"
            />
          </div>

          <div>
            <div className="text-xs font-semibold">Display name</div>
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sam"
            />
          </div>

          <div>
            <div className="text-xs font-semibold">Nationality</div>
            <select
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none bg-white"
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

          <div>
            <div className="text-xs font-semibold">Declared handicap</div>
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={declaredHandicap}
              onChange={(e) => setDeclaredHandicap(e.target.value)}
              inputMode="decimal"
              placeholder="e.g. 18.2"
            />
          </div>

          {/* Profile Photo Crop Modal */}
          {showCropModal && imageSrc && (
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
            className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <div className="mb-3 flex justify-center">
            {member?.profile_photo_path ? (
              <img
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`}
                alt="Profile"
                className="h-24 w-24 rounded-full object-cover border border-gray-300"
              />
            ) : (
              <div className="h-24 w-24 rounded-full border border-gray-300 bg-gray-200 flex items-center justify-center text-lg font-semibold text-gray-700">
                {getInitials(member)}
              </div>
            )}
          </div>
          <Row label="Email" value={member?.email ?? "—"} />
          <Row label="Full name" value={member?.full_name ?? "—"} />
          <Row label="Display name" value={member?.display_name ?? "—"} />
          <Row label="Nationality" value={member?.nationality ?? "—"} />
          <Row
            label="Declared handicap"
            value={
              member?.declared_handicap === null ||
              member?.declared_handicap === undefined
                ? "—"
                : String(member.declared_handicap)
            }
          />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">{title}</h3>
        
        <div className="relative h-64 w-full bg-gray-100 rounded-lg overflow-hidden">
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
            <label className="block text-xs font-medium text-gray-700 mb-1">
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
              className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="flex-1 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
