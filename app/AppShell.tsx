"use client";
// shared app shell: sticky header + nav for every logged-in page.
// shows the marketing pages link and the sign-out button. sign-out is
// best-effort: even if the route fails the user still goes home.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const APP_LINKS = [
  { href: "/accounts", label: "accounts" },
  { href: "/compose", label: "compose" },
  { href: "/x-studio", label: "x studio" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      // sign-out is best-effort; go home either way
    }
    window.location.href = "/";
  }

  return (
    <>
      <header className="nav">
        <div className="container nav-inner">
          <Link href="/" className="nav-logo">
            <span className="nav-logo-mark">🌊</span> SocialFlow AI
          </Link>
          <nav className="nav-links">
            {APP_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`app-link${pathname?.startsWith(l.href) ? " app-link-active" : ""}`}
              >
                {l.label}
              </Link>
            ))}
            <Link href="/" className="app-link app-link-quiet">
              home
            </Link>
            <button
              onClick={signOut}
              disabled={signingOut}
              className="app-link app-link-btn"
            >
              {signingOut ? "…" : "sign out"}
            </button>
          </nav>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}
