/** @type {import('next').NextConfig} */
const nextConfig = {
  // E2E runs a second dev server beside the normal one; it needs its own build dir.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Every page is per-user and reads the session cookie, so the app is fully dynamic;
  // Cache Components would force a Suspense boundary around every authenticated page.
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
