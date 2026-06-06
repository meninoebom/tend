import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is its own workspace root. The repo also has a root package-lock.json
  // (the Tauri prototype), so Next must not infer the repo root as the workspace root.
  turbopack: {
    root: path.join(__dirname),
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains; preload",
        },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        },
      ],
    },
  ],
};

export default nextConfig;
