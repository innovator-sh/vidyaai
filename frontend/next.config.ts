import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/** Origin (scheme + host) of a URL, or null if it is missing/invalid. */
function originOf(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).origin;
  } catch {
    return null;
  }
}

const apiOrigin = originOf(process.env.NEXT_PUBLIC_API_URL) ?? (isDev ? "http://localhost:8000" : null);
const authDomainOrigin = originOf(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);

const connectSrc = [
  "'self'",
  apiOrigin,
  // Firebase Auth REST endpoints
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://www.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
  isDev ? "ws://localhost:*" : null,
].filter(Boolean);

const frameSrc = [
  "'self'",
  // Firebase signInWithPopup/redirect helper iframe + Google sign-in
  authDomainOrigin,
  "https://*.firebaseapp.com",
  "https://accounts.google.com",
].filter(Boolean);

const csp = [
  "default-src 'self'",
  // Next.js emits inline bootstrap scripts; apis.google.com is loaded by the Firebase popup flow.
  `script-src 'self' 'unsafe-inline' https://apis.google.com${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://lh3.googleusercontent.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  `connect-src ${connectSrc.join(" ")}`,
  `frame-src ${frameSrc.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  isDev ? null : "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self), payment=()" },
  // Firebase's popup flow needs window.opener access from the auth helper.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
