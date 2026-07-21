import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "../components/layout/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Threefold HQ",
  description: "Operational command center for Threefold Supply Co.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ backgroundColor: "#f4f4f5" }}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Threefold HQ" />
        <meta name="theme-color" content="#f4f4f5" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-zinc-100 antialiased`}
        style={{ backgroundColor: "#f4f4f5" }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
