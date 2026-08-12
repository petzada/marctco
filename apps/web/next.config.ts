import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.platform === "win32" ? {} : { output: "standalone" as const }),
  transpilePackages: ["@marctco/db", "@marctco/domain"],
  // Server-only Node packages, loaded by `instrumentation.ts` and never by a
  // browser. Bundling them buys nothing and costs something concrete: inlined
  // into `.next/server/chunks`, a dependency's code no longer sits under
  // `node_modules`, so Node stops suppressing its deprecation warnings and the
  // logs fill with a call this app does not make. That is how ioredis's
  // `url.parse()` (DEP0169, fixed upstream only in 5.11.0) started showing up
  // here. `pino` is on Next's own default list for the same family of reasons.
  serverExternalPackages: ["bullmq", "ioredis"]
};

export default nextConfig;
