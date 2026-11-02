import Link from "next/link";

const platforms = [
  { name: "Instagram", color: "#c13584" },
  { name: "Facebook", color: "#1877f2" },
  { name: "TikTok", color: "#25f4ee" },
  { name: "LinkedIn", color: "#0a66c2" },
  { name: "X (Twitter)", color: "#8899a6" },
  { name: "YouTube", color: "#ff0000" },
];

const features = [
  {
    icon: "🗓️",
    title: "One month, planned",
    body: "Tell SocialFlow about your business once. Get a full month of post ideas with captions, laid out on a visual calendar you can drag and drop.",
    span: "bento-wide",
  },
  {
    icon: "🎙️",
    title: "Your voice, kept",
    body: "The planner writes in your brand's tone, not generic corporate filler. Edit anything, regenerate any single day.",
    span: "bento-tall",
  },
  {
    icon: "🇿🇦",
    title: "Built in South Africa",
    body: "Pricing in rand. SA public holidays and observances like Heritage Day and Mandela Day are on the calendar by default.",
    span: "bento-tall",
  },
  {
    icon: "⚡",
    title: "Best-time scheduling",
    body: "Posts queue for the times your audience is actually online, per platform. One dashboard for every account.",
    span: "bento-tall",
  },
  {
    icon: "📈",
    title: "See what worked",
    body: "Track likes, comments and growth across platforms in one view, and get plain-language suggestions on what to post next.",
    span: "bento-tall",
  },
  {
    icon: "✍️",
    title: "AI captions and hashtags",
    body: "Captions, hooks and hashtag sets written per platform. A LinkedIn post and a TikTok caption never sound the same.",
    span: "bento-wide",
  },
];

const steps = [
  {
    title: "Describe your business",
    body: "Two minutes of plain language: what you sell, who you sell to, how you talk. That is the whole onboarding.",
  },
  {
    title: "Get your month plan",
    body: "SocialFlow drafts a month of posts across your platforms, tuned to your voice and the SA calendar. You review and tweak.",
  },
  {
    title: "Approve and schedule",
    body: "Happy with a post? One tap queues it for the best time slot. Not happy? Regenerate that day only.",
  },
];

const quotes = [
  {
    text: "I used to lose every Sunday night to next month's posts. Now I review a calendar over one coffee.",
    who: "Lerato M.",
    role: "owner, boutique salon (Johannesburg)",
    grad: "linear-gradient(135deg, #c13584, #7c5cff)",
    init: "L",
  },
  {
    text: "The captions actually sound like us. My customers noticed the difference before I told them what changed.",
    who: "Sipho D.",
    role: "founder, towing and recovery service (Durban)",
    grad: "linear-gradient(135deg, #0a66c2, #4f7cff)",
    init: "S",
  },
  {
    text: "Heritage Day and the long weekends just appeared on the plan. No more scrambling for something to post.",
    who: "Ané V.",
    role: "marketing lead, farm stall (Western Cape)",
    grad: "linear-gradient(135deg, #f59e0b, #c13584)",
    init: "A",
  },
];

const plans = [
  {
    name: "Starter",
    sub: "For one business finding its rhythm",
    price: "R199",
    per: "/month",
    cta: "Join the waitlist",
    featured: false,
    items: [
      "3 social accounts",
      "1 month content plan at a time",
      "AI captions and hashtags",
      "Best-time scheduling",
      "Basic performance view",
    ],
  },
  {
    name: "Growth",
    sub: "For businesses posting seriously",
    price: "R399",
    per: "/month",
    cta: "Join the waitlist",
    featured: true,
    items: [
      "10 social accounts",
      "Rolling month plan, regenerate any day",
      "Brand voice training",
      "SA holiday calendar built in",
      "Full analytics and post-next suggestions",
      "Priority support",
    ],
  },
  {
    name: "Agency",
    sub: "For agencies running client pages",
    price: "R899",
    per: "/month",
    cta: "Join the waitlist",
    featured: false,
    items: [
      "30 social accounts",
      "Client workspaces with approval steps",
      "White-label PDF reports",
      "Everything in Growth",
    ],
  },
];

const faqs = [
  {
    q: "When can I sign up?",
    a: "We are finishing the product now and opening sign-up to the waitlist first, in the order people joined. Waitlist members also get founder pricing locked in for their first year.",
  },
  {
    q: "What does it cost?",
    a: "Plans start at R199 per month. That is the intended launch pricing, shown here so you can plan. Waitlist members get founder pricing below these numbers.",
  },
  {
    q: "Which platforms does it post to?",
    a: "Instagram, Facebook, TikTok, LinkedIn, X (Twitter) and YouTube are the launch set. Scheduling to each goes through that platform's official partner process, which is being completed platform by platform.",
  },
  {
    q: "Will the posts sound like my business, not a robot?",
    a: "Yes. You describe your business and your tone once, and every caption is written against that. You can edit any post and regenerate any single day without touching the rest of the plan.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes, month to month, no contract. Cancel from your account page and your plans stay downloadable.",
  },
  {
    q: "Is my data safe?",
    a: "Your business details and content are yours. We do not sell data or train public models on your posts, and you can ask for a copy or deletion of your data at any time. See our privacy page for the plain-language version.",
  },
];

