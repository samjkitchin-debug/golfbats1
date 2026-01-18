"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { COUNTRIES } from "@/app/lib/countries";

const UNIQUE_COUNTRIES = Array.from(new Set(COUNTRIES)).sort((a, b) => a.localeCompare(b));

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  profile_photo_path: string | null;
};

type SaveBody = {
  full_name: string;
  display_name: string;
  nationality: string;
  declared_handicap: number | null;
};

function getInitials(member: MemberRow | null): string {
  if (!member) return "";
  const fn = member.full_name || "";
  const dn = member.display_name || "";
  const name = fn || dn || "";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name[0]?.toUpperCase() || "";
}

export default function MeEditPage() {
  const router = useRouter();

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // Check if profile creation is required (from URL param)
  const [profileRequired, setProfileRequired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setProfileRequired(params.get("required") === "true");
  }, []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<MemberRow | null>(null);

  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nationality, setNationality] = useState("");
  const [declaredHandicap, setDeclaredHandicap] = useState<string>("");
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);

  // Passport fields
  const [passportEnabled, setPassportEnabled] = useState(false);
  const [passportFullName, setPassportFullName] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportCountry, setPassportCountry] = useState("");
  const [passportExpiryDate, setPassportExpiryDate] = useState("");
  const [passportPhotoPath, setPassportPhotoPath] = useState<string | null>(null);
  const [uploadingPassportPhoto, setUploadingPassportPhoto] = useState(false);
  const [passportExpanded, setPassportExpanded] = useState(false);

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
        setError("You are not signed in.");
        setLoading(false);
        return;
      }

      const { data, error: memberErr } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (memberErr) {
        setError(memberErr.message);
        setLoading(false);
        return;
      }

      const m = (data as MemberRow) ?? null;
      setMember(m);

      setFullName(m?.full_name ?? "");
      setDisplayName(m?.display_name ?? "");
      setNationality(m?.nationality ?? "");
      setDeclaredHandicap(
        m?.declared_handicap === null || m?.declared_handicap === undefined
          ? ""
          : String(m.declared_handicap)
      );
      setProfilePhotoPath(m?.profile_photo_path ?? null);

      // Check if passport feature is enabled (check NEXT_PUBLIC env var)
      // Default to enabled if env var not set (for development/testing)
      const passportFeatureEnabled =
        process.env.NEXT_PUBLIC_PASSPORT_ENABLED !== "false";
      setPassportEnabled(passportFeatureEnabled);

      // Auto-expand passport section if it has data
      if (passportFeatureEnabled && user) {
        const { data: passportData } = await supabase
          .from("member_passports")
          .select("passport_full_name,passport_country,passport_expiry_date,passport_photo_path")
          .eq("user_id", user.id)
          .maybeSingle();

        if (passportData) {
          setPassportFullName(passportData.passport_full_name ?? "");
          setPassportCountry(passportData.passport_country ?? "");
          setPassportExpiryDate(
            passportData.passport_expiry_date
              ? new Date(passportData.passport_expiry_date).toISOString().split("T")[0]
              : ""
          );
          setPassportPhotoPath(passportData.passport_photo_path ?? null);
          // Auto-expand if there's existing data
          if (passportData.passport_full_name || passportData.passport_country || passportData.passport_expiry_date) {
            setPassportExpanded(true);
          }
          // Note: passport_number is encrypted, we don't load it for display
          // User will need to re-enter it if they want to update
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleProfilePhotoUpload(file: File) {
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

      setProfilePhotoPath(json.path);
      
      // Reload member data to sync state
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("members")
          .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path")
          .eq("id", user.id)
          .maybeSingle();
        if (data) {
          setMember(data as MemberRow);
        }
      }
    } catch (e: any) {
      setError(e?.message || "Failed to upload photo.");
    } finally {
      setUploadingProfilePhoto(false);
    }
  }

  async function handlePassportPhotoUpload(file: File) {
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
        throw new Error(json?.error || "Failed to upload photo.");
      }

      setPassportPhotoPath(json.path);
    } catch (e: any) {
      setError(e?.message || "Failed to upload photo.");
    } finally {
      setUploadingPassportPhoto(false);
    }
  }

  async function onSave() {
    setSaving(true);
    setError(null);

    const trimmedFullName = fullName.trim();
    const trimmedDisplayName = displayName.trim();
    const trimmedNationality = nationality.trim();
    const handicapTrimmed = declaredHandicap.trim();

    const handicapNum =
      handicapTrimmed === "" ? Number.NaN : Number(handicapTrimmed);

    // Only validate basics fields when required=true
    if (profileRequired) {
      if (!trimmedFullName) {
        setSaving(false);
        setError("Please provide your full name.");
        return;
      }

      if (!trimmedDisplayName) {
        setSaving(false);
        setError("Please provide a display name.");
        return;
      }

      if (!trimmedNationality) {
        setSaving(false);
        setError("Please provide your nationality.");
        return;
      }

      if (Number.isNaN(handicapNum) || handicapNum < 0 || handicapNum > 36) {
        setSaving(false);
        setError("Declared handicap must be a number between 0 and 36.");
        return;
      }
    }

    const body: SaveBody = {
      full_name: trimmedFullName,
      display_name: trimmedDisplayName,
      nationality: trimmedNationality,
      declared_handicap: handicapNum,
    };

    try {
      const res = await fetch("/me/edit/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to save profile.");
      }

      // Save passport data if feature is enabled (optional, never blocking)
      if (passportEnabled) {
        const passportBody = {
          passport_full_name: passportFullName.trim(),
          passport_number: passportNumber.trim(),
          passport_country: passportCountry.trim(),
          passport_expiry_date: passportExpiryDate.trim(),
          passport_photo_path: passportPhotoPath,
        };

        const passportRes = await fetch("/me/passport/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(passportBody),
        });

        // Passport save failures are non-blocking (ignore errors)
        if (passportRes.ok) {
          // Success - no action needed
        }
      }

      // After save, check group membership to determine redirect
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        router.push("/login");
        return;
      }

      // Check if user has at least one approved group membership
      const { data: memberships, error: membershipErr } = await supabase
        .from("group_members")
        .select("group_id, status")
        .eq("user_id", currentUser.id)
        .eq("status", "approved")
        .limit(1);

      // If user has zero approved group memberships -> redirect to / (member landing)
      if (membershipErr || !memberships || memberships.length === 0) {
        router.push("/");
      } else {
        // User has approved membership -> redirect based on profileRequired
        if (profileRequired) {
          router.push("/");
        } else {
          router.push("/me");
        }
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pb-24 pt-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Create your profile</h1>
          <p className="mt-1 text-sm text-muted">
            This helps your mates recognise you and makes organising golf smoother.
          </p>
        </div>

        {!profileRequired && (
          <Link
            href="/me"
                    className="rounded-xl border border-border px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </Link>
        )}
      </div>

      {/* Info callout */}
      {profileRequired && (
        <div className="mb-4 rounded-2xl border border-border bg-surface/50 p-4">
          <p className="text-sm font-semibold text-foreground">Just the basics for now</p>
          <p className="mt-1 text-sm text-muted">
            Passport details are optional and only needed for certain overseas trips. You can add them later.
          </p>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-4 rounded-2xl border border-danger bg-danger-light p-4">
          <p className="text-sm font-semibold text-danger">Error</p>
          <p className="mt-1 text-sm text-danger">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-border p-8 text-center">
          <p className="text-sm">Loading…</p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!saving) onSave();
          }}
          className="space-y-4"
        >
          {/* Basics Card */}
          <div className="rounded-2xl border border-border p-4 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Basics</h2>
            </div>

            {/* Profile Photo */}
            <div>
              <div className="text-sm font-semibold">Profile photo</div>
              <div className="mt-2 flex items-center gap-3">
                {profilePhotoPath ? (
                  <img
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${profilePhotoPath}`}
                    alt="Profile"
                    className="h-16 w-16 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full border border-border bg-background flex items-center justify-center text-sm font-semibold text-foreground">
                    {getInitials(member)}
                  </div>
                )}
                <div className="flex-1">
                  <input
                    id="profile-photo-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleProfilePhotoUpload(file);
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
                    <p className="mt-1 text-xs text-muted">Uploading…</p>
                  )}
                  <p className="mt-1 text-xs text-muted">Optional for now, but recommended.</p>
                </div>
              </div>
            </div>

            {/* Full Name */}
            <Field label="Full name" required={profileRequired}>
              <input
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Smith"
                autoComplete="name"
              />
            </Field>

            {/* Display Name */}
            <Field label="Display name" required={profileRequired}>
              <input
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam"
              />
            </Field>

            {/* Nationality */}
            <Field label="Nationality" required={profileRequired}>
              <select
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none bg-surface"
                value={nationality || ""}
                onChange={(e) => setNationality(e.target.value)}
              >
                <option value="" disabled>
                  Select nationality…
                </option>
                {UNIQUE_COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </Field>

            {/* Declared Handicap */}
            <Field label="Declared handicap" required={profileRequired}>
              <input
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                value={declaredHandicap}
                onChange={(e) => setDeclaredHandicap(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 18.2"
              />
              <p className="mt-2 text-xs text-muted">
                Used for coordination (not a scoring engine).
              </p>
            </Field>
          </div>
          {/* End Basics Card */}

          {/* Passport Section - Collapsible */}
          {passportEnabled && (
            <div className="rounded-2xl border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setPassportExpanded(!passportExpanded)}
                className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-background"
              >
                <div>
                  <div className="text-sm font-semibold">Travel documents (optional)</div>
                  <div className="mt-0.5 text-xs text-muted">
                    Only needed for certain overseas trips. You can add this anytime.
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 text-muted transition-transform ${passportExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {passportExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                  <Field label="Passport full name">
                    <input
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                      value={passportFullName}
                      onChange={(e) => setPassportFullName(e.target.value)}
                      placeholder="As shown on your passport"
                    />
                  </Field>

                  <Field label="Passport number">
                    <input
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value)}
                      placeholder="Enter passport number"
                      type="text"
                    />
                    <p className="mt-2 text-xs text-muted">
                      Your passport number is encrypted and stored securely.
                    </p>
                  </Field>

                  <Field label="Passport country">
                    <input
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                      value={passportCountry}
                      onChange={(e) => setPassportCountry(e.target.value)}
                      placeholder="e.g. United Kingdom"
                    />
                  </Field>

                  <Field label="Passport expiry date">
                    <input
                      className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none"
                      value={passportExpiryDate}
                      onChange={(e) => setPassportExpiryDate(e.target.value)}
                      type="date"
                    />
                  </Field>

                  <Field label="Passport photo (optional)">
                    <div>
                      <input
                        id="passport-photo-input"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handlePassportPhotoUpload(file);
                          }
                        }}
                        className="hidden"
                        disabled={uploadingPassportPhoto}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById("passport-photo-input")?.click()
                        }
                        disabled={uploadingPassportPhoto}
                        className="inline-flex items-center rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold hover:bg-background disabled:opacity-60"
                      >
                        {passportPhotoPath ? "Change Photo" : "Add Photo"}
                      </button>
                      <p className="mt-2 text-xs text-muted">
                        You can use your camera or select an existing file.
                      </p>
                      {uploadingPassportPhoto && (
                        <p className="mt-2 text-xs text-muted">Uploading…</p>
                      )}
                      {passportPhotoPath && !uploadingPassportPhoto && (
                        <p className="mt-2 text-xs text-anticipation">
                          Photo uploaded successfully
                        </p>
                      )}
                    </div>
                  </Field>
                </div>
              )}
            </div>
          )}

          {/* Save Button */}
          <button
            type="submit"
            disabled={saving || uploadingProfilePhoto || uploadingPassportPhoto}
            className="w-full rounded-xl btn-primary px-4 py-3 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <div className="text-sm font-semibold">
        {label}
        {required && <span className="text-warning ml-1">*</span>}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
