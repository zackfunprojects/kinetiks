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
    serverComponentsExternalPackages: ["@mendable/firecrawl-js"],
    instrumentationHook: true,
  },
  async redirects() {
    return [
      { source: "/home", destination: "/chat", permanent: true },
      { source: "/marcus", destination: "/chat", permanent: true },
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
