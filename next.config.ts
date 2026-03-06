import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.20.10.2"],

  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;