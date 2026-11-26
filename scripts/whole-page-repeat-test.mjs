import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const pages = [
  ["mdn", "https://developer.mozilla.org/en-US/docs/Web/CSS/position"],
  ["wiki", "https://en.wikipedia.org/wiki/Screenshot"],
  ["react", "https://react.dev/reference/react/useState"],
  ["github", "https://docs.github.com/en/get-started/start-your-journey/hello-world"],
];

const ext = "/workspace/extension";
const context = await chromium.launchPersistentContext(`/tmp/wp105-${Date.now()}`, {
  headless: false,
  viewport: { width: 1720, height: 900 },
  args: [
    "--headless=new",
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    "--silent-debugger-extension-api",
    "--no-first-run",
  ],
});

let worker = context.serviceWorkers()[0];
if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
worker.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("page-to-pdf")) console.log("SW", text);
});

function checkImage(file, name, metrics) {
  const result = spawnSync(
    "python3",
    ["-c", `
import json, sys
from PIL import Image
name, vw, vh = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
im = Image.open(sys.argv[4])
slice_h = max(1, round(vh * im.width / vw))
def dark(x0, x1, y0, y1):
    n = 0
    for y in range(max(0, y0), min(im.height, y1), 4):
        for x in range(max(0, x0), min(im.width, x1), 3):
            p = im.getpixel((x, y))
            if p[0] < 80 and p[1] < 80 and p[2] < 90:
                n += 1
    return n
fails = []
left0 = dark(24, 260, 80, min(slice_h, im.height))
right0 = dark(im.width - 280, im.width - 24, 80, min(slice_h, im.height))
print(json.dumps({"name": name, "size": im.size, "slice": slice_h, "left0": left0, "right0": right0}))
y = slice_h
while y + slice_h <= im.height + 30:
    left = dark(24, 260, y + 40, y + slice_h - 20)
    right = dark(im.width - 280, im.width - 24, y + 40, y + slice_h - 20)
    print(json.dumps({"band": y, "L": left, "R": right}))
    if left0 > 25 and left > left0 * 0.45:
        fails.append(f"{name}: left rail repeated at y={y} ({left} vs {left0})")
    if right0 > 25 and right > right0 * 0.45:
        fails.append(f"{name}: right rail repeated at y={y} ({right} vs {right0})")
    y += slice_h
if im.height == 16384 and im.height < slice_h * 3:
    fails.append(f"{name}: image is stuck at the 16384 canvas cap")
print("FAILS")
print("\\n".join(fails))
`, name, String(metrics.vw), String(metrics.vh), file],
    { encoding: "utf8" },
  );
  process.stdout.write(result.stdout || "");
  if (result.stderr) process.stderr.write(result.stderr);
  const fails = (result.stdout || "").split("FAILS\n")[1] || "";
  return fails.trim();
}

try {
  const failures = [];
  for (const [name, url] of pages) {
    const page = await context.newPage();
    console.log("loading", name);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1200);
    const metrics = await page.evaluate(() => ({ vw: window.innerWidth, vh: window.innerHeight }));
    await page.bringToFront();
    await page.waitForFunction(
      () => document.documentElement.scrollHeight > window.innerHeight + 400,
      { timeout: 20000 },
    ).catch(() => {});
    await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({});
      await Promise.all(
        tabs
          .filter((tab) => (tab.url || "").includes("/result.html"))
          .map((tab) => chrome.tabs.remove(tab.id)),
      );
    });
    await page.bringToFront();
    console.log("capturing", name);
    const captured = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      const tab = tabs[0];
      if (!tab?.id) throw new Error("no tab");
      return globalThis.__capture(tab);
    });
    const b64 = await worker.evaluate(async (id) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open("wholepage", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const shot = await new Promise((resolve, reject) => {
        const tx = db.transaction("shots", "readonly");
        const request = tx.objectStore("shots").get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (shot?.error) throw new Error(shot.error);
      const bytes = new Uint8Array(await shot.blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return { w: shot.width, h: shot.height, scaled: Boolean(shot.scaled), b64: btoa(s) };
    }, captured.id);
    const file = `/tmp/repeat-${name}.png`;
    fs.writeFileSync(file, Buffer.from(b64.b64, "base64"));
    console.log(name, "saved", b64.w, b64.h, "scaled", b64.scaled, file);
    const fail = checkImage(file, name, metrics);
    if (fail) failures.push(fail);
    await page.close();
  }
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("REPEAT_OK");
  }
} finally {
  await context.close();
}
