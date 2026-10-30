import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Geist,
  Geist_Mono,
  IBM_Plex_Mono,
  IBM_Plex_Sans,
} from "next/font/google";
import "../styles/tokens.css";
import "./globals.css";
import AppShell from "@/components/auth/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Kenova design system fonts. They only set variables, so the current screens
// keep their look until each one is redone.
const plexSans = IBM_Plex_Sans({
  variable: "--k-font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--k-font-plex-mono",
  subsets: ["latin"],
  weight: ["500"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--k-font-bricolage",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "2InSide",
  description: "Web to 2InSide",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} ${plexSans.variable} ${plexMono.variable} ${bricolage.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
