/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@kinetiks/types",
    "@kinetiks/ui",
    "@kinetiks/supabase",
    "@kinetiks/synapse",
    "@kinetiks/ai",
    "@kinetiks/sentinel",
  ],
};

module.exports = nextConfig;
