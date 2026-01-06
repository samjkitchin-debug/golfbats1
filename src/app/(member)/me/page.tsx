"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";

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

  // Passport photo crop state
  const [showPassportCropModal, setShowPassportCropModal] = useState(false);
  const [passportImageSrc, setPassportImageSrc] = useState<string | null>(null);
  const [passportCrop, setPassportCrop] = useState<Point>({ x: 0, y: 0 });
  const [passportZoom, setPassportZoom] = useState(1);
  const [passportCroppedAreaPixels, setPassportCroppedAreaPixels] = useState<Area | null>(null);

  // Passport edit state
  const [editingPassport, setEditingPassport] = useState(false);
  const [passportSaved, setPassportSaved] = useState(false);
  const [passportFullName, setPassportFullName] = useState("");
  const [passportNumber, setPassportNumber] = useState("");
  const [passportCountry, setPassportCountry] = useState("");
  const [passportExpiryDate, setPassportExpiryDate] = useState("");
  const [passportPhotoPath, setPassportPhotoPath] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingPassport, setSavingPassport] = useState(false);

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
        setMember(null);
        setIsAdmin(false);
        setLoading(false);
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
        setError(memberErr.message);
        setMember(null);
      } else {
        const m = (data as MemberRow) ?? null;
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
      }

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
        setPassportFullName(p.passport_full_name ?? "");
        setPassportCountry(p.passport_country ?? "");
        setPassportExpiryDate(
          p.passport_expiry_date
            ? new Date(p.passport_expiry_date).toISOString().split("T")[0]
            : ""
        );
        setPassportPhotoPath(p.passport_photo_path ?? null);
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

  const profileComplete =
    !!member?.email &&
    !!member?.full_name &&
    !!member?.display_name &&
    !!member?.nationality &&
    member?.declared_handicap !== null &&
    member?.declared_handicap !== undefined;

  const isApproved = (member?.status ?? "pending") === "active";

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

      {/* Profile gate state */}
      {!loading && !error && (
        <>
          {!profileComplete && (
            <div className="mt-4 rounded-2xl border border-amber-400 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Profile incomplete</p>
              <p className="mt-1 text-sm text-amber-900">
                Please complete your email, full name, display name, nationality and declared handicap before using the rest of the app.
              </p>
            </div>
          )}
          {profileComplete && !isApproved && (
            <div className="mt-4 rounded-2xl border border-blue-400 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900">Pending approval</p>
              <p className="mt-1 text-sm text-blue-900">
                Your profile has been submitted and is awaiting admin approval. You’ll be able to access all features once your membership is approved.
              </p>
            </div>
          )}
        </>
      )}

      {error ? (
        <div className="mt-4 rounded-2xl border border-black p-4">
          <p className="text-sm font-semibold">Error</p>
          <p className="mt-1 text-sm">{error}</p>
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
          setFullName={setFullName}
          displayName={displayName}
          setDisplayName={setDisplayName}
          nationality={nationality}
          setNationality={setNationality}
          declaredHandicap={declaredHandicap}
          setDeclaredHandicap={setDeclaredHandicap}
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
            setSavingProfile(true);
            setError(null);

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

              setProfileSaved(true);
              setEditingProfile(false);
              router.refresh();
              
              // Reload member data
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
                }
              }
            } catch (e: any) {
              setError(e?.message || "Failed to save profile.");
            } finally {
              setSavingProfile(false);
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

              setProfilePhotoPath(json.path);
              router.refresh();
              
              // Reload member data
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data } = await supabase
                  .from("members")
                  .select("id,email,full_name,display_name,nationality,declared_handicap,profile_photo_path,created_at,last_seen")
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
          }}
        />

        {/* Passport Block */}
        <PassportBlock
          passport={passport}
          editing={editingPassport}
          onToggleEdit={() => {
            setEditingPassport(!editingPassport);
            setPassportSaved(false);
            if (!editingPassport) {
              // Reset to current values when starting edit
              setPassportFullName(passport?.passport_full_name ?? "");
              setPassportCountry(passport?.passport_country ?? "");
              setPassportExpiryDate(
                passport?.passport_expiry_date
                  ? new Date(passport.passport_expiry_date).toISOString().split("T")[0]
                  : ""
              );
              setPassportPhotoPath(passport?.passport_photo_path ?? null);
              setPassportNumber(""); // Don't load encrypted number
            }
          }}
          passportFullName={passportFullName}
          setPassportFullName={setPassportFullName}
          passportNumber={passportNumber}
          setPassportNumber={setPassportNumber}
          passportCountry={passportCountry}
          setPassportCountry={setPassportCountry}
          passportExpiryDate={passportExpiryDate}
          setPassportExpiryDate={setPassportExpiryDate}
          passportPhotoPath={passportPhotoPath}
          setPassportPhotoPath={setPassportPhotoPath}
          uploadingPhoto={uploadingPhoto}
          setUploadingPhoto={setUploadingPhoto}
          saving={savingPassport}
          saved={passportSaved}
          onSave={async () => {
            setSavingPassport(true);
            setError(null);

            try {
              const res = await fetch("/me/passport/save", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  passport_full_name: passportFullName.trim(),
                  passport_number: passportNumber.trim(),
                  passport_country: passportCountry.trim(),
                  passport_expiry_date: passportExpiryDate.trim(),
                  passport_photo_path: passportPhotoPath,
                }),
              });

              const json = await res.json().catch(() => ({}));

              if (!res.ok) {
                throw new Error(json?.error || "Failed to save passport data.");
              }

              setPassportSaved(true);
              setEditingPassport(false);
              router.refresh();

              // Reload passport data
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: passportData } = await supabase
                  .from("member_passports")
                  .select("passport_full_name,passport_country,passport_expiry_date,passport_photo_path")
                  .eq("user_id", user.id)
                  .maybeSingle();
                if (passportData) {
                  setPassport(passportData as PassportRow);
                }
              }
            } catch (e: any) {
              setError(e?.message || "Failed to save passport data.");
            } finally {
              setSavingPassport(false);
            }
          }}
          onPhotoUpload={async (file: File) => {
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
            } catch (e: unknown) {
              const error = e as { message?: string };
              setError(error?.message || "Failed to upload photo.");
            } finally {
              setUploadingPhoto(false);
            }
          }}
          showPassportCropModal={showPassportCropModal}
          passportImageSrc={passportImageSrc}
          passportCrop={passportCrop}
          passportZoom={passportZoom}
          passportCroppedAreaPixels={passportCroppedAreaPixels}
          setShowPassportCropModal={setShowPassportCropModal}
          setPassportImageSrc={setPassportImageSrc}
          setPassportCrop={setPassportCrop}
          setPassportZoom={setPassportZoom}
          setPassportCroppedAreaPixels={setPassportCroppedAreaPixels}
        />

        <div className="rounded-2xl border border-gray-200 p-3">
          <div className="text-xs font-medium text-gray-600">Data security</div>
          
          <div className="mt-2 space-y-2 text-xs text-gray-600 leading-relaxed">
            <div>
              <div className="font-medium text-gray-700">Passport information</div>
              <p className="mt-1">
                When you provide passport details for a trip, we store:
              </p>
              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                <li>Full name as shown on your passport</li>
                <li>Passport number (encrypted)</li>
                <li>Passport country</li>
                <li>Expiry date</li>
                <li>Optional passport photo</li>
              </ul>
            </div>

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
        <div className="text-sm font-semibold">Profile</div>
        <button
          onClick={onToggleEdit}
          className="rounded-xl border border-black px-3 py-1 text-xs font-semibold hover:bg-gray-50"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
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
              placeholder="e.g. Samuel Kitchin"
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
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={nationality}
              onChange={(e) => setNationality(e.target.value)}
              placeholder="e.g. British"
            />
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

          <div>
            <div className="text-xs font-semibold">Profile photo</div>
            {profilePhotoPath && (
              <div className="mt-2">
                <img
                  src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${profilePhotoPath}`}
                  alt="Profile"
                  className="h-20 w-20 rounded-full object-cover border border-gray-300"
                />
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png"
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
              className="mt-2 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              disabled={uploadingProfilePhoto}
            />
            {uploadingProfilePhoto && (
              <p className="mt-1 text-xs text-gray-600">Uploading photo…</p>
            )}
            {profilePhotoPath && !uploadingProfilePhoto && (
              <p className="mt-1 text-xs text-green-600">Photo uploaded successfully</p>
            )}
          </div>

          {/* Crop Modal */}
          {showCropModal && imageSrc && (
            <ImageCropModal
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
            {saving ? "Saving…" : saved ? "Changes saved" : "Save"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          {member?.profile_photo_path && (
            <div className="mb-3 flex justify-center">
              <img
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${member.profile_photo_path}`}
                alt="Profile"
                className="h-24 w-24 rounded-full object-cover border border-gray-300"
              />
            </div>
          )}
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

