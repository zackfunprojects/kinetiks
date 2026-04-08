/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@kinetiks/types",
    "@kinetiks/ui",
    "@kinetiks/synapse",
    "@kinetiks/ai",
    "@kinetiks/cortex",
    "@kinetiks/sentinel",
    "@kinetiks/deskof",
  ],
};

module.exports = nextConfig;
