/** @type {import('next').NextConfig} */
const nextConfig = {
  // E2E runs a second dev server beside the normal one; it needs its own build dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Every page is per-user and reads the session cookie, so the app is fully dynamic;
  // Cache Components would force a Suspense boundary around every authenticated page.
  poweredByHeader: false,
  // Browser runs drive a real Chromium through Playwright; it must load from node_modules, not be bundled.
  serverExternalPackages: ["@playwright/test", "playwright", "playwright-core", "@sparticuz/chromium"],
  // Read from disk at runtime (not found by static tracing), so ship them with every function: the Chromium binary
  // and the JSON files playwright-core requires dynamically ("Cannot find module .../browsers.json").
  outputFileTracingIncludes: { "/**": ["./node_modules/@sparticuz/chromium/bin/**", "./node_modules/playwright-core/*.json"] },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
