import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        /* Required for the relayer SDK's WASM (SharedArrayBuffer) on /balance.
         * credentialless (not require-corp) so unrelated cross-origin assets
         * (fonts, hero video) that lack CORP headers still load. */
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
