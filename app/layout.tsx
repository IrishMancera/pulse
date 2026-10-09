import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pulse — Connect with strangers worldwide",
  description:
    "A real-time living globe of anonymous strangers. Drop onto the map, pick your signal, and start talking — no sign-up, no history, no traces.",
  keywords: ["anonymous chat", "real-time", "global", "strangers", "video call", "map"],
  openGraph: {
    title: "Pulse — Connect with strangers worldwide",
    description: "Drop onto the live map and connect with anyone, anywhere. Ephemeral by design.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
