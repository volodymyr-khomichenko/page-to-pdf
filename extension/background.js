import { hideOverlays, preparePage, restorePage } from "./page-fns.js";
import { putShot } from "./idb.js";

const busy = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function pngSize(bytes) {
  if (bytes.length < 24) return null;
  const width = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const height = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  return { width: width >>> 0, height: height >>> 0 };
}

function blockedUrl(url = "") {
  return /^(chrome|chrome-extension|edge|about|devtools|view-source|chrome-untrusted):/i.test(url)
    || url.startsWith("https://chrome.google.com/webstore")
    || url.startsWith("https://chromewebstore.google.com");
}

function humanError(error) {
  const message = String(error?.message || error || "");
  if (/detach|cancel/i.test(message)) {
    return "Зйомку перервано. Натисніть іконку ще раз і не закривайте плашку Chrome, поки сторінка знімається.";
  }
  if (/permission|activeTab|captureVisibleTab/i.test(message)) {
    return "Chrome не дав зняти видиму частину. Оновіть сторінку і натисніть іконку ще раз.";
  }
  return message || "Не вдалося зняти сторінку";
}

function safeName(title) {
  const cleaned = (title || "сторінка")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || "сторінка";
}

async function send(tabId, method, params) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

async function evaluate(tabId, fn) {
  const expression = `(${fn.toString()})()`;
  const result = await send(tabId, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(detail || "Сторінка не дала себе зняти");
  }
  return result.result?.value;
}

async function attach(tabId) {
  await chrome.debugger.attach({ tabId }, "1.3");
}

async function detach(tabId) {
  try {
    await chrome.debugger.detach({ tabId });
  } catch {
    /* already detached */
  }
}

async function restore(tabId) {
  try {
    await attach(tabId);
  } catch (error) {
    const message = String(error?.message || error);
    if (!/already attached/i.test(message)) throw error;
  }
  try {
    await evaluate(tabId, restorePage);
  } finally {
    await detach(tabId);
  }
}

async function shotToPng(bytesList) {
  if (bytesList.length === 1) {
    const size = pngSize(bytesList[0]);
    if (size && size.width <= 8192 && size.height <= 16384) {
      return {
        blob: new Blob([bytesList[0]], { type: "image/png" }),
        width: size.width,
        height: size.height,
        scaled: false,
      };
    }
  }

  const bitmaps = [];
  for (const bytes of bytesList) {
    bitmaps.push(await createImageBitmap(new Blob([bytes], { type: "image/png" })));
  }
  const width = bitmaps[0].width;
  const height = bitmaps.reduce((sum, bitmap) => sum + bitmap.height, 0);
  let scale = 1;
  if (height > 16384) scale = 16384 / height;
  if (width * scale > 8192) scale = Math.min(scale, 8192 / width);
  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext("2d");
  let y = 0;
  for (let i = 0; i < bitmaps.length; i += 1) {
    const next = i === bitmaps.length - 1 ? outH : Math.round(y + bitmaps[i].height * scale);
    const destY = Math.round(y);
    ctx.drawImage(bitmaps[i], 0, destY, outW, Math.max(1, next - destY));
    y += bitmaps[i].height * scale;
    bitmaps[i].close();
  }
  const blob = await canvas.convertToBlob({ type: "image/png" });
  if (!blob) throw new Error("Сторінка завелика, браузер не зібрав зображення. Спробуйте ще раз.");
  return { blob, width: outW, height: outH, scaled: scale < 0.999 };
}

