import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  experimental: {
    // proxy.ts (SSO) makes Next buffer every request body, cut off at 10 MB by
    // default. Ad Studio's Generic playground posts attached images base64-
    // encoded (up to 40 MB of files, ~54 MB encoded), so allow a bit more.
    proxyClientMaxBodySize: "60mb",
  },
};

export default nextConfig;