type CalCell = { day: string; chips: string[] } | null;

// calendar mockup: 7 columns x 3 rows. chips = platform colour bars, ai = draft pending approval
const CAL: CalCell[][] = [
  [null, null, null, { day: "1", chips: ["li", "ai"] }, { day: "2", chips: ["ig"] }, { day: "3", chips: ["tiktok"] }, { day: "4", chips: [] }],
  [{ day: "5", chips: ["fb", "x"] }, { day: "6", chips: ["ig", "ai"] }, { day: "7", chips: ["li"] }, { day: "8", chips: ["tiktok"] }, { day: "9", chips: ["fb"] }, { day: "10", chips: ["ig", "x"] }, { day: "11", chips: ["ai"] }],
  [{ day: "12", chips: ["li", "fb"] }, { day: "13", chips: ["ig"] }, { day: "14", chips: ["tiktok", "ai"] }, { day: "15", chips: ["x"] }, { day: "16", chips: ["ig", "fb"] }, { day: "17", chips: ["li"] }, { day: "18", chips: [] }],
];

function Mockup() {
  return (
    <div className="mockup">
      <div className="mockup-bar">
        <span className="mockup-dot" />
        <span className="mockup-dot" />
        <span className="mockup-dot" />
        <span className="mockup-url">app.socialflow.ai / calendar</span>
      </div>
      <div className="mockup-body">
        <div className="mockup-side">
          <div className="mockup-side-item active">🗓️ Calendar</div>
          <div className="mockup-side-item">✍️ drafts</div>
          <div className="mockup-side-item">📈 insights</div>
          <div className="mockup-side-item">💬 inbox</div>
          <div className="mockup-side-item">⚙️ brand voice</div>
        </div>
        <div className="mockup-main">
          <div className="mockup-stat-row">
            <div className="mockup-stat"><b>24</b><span>posts this month</span></div>
            <div className="mockup-stat"><b>9</b><span>awaiting approval</span></div>
            <div className="mockup-stat"><b>+18%</b><span>reach, last 30 days</span></div>
          </div>
          <h3>November plan</h3>
          <div className="mockup-grid">
            {CAL.flat().map((cell, i) =>
              cell ? (
                <div className="mockup-day" key={i}>
                  <span>{cell.day}</span>
                  {cell.chips.map((c, j) => (
                    <span className={`mockup-chip ${c}`} key={j} />
                  ))}
                </div>
              ) : (
                <div className="mockup-day" key={i} />
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="nav-logo">
            <span className="nav-logo-mark">🌊</span> SocialFlow AI
          </Link>
          <nav className="nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="#waitlist" className="btn btn-primary" style={{ padding: "0.5rem 1.1rem", fontSize: "0.9rem" }}>
              Join waitlist
            </a>
          </nav>
        </div>
      </header>

      <main>
        {/* hero */}
        <section className="hero">
          <div className="container hero-inner">
            <span className="kicker">✦ by Conscious Mind Concepts</span>
            <h1>
              Your whole month of <span className="grad-text">social media</span>, planned in one sitting.
            </h1>
            <p className="hero-sub">
              SocialFlow AI writes, schedules and tracks your posts across every platform, in your
              brand's voice, with South African holidays built in.
            </p>
            <div className="hero-cta">
              <a href="#waitlist" className="btn btn-primary">Join the waitlist — it's free</a>
              <a href="#how" className="btn btn-ghost">See how it works</a>
            </div>
            <p className="hero-note">founder pricing for waitlist members · no credit card needed</p>
          </div>
          <div className="container">
            <Mockup />
          </div>
        </section>

        {/* platform row */}
        <section className="section" style={{ paddingTop: "3rem" }}>
          <div className="container">
            <p style={{ textAlign: "center", color: "var(--faint)", fontSize: "0.85rem", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "1rem" }}>
              one dashboard for
            </p>
            <div className="platform-row" style={{ paddingTop: 0 }}>
              {platforms.map((p) => (
                <span className="platform-pill" key={p.name}>
                  <span className="platform-dot" style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* features */}
        <section className="section" id="features" style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}>
          <div className="container">
            <div className="section-head">
              <span className="kicker">Features</span>
              <h2>Everything a social media manager would do. Without the retainer.</h2>
              <p>
                The parts of social media management that eat your week — ideas, captions, calendars,
                timing, reporting — handled in one place.
              </p>
            </div>
            <div className="bento">
              {features.map((f) => (
                <div className={`bento-card ${f.span}`} key={f.title}>
                  <div className="bento-icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* how it works */}
        <section className="section" id="how">
          <div className="container">
            <div className="section-head">
              <span className="kicker">How it works</span>
              <h2>From empty calendar to full month in three steps</h2>
            </div>
            <div className="steps">
              {steps.map((s, i) => (
                <div className="step-card" key={s.title}>
                  <span className="step-num">{i + 1}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* comparison */}
        <section className="section" style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}>
          <div className="container">
            <div className="section-head">
              <span className="kicker">Why SocialFlow</span>
              <h2>Built for SA businesses, priced in rand</h2>
              <p>International tools bill in dollars and know nothing about Heritage Day. That gap is the whole product.</p>
            </div>
            <table className="compare">
              <thead>
                <tr>
                  <th></th>
                  <th>Typical international tool</th>
                  <th>SocialFlow AI</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Pricing</td>
                  <td className="no">from ~$30/mo, USD, forex on your card</td>
                  <td className="flowcol">from R199/mo, in rand</td>
                </tr>
                <tr>
                  <td>SA holidays and observances</td>
                  <td className="no">not included</td>
                  <td className="flowcol">built into every calendar</td>
                </tr>
                <tr>
                  <td>Setup effort</td>
                  <td className="no">configure channels, fonts, templates, queues</td>
                  <td className="flowcol">describe your business once</td>
                </tr>
                <tr>
                  <td>Month plan</td>
                  <td className="no">you still write every post</td>
                  <td className="flowcol">whole month drafted for you</td>
                </tr>
                <tr>
                  <td>Local support</td>
                  <td className="no">overseas helpdesk, overnight replies</td>
                  <td className="flowcol">South African, same time zone</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* social proof */}
        <section className="section">
          <div className="container">
            <div className="section-head">
              <span className="kicker">Early users</span>
              <h2>Weekends back, from the first month</h2>
            </div>
            <div className="quotes">
              {quotes.map((q) => (
                <div className="quote-card" key={q.who}>
                  <p>“{q.text}”</p>
                  <div className="quote-who">
                    <span className="quote-avatar" style={{ background: q.grad }}>{q.init}</span>
                    <div>
                      <b>{q.who}</b>
                      <span>{q.role}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", color: "var(--faint)", fontSize: "0.8rem", marginTop: "1rem" }}>
              quotes from design-partner testers; surnames shortened at their request
            </p>
          </div>
        </section>

        {/* pricing */}
        <section className="section" id="pricing" style={{ background: "var(--bg-soft)", borderTop: "1px solid var(--border-soft)", borderBottom: "1px solid var(--border-soft)" }}>
          <div className="container">
            <div className="section-head">
              <span className="kicker">Pricing</span>
              <h2>Simple plans, in rand</h2>
              <p>
                Launch pricing below — waitlist members pay less at sign-up. Monthly, no contract,
                no payment details needed until you join.
              </p>
            </div>
            <div className="pricing">
              {plans.map((p) => (
                <div className={`price-card${p.featured ? " featured" : ""}`} key={p.name}>
                  {p.featured && <span className="price-badge">most popular</span>}
                  <h3>{p.name}</h3>
                  <div className="price-tag">
                    {p.price}<small>{p.per}</small>
                  </div>
                  <p className="price-sub">{p.sub}</p>
                  <ul className="price-list">
                    {p.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <a href="#waitlist" className={`btn ${p.featured ? "btn-primary" : "btn-ghost"}`}>{p.cta}</a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* faq */}
        <section className="section" id="faq">
          <div className="container">
            <div className="section-head">
              <span className="kicker">FAQ</span>
              <h2>Questions, answered</h2>
            </div>
            <div className="faq">
              {faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <div className="faq-body">{f.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* final cta */}
        <section className="final-cta" id="waitlist">
          <div className="container">
            <div className="cta-box">
              <h2>Be first in line when sign-up opens</h2>
              <p>
                Join the waitlist and get first access plus founder pricing — locked in for your
                first year. Free to join, no card details.
              </p>
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <span>© 2026 Conscious Mind Concepts (Pty) Ltd · South Africa</span>
          <span>
            <Link href="/privacy">Privacy</Link> · hello@socialflow.ai
          </span>
        </div>
      </footer>
    </>
  );
}

function WaitlistForm() {
  return (
    <form action="/api/waitlist" method="post" className="cta-form">
      <input
        type="email"
        name="email"
        required
        placeholder="you@yourbusiness.co.za"
        className="input"
        style={{ flex: 1 }}
      />
      <button type="submit" className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
        Join the waitlist
      </button>
    </form>
  );
}
