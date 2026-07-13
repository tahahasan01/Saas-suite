import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@business-os/types"],
  // Pin the monorepo root so Next doesn't infer the home-dir lockfile as root.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
