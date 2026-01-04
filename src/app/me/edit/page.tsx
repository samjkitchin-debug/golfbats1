import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

export default async function MeEditPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/me/edit");

  const { data: member } = await supabase
    .from("members")
    .select("display_name, full_name, nationality, declared_handicap")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = member?.display_name ?? member?.full_name ?? "";
  const nationality = member?.nationality ?? "";
  const declaredHandicap =
    member?.declared_handicap !== null && member?.declared_handicap !== undefined
      ? String(member.declared_handicap)
      : "";

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-black">Edit profile</h1>
        <Link href="/me" className="text-sm font-medium text-black underline">
          Back
        </Link>
      </div>

      <form
        action="/me/edit"
        method="post"
        className="rounded-2xl border border-black/10 bg-white p-5"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-black">
              Display name
            </label>
            <input
              name="display_name"
              defaultValue={displayName}
              placeholder="Your name"
              className="w-full rounded-xl border border-black px-3 py-3 text-base text-black outline-none"
              maxLength={60}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-black">
              Nationality
            </label>
            <input
              name="nationality"
              defaultValue={nationality}
              placeholder="e.g. Singaporean"
              className="w-full rounded-xl border border-black px-3 py-3 text-base text-black outline-none"
              maxLength={60}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-black">
              Declared handicap
            </label>
            <input
              name="declared_handicap"
              defaultValue={declaredHandicap}
              placeholder="e.g. 18.4"
              inputMode="decimal"
              className="w-full rounded-xl border border-black px-3 py-3 text-base text-black outline-none"
            />
            <div className="mt-2 text-sm text-black/70">
              This is your initial declared handicap. Trip handicap snapshots are recorded per trip.
            </div>
          </div>

          {/* Passport placeholders (disabled) */}
          <div className="mt-2 rounded-2xl border border-black/10 p-4">
            <div className="mb-3 text-sm font-semibold text-black">Travel details</div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-black">
                  Passport number
                </label>
                <input
                  disabled
                  value=""
                  placeholder="Locked"
                  className="w-full rounded-xl border border-black/20 px-3 py-3 text-base text-black opacity-60"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-black">
                  Passport expiry date
                </label>
                <input
                  disabled
                  value=""
                  placeholder="Locked"
                  className="w-full rounded-xl border border-black/20 px-3 py-3 text-base text-black opacity-60"
                />
              </div>

              <div className="text-sm text-black">
                Passport details will be added once appropriate security has been implemented.
              </div>
            </div>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-black px-4 py-4 text-base font-semibold text-white"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
