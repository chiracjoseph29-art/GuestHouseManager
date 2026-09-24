import type { NextConfig } from "next";
import { resolveAllowedDevOrigins } from "./src/server/config/dev-origins";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: resolveAllowedDevOrigins(),
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
