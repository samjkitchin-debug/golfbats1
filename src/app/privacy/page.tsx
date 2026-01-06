import MemberLayout from "../(member)/layout";

function PrivacyContent() {
  return (
    <div className="px-4 pb-24 pt-4">
      <h1 className="text-2xl font-bold text-gray-900">Privacy</h1>

      <div className="mt-4 space-y-4 text-sm leading-relaxed text-gray-800">
        <p>
          GolfBats is a private club coordination tool. Personal data is handled carefully,
          deliberately, and only where it serves a clear purpose related to organising golf trips.
        </p>

        <p>
          This page explains what data is stored, why it is stored, and how it is protected.
        </p>

        <section>
          <h2 className="text-base font-semibold text-gray-900">What information is stored</h2>

          <h3 className="mt-3 text-xs font-semibold text-gray-900">Member profile data</h3>
          <p className="mt-1">
            Each member has a basic profile used for coordination and logistics. This may include:
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Full name and/or display name</li>
            <li>Email address</li>
            <li>Nationality</li>
            <li>Declared handicap (for planning purposes only)</li>
          </ul>
          <p className="mt-2">
            This information allows trip organisers to manage groups, logistics, and communications
            efficiently.
          </p>

          <h3 className="mt-4 text-xs font-semibold text-gray-900">Passport information (optional)</h3>
          <p className="mt-1">
            For certain trips — for example, those involving travel or ferry arrangements — passport
            details may be required.
          </p>
          <p className="mt-2 text-sm text-gray-800">
            <span className="font-semibold">Key points:</span>
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Passport details are not required by default</li>
            <li>You will only be asked to provide them when they are operationally necessary</li>
            <li>You remain in control of adding, updating, or removing this information</li>
          </ul>
          <p className="mt-2">
            Passport data may include:
          </p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Passport name</li>
            <li>Passport number</li>
            <li>Issuing country</li>
            <li>Expiry date</li>
            <li>An optional photo of the passport information page</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">How your data is protected</h2>
          <p className="mt-2">
            GolfBats applies additional technical controls to sensitive personal data.
          </p>
          <p className="mt-2">These include:</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Encryption at rest for sensitive fields so they are not stored in plain text</li>
            <li>Access controls ensuring members can only access their own data</li>
            <li>Row-level security and policy-based restrictions at the database level</li>
            <li>Restricted administrative access, limited to authorised admins</li>
            <li>Audit logging when sensitive data is accessed administratively</li>
            <li>Private file storage for uploaded documents, accessed via short-lived, signed links</li>
          </ul>
          <p className="mt-2">
            The system is designed in alignment with internationally recognised information security
            principles (including ISO/IEC 27001) and follows industry best practices for application
            and data security.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">How your information is used</h2>
          <p className="mt-2">Personal data is used only for:</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Organising and coordinating golf trips</li>
            <li>Managing attendance and logistics</li>
            <li>Communicating trip-related information to members</li>
          </ul>
          <p className="mt-2">GolfBats does not:</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Sell personal data</li>
            <li>Use personal data for advertising</li>
            <li>Share data with third parties outside of trip coordination requirements</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">Data retention</h2>
          <p className="mt-2">
            Data is retained only for as long as it is reasonably required for coordination purposes.
          </p>
          <p className="mt-2">In particular:</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Passport information may be removed after the relevant trip has concluded</li>
            <li>Sensitive data may be deleted when it is no longer operationally required</li>
            <li>Members may request removal of optional data at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">Access, visibility, and control</h2>
          <p className="mt-2">Members can:</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>View and update their own profile information</li>
            <li>Add or remove optional data</li>
            <li>Request removal of their account and associated data</li>
          </ul>
          <p className="mt-2">Administrative access to sensitive data is:</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Purpose-limited</li>
            <li>Logged</li>
            <li>Reviewed where appropriate</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">Member responsibility</h2>
          <p className="mt-2">Members are asked to:</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>Provide accurate information</li>
            <li>Upload sensitive information only when specifically requested</li>
            <li>Avoid sharing unnecessary personal details</li>
          </ul>
          <p className="mt-2">
            There is no requirement to upload passport information unless a specific trip requires it.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900">Questions or concerns</h2>
          <p className="mt-2">
            If you have questions about how data is handled, or concerns about a particular trip’s
            requirements, please contact one of the admins.
          </p>
        </section>
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <MemberLayout>
      <PrivacyContent />
    </MemberLayout>
  );
}




