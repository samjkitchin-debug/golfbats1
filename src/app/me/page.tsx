import Link from "next/link";
import { redirect } from "next/navigation";
import SignOutButton from "../components/SignOutButton";
import { createSupabaseServerClient } from "../lib/supabaseServer";

function parseAdminEmails(raw: string | undefined) {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function MePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/me");

  const email = user.email ?? "";
  const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
  const isAdmin = !!email && adminEmails.includes(email.toLowerCase());

  // Fetch member record (created automatically by trigger)
  const { data: member } = await supabase
    .from("members")
    .select("display_name, full_name, nationality, declared_handicap, created_at, last_seen")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = member?.display_name || member?.full_name || email || "Member";
  const nationality = member?.nationality || "—";
  const declaredHandicap =
    member?.declared_handicap !== null && member?.declared_handicap !== undefined
      ? Number(member.declared_handicap).toFixed(1)
      : "—";

  return (
    <div className="mx-auto w-full max-w-md">
      <h1 className="mb-5 text-center text-2xl font-semibold text-black">Me</h1>

      {/* Identity */}
      <section className="rounded-2xl border border-black/10 bg-white p-5">
        <div className="text-sm text-black">Signed in as</div>
        <div className="mt-1 break-words text-base font-semibold text-black">{email}</div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-sm text-black">
            Role: <span className="font-semibold">{isAdmin ? "Admin" : "Member"}</span>
          </div>
          <SignOutButton />
        </div>
      </section>

      {/* Member profile */}
      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5">
        <div className="mb-3 text-sm font-semibold text-black">Profile</div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-black">Name</div>
            <div className="text-sm font-semibold text-black">{displayName}</div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-black">Nationality</div>
            <div className="text-sm font-semibold text-black">{nationality}</div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-black">Declared handicap</div>
            <div className="text-sm font-semibold text-black">{declaredHandicap}</div>
          </div>
        </div>

        <div className="mt-4">
          <Link
            href="/me/edit"
            className="inline-flex w-full items-center justify-center rounded-xl border border-black px-4 py-3 text-sm font-medium text-black"
          >
            Edit profile
          </Link>
        </div>
      </section>

      {/* Passport placeholders */}
      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5">
        <div className="mb-2 text-sm font-semibold text-black">Travel details</div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-black">Passport number</div>
            <div className="text-sm font-semibold text-black">Locked</div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm text-black">Passport expiry</div>
            <div className="text-sm font-semibold text-black">Locked</div>
          </div>
        </div>

        <div className="mt-4 text-sm text-black">
          Passport details will be added once appropriate security has been implemented.
        </div>
      </section>

      {/* Quick actions */}
      <section className="mt-5 rounded-2xl border border-black/10 bg-white p-5">
        <div className="mb-3 text-sm font-semibold text-black">Quick actions</div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/trips"
            className="rounded-xl border border-black px-4 py-3 text-center text-sm font-medium text-black"
          >
            Trips
          </Link>
          <Link
            href="/courses"
            className="rounded-xl border border-black px-4 py-3 text-center text-sm font-medium text-black"
          >
            Courses
          </Link>
          <Link
            href="/"
            className="rounded-xl border border-black px-4 py-3 text-center text-sm font-medium text-black"
          >
            Home
          </Link>

          {isAdmin ? (
            <Link
              href="/admin"
              className="rounded-xl bg-black px-4 py-3 text-center text-sm font-medium text-white"
            >
              Admin
            </Link>
          ) : (
            <div className="rounded-xl border border-black/10 px-4 py-3 text-center text-sm text-black">
              Admin only
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

