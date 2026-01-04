export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 text-black">
      <h1 className="mb-6 text-3xl font-bold">Terms of Service</h1>

      <div className="space-y-5 text-base leading-relaxed">
        <p>
          GolfBats is a private club coordination platform provided for members
          of a golf group. By using this application, you agree to the terms
          below.
        </p>

        <h2 className="text-xl font-semibold">Use of the service</h2>
        <p>
          GolfBats is provided for organising golf trips, sharing logistics, and
          publishing trip summaries. It is not a scoring engine and should not
          be relied upon for official handicap calculations.
        </p>

        <h2 className="text-xl font-semibold">Accounts</h2>
        <p>
          Access is limited to approved members. You are responsible for keeping
          your account secure and for any activity under your account.
        </p>

        <h2 className="text-xl font-semibold">Data accuracy</h2>
        <p>
          Members are responsible for ensuring that the information they provide
          (including declared handicap and personal details) is accurate.
        </p>

        <h2 className="text-xl font-semibold">Availability</h2>
        <p>
          The service is provided on a best-effort basis. Features may change,
          break, or be removed without notice.
        </p>

        <h2 className="text-xl font-semibold">Termination</h2>
        <p>
          Administrators may suspend or remove access at any time if a member is
          no longer part of the group or misuses the service.
        </p>

        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          For questions about these terms, please contact the club administrator.
        </p>
      </div>
    </main>
  );
}
