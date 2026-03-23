/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@kinetiks/types",
    "@kinetiks/ui",
    "@kinetiks/supabase",
    "@kinetiks/synapse",
    "@kinetiks/ai",
  ],
  experimental: {
    serverComponentsExternalPackages: ["@mendable/firecrawl-js"],
  },
};

module.exports = nextConfig;
