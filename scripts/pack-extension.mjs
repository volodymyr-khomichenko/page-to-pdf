import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pub = path.resolve("public");
fs.mkdirSync(pub, { recursive: true });

const unpacked = path.join(pub, "page-to-pdf.zip");
const store = path.join(pub, `page-to-pdf-${manifest.version}-cws.zip`);
const skipInStore = new Set(["README.txt"]);

function files(dir, base = "") {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...files(full, rel));
    else out.push(rel);
  }
  return out;
}

const list = files(root);
const script = `
import os, sys, zipfile
root, unpacked, store = sys.argv[1:4]
skip = set(sys.argv[4].split(",")) if sys.argv[4] else set()
files = sys.argv[5:]
for path in (unpacked, store):
    if os.path.exists(path):
        os.remove(path)
with zipfile.ZipFile(unpacked, "w", zipfile.ZIP_DEFLATED) as whole, zipfile.ZipFile(store, "w", zipfile.ZIP_DEFLATED) as cws:
    for rel in files:
        full = os.path.join(root, rel)
        whole.write(full, "page-to-pdf/" + rel.replace("\\\\", "/"))
        if rel.replace("\\\\", "/") not in skip:
            cws.write(full, rel.replace("\\\\", "/"))
print(unpacked)
print(store)
`;
const result = spawnSync("python3", ["-c", script, root, unpacked, store, [...skipInStore].join(","), ...list], {
  encoding: "utf8",
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || "");
  process.exit(result.status || 1);
}
process.stdout.write(result.stdout || "");
