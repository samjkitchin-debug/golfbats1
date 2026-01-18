"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { COUNTRIES } from "@/app/lib/countries";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";

type Step = "welcome" | "profile" | "passport" | "complete";

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  profile_photo_path: string | null;
  onboarding_complete?: boolean;
};

type PassportRow = {
  passport_full_name: string | null;
  passport_country: string | null;
  passport_expiry_date: string | null;
  passport_photo_path: string | null;
};

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [error, setError] = useState<string | null>(null);

  // Profile data
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [nationality, setNationality] = useState("");
  const [declaredHandicap, setDeclaredHandicap] = useState<string>("");
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  
  // Profile photo crop state
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Passport data
  const [passportFullName, setPassportFullName] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportCountry, setPassportCountry] = useState("");
  const [passportExpiryDate, setPassportExpiryDate] = useState("");
  const [passportPhotoPath, setPassportPhotoPath] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingPassport, setSavingPassport] = useState(false);
  
  // Passport photo crop state
  const [showPassportCropModal, setShowPassportCropModal] = useState(false);
  const [passportImageSrc, setPassportImageSrc] = useState<string | null>(null);
  const [passportCrop, setPassportCrop] = useState<Point>({ x: 0, y: 0 });
  const [passportZoom, setPassportZoom] = useState(1);
  const [passportCroppedAreaPixels, setPassportCroppedAreaPixels] = useState<Area | null>(null);

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
        router.push("/login?next=/onboarding");
        return;
      }

      const { data, error: memberErr } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,onboarding_complete")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (memberErr) {
        setError(memberErr.message);
        setLoading(false);
        return;
      }

      const m = (data as MemberRow) ?? null;

      // If onboarding is already complete, redirect to /me
      if (m?.onboarding_complete) {
        router.push("/me");
        return;
      }

      // Load existing data if available
      setFullName(m?.full_name ?? "");
      setDisplayName(m?.display_name ?? "");
      setNationality(m?.nationality ?? "");
      setDeclaredHandicap(
        m?.declared_handicap === null || m?.declared_handicap === undefined
          ? ""
          : String(m.declared_handicap)
      );
      setProfilePhotoPath(m?.profile_photo_path ?? null);

      // Check if profile is already complete to determine starting step
      const profileComplete = !!(m?.full_name && m?.display_name && m?.nationality && m?.declared_handicap !== null);
      if (profileComplete) {
        // Load passport data to see if we should start at passport step
        const { data: passportData } = await supabase
          .from("member_passports")
          .select("passport_full_name,passport_country,passport_expiry_date,passport_photo_path")
          .eq("user_id", user.id)
          .maybeSingle();

        if (passportData) {
          const p = passportData as PassportRow;
          setPassportFullName(p.passport_full_name ?? "");
          setPassportCountry(p.passport_country ?? "");
          setPassportExpiryDate(
            p.passport_expiry_date
              ? new Date(p.passport_expiry_date).toISOString().split("T")[0]
              : ""
          );
          setPassportPhotoPath(p.passport_photo_path ?? null);
        }

        setCurrentStep("passport");
      } else {
        setCurrentStep("welcome");
      }

      setLoading(false);
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

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
    } catch (e: any) {
      setError(e?.message || "Failed to upload photo.");
    } finally {
      setUploadingProfilePhoto(false);
    }
  }

  async function handleSaveProfile() {
    if (savingProfile || profileSaved) return; // Prevent double submission
    
    setSavingProfile(true);
    setError(null);

    const trimmedFullName = fullName.trim();
    const trimmedDisplayName = displayName.trim();
    const trimmedNationality = nationality.trim();
    const handicapTrimmed = declaredHandicap.trim();

    const handicapNum =
      handicapTrimmed === "" ? null : Number(handicapTrimmed);

    // Validation
    if (!trimmedFullName) {
      setSavingProfile(false);
      setError("Please provide your full name.");
      return;
    }

    if (!trimmedDisplayName) {
      setSavingProfile(false);
      setError("Please provide a display name.");
      return;
    }

    if (!trimmedNationality) {
      setSavingProfile(false);
      setError("Please provide your nationality.");
      return;
    }

    // Handicap is optional, but if provided must be valid
    if (handicapNum !== null && (Number.isNaN(handicapNum) || handicapNum < 0 || handicapNum > 36)) {
      setSavingProfile(false);
      setError("Handicap must be a number between 0 and 36.");
      return;
    }

    try {
      const res = await fetch("/onboarding/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: trimmedFullName,
          display_name: trimmedDisplayName,
          nationality: trimmedNationality,
          declared_handicap: handicapNum,
          profile_photo_path: profilePhotoPath,
          onboarding_complete: false, // Don't complete yet, still need passport step
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to save profile.");
      }

      // Mark as saved and advance to passport step
      setProfileSaved(true);
      setCurrentStep("passport");
      // Don't reset savingProfile - keep button disabled
    } catch (e: any) {
      setError(e?.message || "Failed to save profile.");
      setSavingProfile(false); // Only reset on error
    }
  }

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  async function handlePassportPhotoUpload(file: File) {
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

      setPassportPhotoPath(json.path || null);
    } catch (e: any) {
      setError(e?.message || "Failed to upload photo.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function handlePassportPhotoFileSelect(useCamera: boolean) {
    const input = document.getElementById(useCamera ? "passport-photo-camera-input" : "passport-photo-upload-input");
    if (input) {
      input.click();
    }
  }

  async function handleSavePassport(shouldSkip: boolean = false) {
    if (savingPassport) return; // Prevent double submission
    
    setSavingPassport(true);
    setError(null);

    const trimmedFullName = passportFullName.trim();
    const trimmedCountry = passportCountry.trim();
    const trimmedExpiryDate = passportExpiryDate.trim();

    // Validation (all fields required if not skipping)
    if (!shouldSkip) {
      if (!trimmedFullName) {
        setSavingPassport(false);
        setError("Please provide your passport full name.");
        return;
      }

      if (!trimmedCountry) {
        setSavingPassport(false);
        setError("Please provide your passport country.");
        return;
      }

      if (!trimmedExpiryDate) {
        setSavingPassport(false);
        setError("Please provide your passport expiry date.");
        return;
      }
    }

    try {
      if (!shouldSkip) {
        // Save passport data
        const passportBody = {
          passport_full_name: trimmedFullName,
          passport_number: passportNumber.trim(),
          passport_country: trimmedCountry,
          passport_expiry_date: trimmedExpiryDate,
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

      // Mark onboarding as complete
      const res = await fetch("/onboarding/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          display_name: displayName.trim(),
          nationality: nationality.trim(),
          declared_handicap: declaredHandicap ? Number(declaredHandicap) : null,
          onboarding_complete: true,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "Failed to complete onboarding.");
      }

      // Advance to completion step
      setCurrentStep("complete");
      // Don't reset savingPassport - keep button disabled
    } catch (e: any) {
      setError(e?.message || "Failed to save passport.");
      setSavingPassport(false); // Only reset on error
    }
  }

  function handleSkipPassport() {
    handleSavePassport(true);
  }

  async function handleComplete() {
    // Ensure onboarding is marked complete (in case it wasn't already)
    try {
      const res = await fetch("/onboarding/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          display_name: displayName.trim(),
          nationality: nationality.trim(),
          declared_handicap: declaredHandicap ? Number(declaredHandicap) : null,
          onboarding_complete: true,
        }),
      });

      // Even if this fails, redirect to /me (onboarding_complete should already be true from passport step)
      if (!res.ok) {
        console.warn("Failed to ensure onboarding_complete, but continuing anyway");
      }
    } catch (e) {
      console.warn("Error ensuring onboarding_complete:", e);
    }

    // Redirect to Me page
    router.push("/me");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="px-4 pb-24 pt-4">
        <div className="text-center text-muted">Loading...</div>
      </div>
    );
  }

  // Step indicator
  const steps = [
    { id: "welcome", label: "Welcome" },
    { id: "profile", label: "Profile" },
    { id: "passport", label: "Passport" },
    { id: "complete", label: "Complete" },
  ];
  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="px-4 pb-24 pt-4">
      {/* Step indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium ${
                    index <= currentStepIndex
                      ? "border-foreground bg-anticipation text-anticipation-fg"
                      : "border-border bg-surface text-muted"
                  }`}
                >
                  {index + 1}
                </div>
                <div
                  className={`mt-2 text-xs font-medium ${
                    index <= currentStepIndex ? "text-foreground" : "text-muted"
                  }`}
                >
                  {step.label}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 ${
                    index < currentStepIndex ? "bg-foreground" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger bg-danger-light p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Step 1: Welcome */}
      {currentStep === "welcome" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Quick setup</h1>
            <p className="mt-2 text-sm text-muted">
              A few basics, then you're in.
            </p>
          </div>

          <div className="space-y-4 text-sm text-foreground">
            <p>We'll ask you for:</p>
            <ul className="space-y-2 ml-4">
              <li className="list-disc">Basic profile details</li>
              <li className="list-disc">Profile photo (optional but recommended)</li>
              <li className="list-disc">Passport details (optional, only required for some trips)</li>
            </ul>
            <p className="text-muted">
              You can skip passport details if you're not ready to provide them yet.
            </p>
          </div>

          <button
            onClick={() => setCurrentStep("profile")}
            className="w-full rounded-lg btn-anticipation px-4 py-3 text-sm font-medium hover:opacity-90"
          >
            Get started
          </button>
        </div>
      )}

      {/* Step 2: Basic Profile */}
      {currentStep === "profile" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Basic Profile</h1>
            <p className="mt-2 text-sm text-muted">
              Tell us a bit about yourself.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Full name <span className="text-warning">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
                placeholder="John Smith"
                disabled={savingProfile}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Display name <span className="text-warning">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
                placeholder="John"
                disabled={savingProfile}
              />
              <p className="mt-1 text-xs text-muted">
                This is how your name will appear to other members.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Nationality <span className="text-warning">*</span>
              </label>
              <select
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none bg-surface"
                disabled={savingProfile}
              >
                <option value="">Select nationality</option>
                {COUNTRIES.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Handicap
              </label>
              <input
                type="number"
                min="0"
                max="36"
                step="0.1"
                value={declaredHandicap}
                onChange={(e) => setDeclaredHandicap(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
                placeholder="18 (optional)"
                disabled={savingProfile || profileSaved}
              />
              <p className="mt-1 text-xs text-muted">
                Optional. Your handicap must be between 0 and 36.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Profile photo
              </label>
              <div className="mt-2 flex items-center gap-3">
                {profilePhotoPath ? (
                  <img
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${profilePhotoPath}`}
                    alt="Profile"
                    className="h-16 w-16 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full border border-border bg-background flex items-center justify-center text-sm font-medium text-muted">
                    {displayName ? getInitials(displayName) : fullName ? getInitials(fullName) : "?"}
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
                    disabled={uploadingProfilePhoto || savingProfile || profileSaved}
                  />
                  <button
                    type="button"
                    onClick={() => document.getElementById("profile-photo-input")?.click()}
                    disabled={uploadingProfilePhoto || savingProfile || profileSaved}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {profilePhotoPath ? "Change Photo" : "Add Photo"}
                  </button>
                  {uploadingProfilePhoto && (
                    <p className="mt-1 text-xs text-muted">Uploading photo...</p>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted">
                Optional but recommended. This helps other members recognize you.
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile || profileSaved}
            className="w-full rounded-lg btn-anticipation px-4 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingProfile ? "Saving..." : profileSaved ? "Saved" : "Save & continue"}
          </button>
        </div>
      )}

      {/* Step 3: Passport Details (Optional) */}
      {currentStep === "passport" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Passport Details</h1>
            <p className="mt-2 text-sm text-muted">
              Passport details are only required for trips involving travel.
              You can skip this and add it later if needed.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground">
                Passport full name
              </label>
              <input
                type="text"
                value={passportFullName}
                onChange={(e) => setPassportFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
                placeholder="As shown on your passport"
                disabled={savingPassport}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Passport number
              </label>
              <input
                type="text"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
                placeholder="Enter passport number"
                disabled={savingPassport}
              />
              <p className="mt-1 text-xs text-muted">
                Your passport number is encrypted and stored securely.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Passport country
              </label>
              <input
                type="text"
                value={passportCountry}
                onChange={(e) => setPassportCountry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
                placeholder="e.g. United Kingdom"
                disabled={savingPassport}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Passport expiry date
              </label>
              <input
                type="date"
                value={passportExpiryDate}
                onChange={(e) => setPassportExpiryDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-border focus:outline-none"
                disabled={savingPassport}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground">
                Passport photo
              </label>
              
              {/* Photo preview */}
              {passportPhotoPath && (
                <div className="mt-2 mb-3">
                  <img
                    src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${passportPhotoPath}`}
                    alt="Passport photo"
                    className="h-32 w-auto rounded-lg border border-border object-contain"
                  />
                </div>
              )}
              
              {/* Upload/Take photo buttons */}
              <div className="mt-2 flex gap-2">
                <input
                  id="passport-photo-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.addEventListener("load", () => {
                        setPassportImageSrc(reader.result as string);
                        setShowPassportCropModal(true);
                        setPassportZoom(1);
                        setPassportCrop({ x: 0, y: 0 });
                      });
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                  disabled={uploadingPhoto || savingPassport}
                />
                <input
                  id="passport-photo-camera-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.addEventListener("load", () => {
                        setPassportImageSrc(reader.result as string);
                        setShowPassportCropModal(true);
                        setPassportZoom(1);
                        setPassportCrop({ x: 0, y: 0 });
                      });
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                  disabled={uploadingPhoto || savingPassport}
                />
                <button
                  type="button"
                  onClick={() => handlePassportPhotoFileSelect(false)}
                  disabled={uploadingPhoto || savingPassport}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Upload photo
                </button>
                <button
                  type="button"
                  onClick={() => handlePassportPhotoFileSelect(true)}
                  disabled={uploadingPhoto || savingPassport}
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Take photo
                </button>
              </div>
              {uploadingPhoto && (
                <p className="mt-1 text-xs text-muted">Uploading photo...</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleSavePassport(false)}
              disabled={savingPassport}
              className="w-full rounded-lg btn-anticipation px-4 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingPassport ? "Saving..." : "Save passport"}
            </button>
            <button
              onClick={handleSkipPassport}
              disabled={savingPassport}
              className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Completion */}
      {currentStep === "complete" && (
        <div className="space-y-6 text-center">
          <div>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-anticipation/10">
              <svg
                className="h-8 w-8 text-anticipation"
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
            </div>
            <h1 className="mt-4 text-2xl font-bold">Setup complete</h1>
            <p className="mt-2 text-sm text-muted">
              Your profile has been set up successfully.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-background p-4 text-left">
            <p className="text-sm text-foreground">
              <span className="font-medium">Your membership is pending admin approval.</span> You will be notified once your account has been approved.
            </p>
          </div>

          <button
            onClick={handleComplete}
            className="w-full rounded-lg btn-anticipation px-4 py-3 text-sm font-medium hover:opacity-90"
          >
            Go to profile
          </button>
        </div>
      )}

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
              await handleProfilePhotoUpload(file);
            } catch (e: any) {
              setError(e?.message || "Failed to crop and upload photo.");
            } finally {
              setUploadingProfilePhoto(false);
              setImageSrc(null);
            }
          }}
        />
      )}

      {/* Passport Photo Crop Modal */}
      {showPassportCropModal && passportImageSrc && (
        <ImageCropModal
          title="Crop Passport Photo"
          imageSrc={passportImageSrc}
          crop={passportCrop}
          zoom={passportZoom}
          onCropChange={setPassportCrop}
          onZoomChange={setPassportZoom}
          onCropComplete={(croppedArea, croppedAreaPixels) => {
            setPassportCroppedAreaPixels(croppedAreaPixels);
          }}
          onCancel={() => {
            setShowPassportCropModal(false);
            setPassportImageSrc(null);
          }}
          onSave={async () => {
            if (!passportCroppedAreaPixels || !passportImageSrc) return;
            
            setShowPassportCropModal(false);
            setUploadingPhoto(true);
            
            try {
              const croppedImage = await getCroppedImg(passportImageSrc, passportCroppedAreaPixels);
              const blob = await fetch(croppedImage).then((r) => r.blob());
              const file = new File([blob], "passport.jpg", { type: "image/jpeg" });
              await handlePassportPhotoUpload(file);
            } catch (e: any) {
              setError(e?.message || "Failed to crop and upload photo.");
            } finally {
              setUploadingPhoto(false);
              setPassportImageSrc(null);
            }
          }}
        />
      )}
    </div>
  );
}

// Helper functions for image cropping
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
  const isPassport = title === "Crop Passport Photo";
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "var(--overlay-scrim)" }}>
      <div className="w-full max-w-md rounded-xl bg-surface p-4">
        <h3 className="mb-4 text-lg font-semibold text-foreground">{title}</h3>
        
        <div className="relative h-64 w-full bg-background rounded-lg overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={isPassport ? 1.5 : 1}
            cropShape={isPassport ? "rect" : "round"}
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
              className="flex-1 rounded-lg border border-anticipation bg-surface px-4 py-2 text-sm font-medium text-anticipation hover:bg-anticipation/5"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="flex-1 rounded-lg btn-anticipation px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