async function settleScroll(tabId, target) {
  const want = Math.max(0, Math.round(target));
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await send(tabId, "Runtime.evaluate", {
      expression: `(() => new Promise((resolve) => {
        const want = ${want};
        const root = document.scrollingElement || document.documentElement;
        const maxScroll = Math.max(0, root.scrollHeight - window.innerHeight);
        const y = Math.min(want, maxScroll);
        document.documentElement.style.scrollBehavior = "auto";
        window.scrollTo(0, y);
        root.scrollTop = y;
        document.documentElement.scrollTop = y;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setTimeout(() => {
            const now = document.scrollingElement || document.documentElement;
            resolve({
              scrollY: window.scrollY || 0,
              scrollTop: now.scrollTop || 0,
              y,
              maxScroll,
              viewport: window.innerHeight,
            });
          }, 80);
        }));
      }))()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error("Не вдалося прокрутити сторінку");
    last = result.result?.value;
    if (
      last &&
      Math.abs(last.scrollY - last.y) <= 1 &&
      Math.abs(last.scrollTop - last.y) <= 1
    ) {
      return last;
    }
  }
  if (!last) throw new Error("Не вдалося прокрутити сторінку");
  return last;
}

async function grabViewport(tabId) {
  const result = await send(tabId, "Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  if (!result?.data) throw new Error("Chrome не повернув зображення");
  return base64ToBytes(result.data);
}

async function cropSlice(bytes, cssTop, cssHeight, cssViewport) {
  const size = pngSize(bytes);
  if (!size || cssViewport < 1 || cssHeight < 1) return bytes;
  const px = size.height / cssViewport;
  const top = Math.max(0, Math.round(cssTop * px));
  const height = Math.max(1, Math.min(size.height - top, Math.round(cssHeight * px)));
  if (top === 0 && height >= size.height - 2) return bytes;
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(bitmap.width, height);
  canvas.getContext("2d").drawImage(bitmap, 0, top, bitmap.width, height, 0, 0, bitmap.width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  if (!blob) throw new Error("Сторінка завелика, браузер не зібрав зображення. Спробуйте ще раз.");
  return new Uint8Array(await blob.arrayBuffer());
}

async function hideForSlice(tabId) {
  const report = await evaluate(tabId, hideOverlays);
  if (report?.count) {
    console.info("[page-to-pdf] hidden", report.count, (report.names || []).join(", "));
  }
  await send(tabId, "Runtime.evaluate", {
    expression:
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30))))",
    awaitPromise: true,
    returnByValue: true,
  });
  return report;
}

async function captureSurface(tabId, info) {
  const cssHeight = Math.max(1, Math.round(info.cssHeight));
  const tiles = [];
  let covered = 0;
  let guard = 0;
  while (covered < cssHeight - 1 && guard < 80) {
    guard += 1;
    const pos = await settleScroll(tabId, covered);
    if (covered > 0) await hideForSlice(tabId);
    const docEnd = Math.min(cssHeight, pos.y + pos.viewport);
    const start = Math.max(covered, pos.y);
    const keep = docEnd - start;
    if (keep <= 1) break;
    const tile = await grabViewport(tabId);
    tiles.push(await cropSlice(tile, start - pos.y, keep, pos.viewport));
    covered = start + keep;
    await chrome.action.setBadgeText({
      tabId,
      text: `${Math.min(100, Math.round((covered / cssHeight) * 100))}`,
    });
  }
  if (!tiles.length) return null;
  return shotToPng(tiles);
}

async function scrollStitch(tab, cssHeight) {
  const slices = [];
  let covered = 0;
  let guard = 0;
  while (covered < cssHeight - 1 && guard < 80) {
    guard += 1;
    await attach(tab.id);
    let pos;
    try {
      const settled = await settleScroll(tab.id, covered);
      if (covered > 0) await hideForSlice(tab.id);
      pos = {
        y: settled.y,
        viewport: settled.viewport,
        height: Math.min(cssHeight, settled.maxScroll + settled.viewport),
      };
    } finally {
      await detach(tab.id);
    }
    await sleep(60);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const bytes = base64ToBytes(dataUrl.split(",")[1]);
    const docEnd = Math.min(pos.height, pos.y + pos.viewport);
    const needStart = Math.max(covered, pos.y);
    const keep = docEnd - needStart;
    if (keep <= 1) break;
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const pxPerCss = bitmap.height / Math.max(1, pos.viewport);
    const cropTop = Math.max(0, Math.round((needStart - pos.y) * pxPerCss));
    const cropH = Math.max(1, Math.min(bitmap.height - cropTop, Math.round(keep * pxPerCss)));
    const canvas = new OffscreenCanvas(bitmap.width, cropH);
    canvas.getContext("2d").drawImage(bitmap, 0, cropTop, bitmap.width, cropH, 0, 0, bitmap.width, cropH);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (!blob) throw new Error("Сторінка завелика, браузер не зібрав зображення. Спробуйте ще раз.");
    slices.push(new Uint8Array(await blob.arrayBuffer()));
    covered = needStart + keep;
    await chrome.action.setBadgeText({
      tabId: tab.id,
      text: `${Math.min(99, Math.round((covered / cssHeight) * 100))}`,
    });
    if (covered < cssHeight - 1) await sleep(520);
  }
  if (!slices.length) throw new Error("Не вдалося зібрати сторінку прокруткою");
  return shotToPng(slices);
}

async function openResult(id) {
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`result.html?id=${encodeURIComponent(id)}`),
  });
}

async function capture(tab) {
  if (!tab?.id) throw new Error("Немає вкладки");
  if (blockedUrl(tab.url || "")) {
    throw new Error("Цю сторінку Chrome не дає знімати. Відкрийте звичайний сайт.");
  }
  if (busy.has(tab.id)) throw new Error("Ця вкладка вже знімається");
  busy.add(tab.id);
  startKeepAlive();
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#1F4D3A" });
  await chrome.action.setBadgeText({ tabId: tab.id, text: "…" });
  let prepared = false;
  try {
    await attach(tab.id);
    prepared = true;
    const info = await evaluate(tab.id, preparePage);
    let image = null;
    try {
      await send(tab.id, "Page.enable");
      image = await captureSurface(tab.id, info);
    } finally {
      await detach(tab.id);
    }
    if (!image) image = await scrollStitch(tab, info.cssHeight);
    const id = crypto.randomUUID();
    await putShot(id, {
      blob: image.blob,
      width: image.width,
      height: image.height,
      scaled: image.scaled,
      truncated: Boolean(info.truncated),
      title: safeName(tab.title),
      url: tab.url || "",
      created: Date.now(),
    });
    await openResult(id);
    return { id, width: image.width, height: image.height };
  } finally {
    if (prepared) {
      try {
        await restore(tab.id);
      } catch {
        /* page may have closed */
      }
    }
    busy.delete(tab.id);
    stopKeepAlive();
    chrome.action.setBadgeText({ tabId: tab.id, text: "" }).catch(() => {});
  }
}

async function releaseStuckDebuggers() {
  try {
    const targets = await chrome.debugger.getTargets();
    await Promise.all(
      targets
        .filter((target) => target.attached && target.tabId)
        .map((target) => chrome.debugger.detach({ tabId: target.tabId }).catch(() => {})),
    );
  } catch {
    /* debugger unavailable during startup */
  }
}

let keepAliveTimer = null;

function startKeepAlive() {
  stopKeepAlive();
  const tick = () => {
    chrome.runtime.getPlatformInfo().catch(() => {});
  };
  tick();
  keepAliveTimer = setInterval(tick, 20000);
  chrome.alarms?.create("page-to-pdf-keepalive", { delayInMinutes: 0.4, periodInMinutes: 0.4 }).catch(() => {});
}

function stopKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
  chrome.alarms?.clear("page-to-pdf-keepalive").catch(() => {});
}

releaseStuckDebuggers();

globalThis.__capture = capture;

chrome.action.onClicked.addListener((tab) => {
  capture(tab).catch(async (error) => {
    const id = crypto.randomUUID();
    const message = humanError(error);
    try {
      await putShot(id, { error: message, title: safeName(tab.title), url: tab.url || "", created: Date.now() });
      await openResult(id);
    } catch {
      /* nowhere to report */
    }
  });
});

chrome.debugger.onDetach.addListener(() => {
  /* user cancelled the infobar; the in-flight capture fails on its own */
});
