import type { Metadata } from "next";
import localFont from "next/font/local";
import "../styles/tokens.css";
import "./globals.css";
import AppShell from "@/components/auth/AppShell";

// Fonts are served from the repository (src/fonts, SIL Open Font License), so
// the build never depends on Google Fonts being reachable.
const geistSans = localFont({
  variable: "--font-geist-sans",
  src: "../fonts/geist-latin-wght-normal.woff2",
  weight: "100 900",
});

const geistMono = localFont({
  variable: "--font-geist-mono",
  src: "../fonts/geist-mono-latin-wght-normal.woff2",
  weight: "100 900",
});

// Kenova design system fonts. They only set variables, so the current screens
// keep their look until each one is redone.
const plexSans = localFont({
  variable: "--k-font-plex-sans",
  src: [
    { path: "../fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400" },
    { path: "../fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500" },
    { path: "../fonts/ibm-plex-sans-latin-600-normal.woff2", weight: "600" },
  ],
});

const plexMono = localFont({
  variable: "--k-font-plex-mono",
  src: "../fonts/ibm-plex-mono-latin-500-normal.woff2",
  weight: "500",
});

const bricolage = localFont({
  variable: "--k-font-bricolage",
  src: [
    { path: "../fonts/bricolage-grotesque-latin-600-normal.woff2", weight: "600" },
    { path: "../fonts/bricolage-grotesque-latin-700-normal.woff2", weight: "700" },
  ],
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
    <html
      lang="es"
      // On <html> so the --k-* tokens declared on :root can resolve them.
      className={`${plexSans.variable} ${plexMono.variable} ${bricolage.variable}`}
    >
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
