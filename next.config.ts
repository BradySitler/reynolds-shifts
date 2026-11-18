import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-person and signed-in, so pages render on each request
  // instead of using Cache Components' prerendered shells.
  cacheComponents: false,
  serverExternalPackages: ["exceljs", "nodemailer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
