/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@kinetiks/types",
    "@kinetiks/ui",
    "@kinetiks/lib",
    "@kinetiks/supabase",
    "@kinetiks/synapse",
    "@kinetiks/ai",
    "@kinetiks/cortex",
    "@kinetiks/tools",
    "@kinetiks/runtime",
  ],
  experimental: {
    // Packages that webpack should leave alone for the server runtime
    // (Node-style require, no bundling). These libs use Node-only APIs
    // (gRPC, fs, stream) and break the Edge bundle when transitively
    // reached from instrumentation.ts.
    serverComponentsExternalPackages: [
      "@mendable/firecrawl-js",
      "@google-analytics/data",
      "google-auth-library",
      "googleapis",
      "@grpc/grpc-js",
    ],
    instrumentationHook: true,
  },
  async redirects() {
    return [
      { source: "/home", destination: "/chat", permanent: true },
      { source: "/marcus", destination: "/chat", permanent: true },
      // C2 — billing, API keys, and brief schedules live in the
      // Settings modal (avatar menu); the chat shell is the landing.
      { source: "/marcus/schedules", destination: "/chat", permanent: true },
      { source: "/billing", destination: "/chat", permanent: true },
      { source: "/settings", destination: "/chat", permanent: true },
      { source: "/context", destination: "/cortex/identity", permanent: true },
      { source: "/context/:layer", destination: "/cortex/identity/:layer", permanent: true },
      { source: "/ledger", destination: "/cortex/ledger", permanent: true },
      { source: "/connections", destination: "/cortex/integrations", permanent: true },
      { source: "/imports", destination: "/cortex/integrations", permanent: true },
      { source: "/apps", destination: "/cortex/integrations", permanent: true },
    ];
  },
};

module.exports = nextConfig;
