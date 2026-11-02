import type { Metadata } from "next";
import XStudio from "./XStudio";

export const metadata: Metadata = {
  title: "SocialFlow AI — X beta studio",
  description: "Beta composer for posting to X through SocialFlow.",
};

export default function XStudioPage() {
  return (
    <main className="container" style={{ paddingTop: "3rem", paddingBottom: "5rem" }}>
      <h1 className="studio-title">x beta studio</h1>
      <p className="studio-sub">
        beta: one account (x), real posts, you press post on every one. full multi-platform
        scheduling ships after the beta.
      </p>
      <XStudio />
    </main>
  );
}
