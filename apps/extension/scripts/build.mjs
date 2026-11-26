import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variants = {
  chromium: { manifest: "manifest.chromium.json", target: "chrome120" },
  firefox: { manifest: "manifest.firefox.json", target: "firefox115" }
};
const requested = process.argv[2] ?? "all";
const names = requested === "all" ? Object.keys(variants) : [requested];

for (const name of names) {
  const variant = variants[name];
  if (!variant) throw new Error("Unknown browser target: " + name + ". Use chromium, firefox, or all.");

  const output = resolve(root, "dist", name);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  await build({
    entryPoints: {
      background: resolve(root, "src/background.ts"),
      content: resolve(root, "src/content.ts")
    },
    bundle: true,
    platform: "browser",
    target: variant.target,
    format: "iife",
    minify: true,
    sourcemap: false,
    outdir: output,
    logLevel: "info"
  });

  await cp(resolve(root, variant.manifest), resolve(output, "manifest.json"));
  await cp(resolve(root, "popup.html"), resolve(output, "popup.html"));
  await cp(resolve(root, "popup.js"), resolve(output, "popup.js"));
  console.log("Built " + name + " extension: " + output);
}
