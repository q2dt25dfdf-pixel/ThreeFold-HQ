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
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=0.9, maximum-scale=1" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} bg-zinc-100 antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
