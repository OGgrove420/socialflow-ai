import Link from "next/link";

const features = [
  {
    title: "One month, planned",
    body: "Tell SocialFlow about your business once. Get a full month of post ideas with captions, laid out on a calendar.",
  },
  {
    title: "Your voice, kept",
    body: "The planner writes in your brand's tone, not generic corporate filler. Edit anything, regenerate any single day.",
  },
  {
    title: "Made for SA businesses",
    body: "Pricing in rand. Local holidays and observances on the calendar by default.",
  },
];

export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "2.6rem", marginBottom: "0.5rem" }}>SocialFlow AI</h1>
      <p style={{ color: "var(--muted)", fontSize: "1.15rem", marginBottom: "2rem" }}>
        Plan a month of social media posts in minutes, not weekends.
      </p>

      <section style={{ display: "grid", gap: "1rem", marginBottom: "2.5rem" }}>
        {features.map((f) => (
          <div
            key={f.title}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "1.25rem",
            }}
          >
            <h2 style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>{f.title}</h2>
            <p style={{ color: "var(--muted)" }}>{f.body}</p>
          </div>
        ))}
      </section>

      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "1.5rem",
          marginBottom: "2.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>Join the waitlist</h2>
        <p style={{ color: "var(--muted)", marginBottom: "1rem" }}>
          Sign-up opens soon. Waitlist members get first access and founder pricing.
        </p>
        <WaitlistForm />
      </section>

      <footer style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        Conscious Mind Concepts (Pty) Ltd · South Africa ·{" "}
        <Link href="/privacy">privacy</Link>
      </footer>
    </main>
  );
}

function WaitlistForm() {
  return (
    <form action="/api/waitlist" method="post" style={{ display: "flex", gap: "0.5rem" }}>
      <input
        type="email"
        name="email"
        required
        placeholder="you@yourbusiness.co.za"
        style={{
          flex: 1,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          color: "var(--text)",
          padding: "0.65rem 0.9rem",
          fontSize: "1rem",
        }}
      />
      <button
        type="submit"
        style={{
          background: "var(--accent)",
          border: "none",
          borderRadius: 8,
          color: "#fff",
          padding: "0.65rem 1.2rem",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Join
      </button>
    </form>
  );
}
