/** @type {import('next').NextConfig} */
const nextConfig = {
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
