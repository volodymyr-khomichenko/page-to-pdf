import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Довга сторінка</title></head>
<body style="margin:0">
  <div style="position:fixed;top:0;left:0;right:0;height:64px;background:#00aa00;z-index:20"></div>
  <div style="position:fixed;right:8px;bottom:8px;width:72px;height:72px;background:#0000ee;z-index:20"></div>
  <main style="margin:0;background:#ffffff">
    <div style="height:90px;background:#111111"></div>
    <div style="height:3900px;background:#ffffff"></div>
    <div style="height:160px;background:#cc2200"></div>
  </main>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((resolve) => server.listen(8099, "127.0.0.1", resolve));

const ext = "/workspace/extension";
const context = await chromium.launchPersistentContext(`/tmp/wp-profile-${Date.now()}`, {
  headless: false,
  viewport: { width: 1000, height: 700 },
  args: [
    "--headless=new",
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    "--silent-debugger-extension-api",
    "--no-first-run",
  ],
});

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:8099/", { waitUntil: "load" });
  await page.bringToFront();
  const captured = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tab = tabs[0];
    if (!tab) throw new Error("no tab");
    return globalThis.__capture(tab);
  });
  if (!captured?.id) throw new Error(`capture failed: ${JSON.stringify(captured)}`);
  const pixels = await worker.evaluate(async (id) => {
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
    const bitmap = await createImageBitmap(shot.blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    const sample = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      width: bitmap.width,
      height: bitmap.height,
      top: sample(20, 8),
      later: sample(20, Math.min(bitmap.height - 1, 2200)),
      bottom: sample(40, bitmap.height - 8),
      widget: sample(bitmap.width - 12, Math.min(bitmap.height - 1, 2200)),
    };
  }, captured.id);

  const result = await context.newPage();
  const downloadPromise = result.waitForEvent("download", { timeout: 20000 });
  await result.goto(`chrome-extension://${extensionId}/result.html?id=${captured.id}`);
  await result.getByRole("button", { name: "PDF — одна сторінка" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const head = fs.readFileSync(file).subarray(0, 8).toString();
  const report = { extensionId, captured, pixels, pdf: head };
  console.log(JSON.stringify(report, null, 2));
  if (pixels.height < 2000) throw new Error(`too short: ${pixels.height}`);
  if (pixels.top[1] < 140 || pixels.top[0] > 80) throw new Error(`top bar missing: ${pixels.top}`);
  if (pixels.later[1] > 140 && pixels.later[0] < 40) throw new Error(`green bar repeated: ${pixels.later}`);
  if (pixels.bottom[0] < 160 || pixels.bottom[1] > 80) throw new Error(`bottom is not red: ${pixels.bottom}`);
  if (pixels.widget[2] > 180 && pixels.widget[0] < 40) throw new Error(`chat widget repeated: ${pixels.widget}`);
  if (!head.startsWith("%PDF")) throw new Error(`bad pdf: ${head}`);
  console.log("EXTENSION_OK");
} finally {
  await context.close();
  server.close();
}
