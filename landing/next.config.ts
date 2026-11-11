import path from "node:path";
import type { NextConfig } from "next";

// Plain static site: `next build` writes HTML/CSS/JS to `out/`, which any static host can serve.
const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    // this folder sits inside the app repo; keep Turbopack from treating the repo root as the project
    // (next is always run from this folder)
    root: path.resolve("."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
