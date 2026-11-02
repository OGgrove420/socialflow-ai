import Link from "next/link";

const sections = [
  {
    h: "What we collect",
    p: [
      "Right now: only the email address you give us for the waitlist, and the time you joined.",
      "When the product launches, we collect what is needed to run your account: your email, your business description, and the content you generate.",
    ],
  },
  {
    h: "How we use it",
    p: [
      "Waitlist emails: to tell you when sign-up opens. Nothing else.",
      "Account data (after launch): to generate and store your content plans.",
      "We do not sell your data. We do not send marketing email you did not ask for.",
    ],
  },
  {
    h: "Delete or export",
    p: [
      "Ask at any time and we will delete your data or send you a copy. Contact details will be listed here at launch.",
    ],
  },
  {
    h: "South African law",
    p: [
      "This policy is written in plain language. POPIA gives you rights over your personal information; we built this product to respect them. This page is not legal advice and the final wording will be reviewed by a qualified attorney before launch.",
    ],
  },
];

export default function Privacy() {
  return (
    <div className="legal">
      <Link href="/" className="legal-back">← socialflow.ai</Link>
      <h1>Privacy</h1>
      <p className="legal-sub">
        SocialFlow AI is owned and operated by Conscious Mind Concepts (Pty) Ltd, South Africa.
      </p>
      {sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          {s.p.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </section>
      ))}
      <p style={{ color: "var(--faint)", fontSize: "0.85rem" }}>Last updated: 29 October 2026</p>
    </div>
  );
}
