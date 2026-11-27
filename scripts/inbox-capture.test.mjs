import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import test from "node:test";
import puppeteer from "puppeteer-core";
import { chromium } from "playwright";

const html = fs.readFileSync(new URL("../tests/fixtures/inbox.html", import.meta.url), "utf8");
const expectedHeight = 56 + 60 * 44;

test("inner scroll keeps all 60 inbox rows", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const ext = new URL("../extension", import.meta.url).pathname;
  const browser = await puppeteer.launch({
    executablePath: chromium.executablePath(),
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--headless=new",
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
      "--silent-debugger-extension-api",
      "--no-first-run",
      "--window-size=1280,800",
    ],
    defaultViewport: { width: 1280, height: 800 },
  });
  try {
    const workerTarget = await browser.waitForTarget((target) => target.type() === "service_worker", {
      timeout: 15000,
    });
    const worker = await workerTarget.worker();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
    await page.bringToFront();
    const captured = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return globalThis.__capture(tabs[0]);
    });
    assert.equal(captured.capture.path, "inner-scroll");
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
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bitmap, 0, 0);
      const hasInk = (y) => {
        const row = ctx.getImageData(260, y, 220, 1).data;
        for (let i = 0; i < row.length; i += 4) {
          if (row[i] < 90) return true;
        }
        return false;
      };
      let blank = 0;
      let worst = 0;
      for (let y = 56; y < bitmap.height; y += 2) {
        if (hasInk(y)) {
          worst = Math.max(worst, blank);
          blank = 0;
        } else {
          blank += 2;
        }
      }
      worst = Math.max(worst, blank);
      const last = ctx.getImageData(260, bitmap.height - 24, 220, 12).data;
      let lastInk = 0;
      for (let i = 0; i < last.length; i += 4) {
        if (last[i] < 90) lastInk += 1;
      }
      const side = ctx.getImageData(24, bitmap.height - 12, 1, 1).data;
      return { width: bitmap.width, height: bitmap.height, worst, lastInk, side: Array.from(side) };
    }, captured.id);
    assert.ok(
      Math.abs(pixels.height - expectedHeight) < 80,
      `height ${pixels.height} is not near ${expectedHeight}`,
    );
    assert.ok(pixels.worst < 120, `white band in the list is ${pixels.worst}px`);
    assert.ok(pixels.lastInk > 8, `last row is blank (${pixels.lastInk} ink pixels)`);
    assert.ok(pixels.side[0] < 40 && pixels.side[1] < 40 && pixels.side[2] < 50, `sidebar ${pixels.side}`);
  } finally {
    await browser.close();
    server.close();
  }
});
