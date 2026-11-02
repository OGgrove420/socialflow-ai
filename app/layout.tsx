import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SocialFlow AI — Plan a month of social media in one sitting",
  description:
    "AI social-media management for South African businesses. A full month of posts written in your brand voice, scheduled at the best times, with SA holidays built in. From R199/month.",
  keywords: [
    "social media management",
    "social media scheduling South Africa",
    "AI content calendar",
    "Instagram scheduler",
    "social media tool rand",
  ],
  openGraph: {
    title: "SocialFlow AI",
    description:
      "Your whole month of social media, planned in one sitting. Built for South African businesses, priced in rand.",
    siteName: "SocialFlow AI",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-ZA">
      <body>{children}</body>
    </html>
  );
}
