import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the ngrok tunnel host to access dev resources (HMR, etc.).
  allowedDevOrigins: ["kind-intensely-herring.ngrok-free.app"],
  // Explicitly set Turbopack root to avoid staleness warnings and module resolution errors.
  turbopack: {
    // The root directory for Turbopack. __dirname resolves to the workspace root.
    root: __dirname,
  },
};

export default nextConfig;
