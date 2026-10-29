import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SocialFlow AI",
  description: "AI social-media content planning for South African businesses",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
