import Link from "next/link";
import { createSupabaseServerClient } from "../../lib/supabaseServer";

type MemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  display_name: string | null;
  nationality: string | null;
  declared_handicap: number | null;
  created_at: string | null;
  last_seen: string | null;
};

export default async function AdminMembersPage() {
  const supabase = await createSupabaseServerClient();

  const { data: rows, error } = await supabase
    .from("members")
    .select("id,email,full_name,display_name,nationality,declared_handicap,created_at,last_seen")
    .order("created_at", { ascending: false });

  const members: MemberRow[] = rows ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-10">
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Members</h1>
        <Link href="/admin" className="text-sm text-gray-700 hover:text-gray-900">
          Back to dashboard
        </Link>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">
          Failed to load members: {error.message}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-white">
              <tr className="text-gray-700">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Nat.</th>
                <th className="px-4 py-3">HCP</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const name = m.display_name || m.full_name || "—";
                return (
                  <tr key={m.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium text-gray-900">{name}</td>
                    <td className="px-4 py-3 text-gray-800">{m.email ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-800">{m.nationality ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-800">
                      {m.declared_handicap ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {m.created_at ? new Date(m.created_at).toLocaleString("en-SG") : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {m.last_seen ? new Date(m.last_seen).toLocaleString("en-SG") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {members.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-700">No members found.</div>
          ) : null}
        </div>
      )}
    </main>
  );
}
