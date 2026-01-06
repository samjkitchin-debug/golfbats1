"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { COUNTRIES } from "@/app/lib/countries";

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
};

type SaveBody = {
  full_name: string;
  display_name: string;
  nationality: string;
  declared_handicap: number | null;
};

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

  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nationality, setNationality] = useState("");
  const [declaredHandicap, setDeclaredHandicap] = useState<string>("");

  // Passport fields
  const [passportEnabled, setPassportEnabled] = useState(false);
  const [passportFullName, setPassportFullName] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportCountry, setPassportCountry] = useState("");
  const [passportExpiryDate, setPassportExpiryDate] = useState("");
  const [passportPhotoPath, setPassportPhotoPath] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
        .select("id,email,full_name,display_name,nationality,declared_handicap")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (memberErr) {
        setError(memberErr.message);
        setLoading(false);
        return;
      }

      const m = (data as MemberRow) ?? null;

      setFullName(m?.full_name ?? "");
      setDisplayName(m?.display_name ?? "");
      setNationality(m?.nationality ?? "");
      setDeclaredHandicap(
        m?.declared_handicap === null || m?.declared_handicap === undefined
          ? ""
          : String(m.declared_handicap)
      );

      // Check if passport feature is enabled (check NEXT_PUBLIC env var)
      // Default to enabled if env var not set (for development/testing)
      const passportFeatureEnabled =
        process.env.NEXT_PUBLIC_PASSPORT_ENABLED !== "false";
      setPassportEnabled(passportFeatureEnabled);

      // Load passport data if feature is enabled
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

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
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
      setUploadingPhoto(false);
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

    // Strict client-side validation to match server:
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

      // Save passport data if feature is enabled
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

        const passportJson = await passportRes.json().catch(() => ({}));

        if (!passportRes.ok) {
          throw new Error(passportJson?.error || "Failed to save passport data.");
        }
      }

      // If profile was required, redirect to home; otherwise go to profile page
      if (profileRequired) {
        router.push("/");
      } else {
        router.push("/me");
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{profileRequired ? "Create profile" : "Edit profile"}</h1>
          <p className="mt-1 text-sm">
            {profileRequired
              ? "Please complete your basic profile to continue."
              : "Update your details for GolfBats."}
          </p>
        </div>

        {!profileRequired && (
          <Link
            href="/me"
            className="rounded-xl border border-black px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </Link>
        )}
      </div>

      {profileRequired ? (
        <div className="mt-4 rounded-2xl border-2 border-amber-500 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Profile Required</p>
          <p className="mt-1 text-sm text-amber-800">
            Please complete your profile before continuing. Your full name, display name, nationality and declared handicap are required.
            Passport details are optional now and can be added later, but you’ll need them before you can join a trip.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-black p-4">
          <p className="text-sm font-semibold">Error</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      ) : null}

      <div className="mt-4 rounded-2xl border border-black p-4">
        {loading ? (
          <p className="text-sm">Loading…</p>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!saving) onSave();
            }}
          >
            <Field label="Full name">
              <input
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. John Smith"
                autoComplete="name"
              />
            </Field>

            <Field label="Display name">
              <input
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Sam"
              />
            </Field>

            <Field label="Nationality">
              <select
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none bg-white"
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
            </Field>

            <Field label="Declared handicap">
              <input
                className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                value={declaredHandicap}
                onChange={(e) => setDeclaredHandicap(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 18.2"
              />
              <p className="mt-2 text-xs">
                This is your declared handicap for coordination purposes (not a scoring engine).
              </p>
            </Field>

            {/* Passport Section */}
            {passportEnabled ? (
              <>
                <div className="mt-6 border-t border-gray-200 pt-6">
                  <div className="text-sm font-semibold mb-4">Passport details</div>

                  <Field label="Passport full name">
                    <input
                      className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                      value={passportFullName}
                      onChange={(e) => setPassportFullName(e.target.value)}
                      placeholder="As shown on your passport"
                    />
                  </Field>

                  <Field label="Passport number">
                    <input
                      className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value)}
                      placeholder="Enter passport number"
                      type="text"
                    />
                    <p className="mt-2 text-xs">
                      Your passport number is encrypted and stored securely.
                    </p>
                  </Field>

                  <Field label="Passport country">
                    <input
                      className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
                      value={passportCountry}
                      onChange={(e) => setPassportCountry(e.target.value)}
                      placeholder="e.g. United Kingdom"
                    />
                  </Field>

                  <Field label="Passport expiry date">
                    <input
                      className="w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
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
                            handlePhotoUpload(file);
                          }
                        }}
                        className="hidden"
                        disabled={uploadingPhoto}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById("passport-photo-input")?.click()
                        }
                        disabled={uploadingPhoto}
                        className="inline-flex items-center rounded-full border border-black bg-white px-3 py-1.5 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60"
                      >
                        {passportPhotoPath ? "Change photo" : "Add photo"}
                      </button>
                      <p className="mt-2 text-xs text-gray-600">
                        You can use your camera or select an existing file.
                      </p>
                      {uploadingPhoto && (
                        <p className="mt-2 text-xs text-gray-600">Uploading photo…</p>
                      )}
                      {passportPhotoPath && !uploadingPhoto && (
                        <p className="mt-2 text-xs text-green-600">
                          Photo uploaded successfully
                        </p>
                      )}
                    </div>
                  </Field>
                </div>
              </>
            ) : (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <div className="text-sm font-semibold mb-2">Passport details</div>
                <p className="text-sm text-gray-600">
                  Passport details will be added once appropriate security has been implemented.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={saving || uploadingPhoto}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}
