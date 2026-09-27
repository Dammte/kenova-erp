import type { NextConfig } from "next";

/**
 * The browser only ever calls `/api/*` on this domain and Next forwards it to
 * the NestJS server. That keeps the session cookie first-party and HttpOnly
 * (see server README, "Autenticación"). API_ORIGIN is a server-side variable:
 * it is not exposed to the browser bundle.
 */
const apiOrigin = process.env.API_ORIGIN ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000");
// Fail fast on a production build; a Vercel preview without API_ORIGIN still
// builds, but its /api calls return 404 instead of reaching any backend.
const isPreview = process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
if (!apiOrigin) {
  if (!isPreview) {
    throw new Error("API_ORIGIN must be set (e.g. https://twoinside.onrender.com) to build the frontend");
  }
  console.warn("API_ORIGIN is not set: this preview has no API backend");
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{
      protocol: "https",
      hostname: "i.ibb.co",
      port: '',
      pathname: "/**"
    }],
  },
  async rewrites() {
    if (!apiOrigin) return [];
    return [{ source: "/api/:path*", destination: `${apiOrigin.replace(/\/$/, "")}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
