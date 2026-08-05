import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.platform === "win32" ? {} : { output: "standalone" as const }),
  transpilePackages: ["@marctco/db", "@marctco/domain"]
};

export default nextConfig;
