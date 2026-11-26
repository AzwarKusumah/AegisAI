import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expected = {
  chromium: { manifest_version: 3, background: "service_worker" },
  firefox: { manifest_version: 2, background: "scripts" }
};

for (const [name, contract] of Object.entries(expected)) {
  const folder = resolve(root, "dist", name);
  const manifest = JSON.parse(await readFile(resolve(folder, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== contract.manifest_version) {
    throw new Error(name + ": unexpected manifest_version");
  }
  if (!manifest.background || !(contract.background in manifest.background)) {
    throw new Error(name + ": background config missing");
  }
  for (const file of ["background.js", "content.js", "popup.html", "popup.js"]) {
    await stat(resolve(folder, file));
  }
  console.log("Verified " + name + " package");
}
