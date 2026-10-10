import { build } from "esbuild";

await build({
  entryPoints: ["server/vercel.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "api/server.js",
  external: ["ws"],
});