function PassportBlock({
  passport,
  editing,
  onToggleEdit,
  passportFullName,
  setPassportFullName,
  passportNumber,
  setPassportNumber,
  passportCountry,
  setPassportCountry,
  passportExpiryDate,
  setPassportExpiryDate,
  passportPhotoPath,
  setPassportPhotoPath,
  uploadingPhoto,
  setUploadingPhoto,
  saving,
  saved,
  onSave,
  onPhotoUpload,
  showPassportCropModal,
  passportImageSrc,
  passportCrop,
  passportZoom,
  passportCroppedAreaPixels,
  setShowPassportCropModal,
  setPassportImageSrc,
  setPassportCrop,
  setPassportZoom,
  setPassportCroppedAreaPixels,
}: {
  passport: PassportRow | null;
  editing: boolean;
  onToggleEdit: () => void;
  passportFullName: string;
  setPassportFullName: (v: string) => void;
  passportNumber: string;
  setPassportNumber: (v: string) => void;
  passportCountry: string;
  setPassportCountry: (v: string) => void;
  passportExpiryDate: string;
  setPassportExpiryDate: (v: string) => void;
  passportPhotoPath: string | null;
  setPassportPhotoPath: (v: string | null) => void;
  uploadingPhoto: boolean;
  setUploadingPhoto: (v: boolean) => void;
  saving: boolean;
  saved: boolean;
  onSave: () => Promise<void>;
  onPhotoUpload: (file: File) => Promise<void>;
  showPassportCropModal: boolean;
  passportImageSrc: string | null;
  passportCrop: Point;
  passportZoom: number;
  passportCroppedAreaPixels: Area | null;
  setShowPassportCropModal: (v: boolean) => void;
  setPassportImageSrc: (v: string | null) => void;
  setPassportCrop: (v: Point) => void;
  setPassportZoom: (v: number) => void;
  setPassportCroppedAreaPixels: (v: Area | null) => void;
}) {
  const passportEnabled = process.env.NEXT_PUBLIC_PASSPORT_ENABLED !== "false";

  if (!passportEnabled && !passport) {
    return (
      <div className="rounded-2xl border border-black p-4">
        <div className="text-sm font-semibold">Passport details</div>
        <p className="mt-2 text-sm">
          Passport details will be added once appropriate security has been implemented.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-black p-4">
      <div className="flex items-start justify-between">
        <div className="text-sm font-semibold">Passport details</div>
        <button
          onClick={onToggleEdit}
          className="rounded-xl border border-black px-3 py-1 text-xs font-semibold hover:bg-gray-50"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <div>
            <div className="text-xs font-semibold">Passport full name</div>
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={passportFullName}
              onChange={(e) => setPassportFullName(e.target.value)}
              placeholder="As shown on your passport"
            />
          </div>

          <div>
            <div className="text-xs font-semibold">Passport number</div>
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={passportNumber}
              onChange={(e) => setPassportNumber(e.target.value)}
              placeholder="Enter passport number"
              type="text"
            />
            <p className="mt-1 text-xs text-gray-500">
              Your passport number is encrypted and stored securely.
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold">Passport country</div>
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={passportCountry}
              onChange={(e) => setPassportCountry(e.target.value)}
              placeholder="e.g. United Kingdom"
            />
          </div>

          <div>
            <div className="text-xs font-semibold">Passport expiry date</div>
            <input
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              value={passportExpiryDate}
              onChange={(e) => setPassportExpiryDate(e.target.value)}
              type="date"
            />
          </div>

          <div>
            <div className="text-xs font-semibold">Passport photo (optional)</div>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png"
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
              className="mt-1 w-full rounded-xl border border-black px-3 py-2 text-sm outline-none"
              disabled={uploadingPhoto}
            />
            <p className="mt-1 text-xs text-gray-500">
              You can take a photo with your camera or select an existing file.
            </p>
            {uploadingPhoto && (
              <p className="mt-1 text-xs text-gray-600">Uploading photo…</p>
            )}
            {passportPhotoPath && !uploadingPhoto && (
              <p className="mt-1 text-xs text-green-600">Photo uploaded successfully</p>
            )}
          </div>

          <button
            onClick={onSave}
            disabled={saving || uploadingPhoto}
            className="w-full rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : saved ? "Changes saved" : "Save"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <Row
            label="Passport full name"
            value={passport?.passport_full_name ?? "—"}
          />
          <Row label="Passport number" value="••••••••" />
          <Row label="Passport country" value={passport?.passport_country ?? "—"} />
          <Row
            label="Passport expiry date"
            value={
              passport?.passport_expiry_date
                ? new Date(passport.passport_expiry_date).toLocaleDateString("en-GB")
                : "—"
            }
          />
          {passport?.passport_photo_path && (
            <Row label="Passport photo" value="Uploaded" />
          )}
        </div>
      )}

      {/* Passport Crop Modal */}
      {showPassportCropModal && passportImageSrc && (
        <ImageCropModal
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
              await onPhotoUpload(file);
              setPassportImageSrc(null);
            } catch (error: unknown) {
              // Error will be handled by onPhotoUpload's error handling
              console.error("Failed to crop passport image:", error);
            } finally {
              setUploadingPhoto(false);
            }
          }}
        />
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
  imageSrc,
  crop,
  zoom,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onCancel,
  onSave,
}: {
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
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Crop Profile Photo</h3>
        
        <div className="relative h-64 w-full bg-gray-100 rounded-lg overflow-hidden">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
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
