import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import test from "node:test";
import puppeteer from "puppeteer-core";

const html = fs.readFileSync(new URL("../tests/fixtures/inbox.html", import.meta.url), "utf8");
const ext = new URL("../extension", import.meta.url).pathname;

function swatchColor(n) {
  return [20 + ((n * 47) % 200), 20 + ((n * 89) % 200), 20 + ((n * 131) % 200)];
}

const colors = Array.from({ length: 60 }, (_, index) => swatchColor(index + 1));

test("row swatches are far enough apart to tell 60 rows apart", () => {
  let nearest = Infinity;
  for (let a = 0; a < colors.length; a += 1) {
    for (let b = a + 1; b < colors.length; b += 1) {
      const distance =
        Math.abs(colors[a][0] - colors[b][0]) +
        Math.abs(colors[a][1] - colors[b][1]) +
        Math.abs(colors[a][2] - colors[b][2]);
      nearest = Math.min(nearest, distance);
    }
  }
  assert.ok(nearest >= 40, `swatches collide (${nearest})`);
});

async function resolveChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  try {
    const bundled = await puppeteer.executablePath();
    if (typeof bundled === "string" && fs.existsSync(bundled)) return bundled;
  } catch {
    /* puppeteer-core ships no browser unless one was installed for it */
  }
  for (const candidate of ["/usr/bin/google-chrome", "/usr/bin/chromium"]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function captureInbox(height, dpr, executablePath) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    browser = await puppeteer.launch({
      executablePath,
      headless: false,
      defaultViewport: null,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--headless=new",
        `--force-device-scale-factor=${dpr}`,
        `--disable-extensions-except=${ext}`,
        `--load-extension=${ext}`,
        "--silent-debugger-extension-api",
        "--no-first-run",
        "--window-size=1920,1200",
      ],
    });
    const workerTarget = await browser.waitForTarget((target) => target.type() === "service_worker", {
      timeout: 15000,
    });
    const worker = await workerTarget.worker();
    const page = (await browser.pages())[0] || (await browser.newPage());
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    const session = await page.createCDPSession();
    const { windowId } = await session.send("Browser.getWindowForTarget");
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const inner = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
      if (inner.w === 1920 && inner.h === height) break;
      const { bounds } = await session.send("Browser.getWindowBounds", { windowId });
      await session.send("Browser.setWindowBounds", {
        windowId,
        bounds: {
          width: (bounds.width || inner.w) + (1920 - inner.w),
          height: (bounds.height || inner.h) + (height - inner.h),
          windowState: "normal",
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await page.reload({ waitUntil: "load" });
    await page.bringToFront();
    const metrics = await page.evaluate(() => ({
      dpr: window.devicePixelRatio,
      width: window.innerWidth,
      height: window.innerHeight,
      scroller: document.getElementById("list").clientHeight,
      rows: document.getElementById("list").children.length,
    }));
    assert.equal(metrics.rows, 60);
    assert.ok(Math.abs(metrics.dpr - dpr) < 0.02, `dpr ${metrics.dpr} != ${dpr}`);
    assert.equal(metrics.height, height);
    assert.notEqual(metrics.scroller % 44, 0, `scroller ${metrics.scroller} is a multiple of the row`);
    const captured = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return globalThis.__capture(tabs[0]);
    });
    assert.equal(captured.capture.path, "inner-scroll");
    const pixels = await worker.evaluate(
      async ({ id, cssWidth }) => {
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
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        const scale = bitmap.width / cssWidth;
        const x = Math.round(262 * scale);
        const samples = [];
        for (let y = Math.round(65 * scale); y < bitmap.height; y += 1) {
          const pixel = ctx.getImageData(Math.max(0, x - 1), y, 3, 1).data;
          samples.push([pixel[0], pixel[1], pixel[2], pixel[4], pixel[5], pixel[6], pixel[8], pixel[9], pixel[10]]);
        }
        const side = Array.from(ctx.getImageData(24, bitmap.height - 12, 1, 1).data);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return { ...size, scale, samples, side };
      },
      { id: captured.id, cssWidth: metrics.width },
    );
    const seen = [];
    let last = -1;
    for (const sample of pixels.samples) {
      let hit = -1;
      for (let n = 0; n < colors.length; n += 1) {
        const [r, g, b] = colors[n];
        for (let channel = 0; channel < 9; channel += 3) {
          const distance =
            Math.abs(sample[channel] - r) + Math.abs(sample[channel + 1] - g) + Math.abs(sample[channel + 2] - b);
          if (distance <= 30) {
            hit = n;
            break;
          }
        }
        if (hit >= 0) break;
      }
      if (hit >= 0 && hit !== last) seen.push(hit);
      if (hit >= 0) last = hit;
      else last = -1;
    }
    const expected = colors.map((_, index) => index);
    assert.deepEqual(seen, expected, `rows ${seen.join(",")} at ${height} dpr ${dpr}`);
    const cssHeight = pixels.height / pixels.scale;
    assert.ok(Math.abs(cssHeight - (65 + 60 * 44)) < 48, `css height ${cssHeight}`);
    assert.ok(pixels.side[0] < 40 && pixels.side[2] < 50, `sidebar ${pixels.side}`);
    return { height: pixels.height, cssHeight: Math.round(cssHeight), slices: captured.capture.slices };
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

test("each inbox row appears once at 1200, 1080 and 900, DPR 1 and 1.25", { timeout: 180000 }, async (t) => {
  const executablePath = await resolveChrome();
  if (!executablePath) {
    t.skip(
      "No Chrome or Chromium found. Set CHROME_PATH, or install Google Chrome (/usr/bin/google-chrome) or Chromium (/usr/bin/chromium).",
    );
    return;
  }
  const results = [];
  for (const height of [1200, 1080, 900]) {
    for (const dpr of [1, 1.25]) {
      const result = await captureInbox(height, dpr, executablePath);
      results.push({ height, dpr, ...result });
      console.log(`inbox ${height} dpr ${dpr}: png ${result.height}px css ${result.cssHeight} slices ${result.slices}`);
    }
  }
  assert.equal(results.length, 6);
});
