import { framesNeedWait, hideOverlays, preparePage, restorePage } from "./page-fns.js";
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
  const MAX_H = 32768;
  const MAX_W = 8192;
  const bitmaps = [];
  for (const bytes of bytesList) {
    bitmaps.push(await createImageBitmap(new Blob([bytes], { type: "image/png" })));
  }
  const width = bitmaps[0].width;
  const height = bitmaps.reduce((sum, bitmap) => sum + bitmap.height, 0);
  let scale = 1;
  if (height > MAX_H) scale = MAX_H / height;
  if (width * scale > MAX_W) scale = Math.min(scale, MAX_W / width);
  const scaled = scale < 0.999;
  if (!scaled && width <= MAX_W && height <= 16384) {
    if (bitmaps.length === 1) {
      const blob = new Blob([bytesList[0]], { type: "image/png" });
      bitmaps[0].close();
      return { blob, width, height, scaled: false };
    }
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    let y = 0;
    for (const bitmap of bitmaps) {
      ctx.drawImage(bitmap, 0, y);
      y += bitmap.height;
      bitmap.close();
    }
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (!blob) throw new Error("Сторінка завелика, браузер не зібрав зображення. Спробуйте ще раз.");
    return { blob, width, height, scaled: false };
  }

  const outW = Math.max(1, Math.round(width * scale));
  const outH = Math.max(1, Math.round(height * scale));
  const blob = await encodePng(bitmaps, outW, outH, scale);
  return { blob, width: outW, height: outH, scaled };
}

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const signed = new Uint8Array(4 + data.length);
  signed.set(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc32(signed));
  return out;
}

async function encodePng(bitmaps, outW, outH, scale) {
  const stream = new CompressionStream("deflate");
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const compressed = [];
  const pump = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      compressed.push(value);
    }
  })();
  let destY = 0;
  for (let i = 0; i < bitmaps.length; i += 1) {
    const bitmap = bitmaps[i];
    const srcH = bitmap.height;
    const next = i === bitmaps.length - 1 ? outH : Math.round(destY + srcH * scale);
    const tileH = Math.max(1, next - Math.round(destY));
    const canvas = new OffscreenCanvas(outW, tileH);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, outW, tileH);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, outW, tileH).data;
    const stride = outW * 4;
    for (let y = 0; y < tileH; y += 1) {
      const row = new Uint8Array(1 + stride);
      row.set(pixels.subarray(y * stride, (y + 1) * stride), 1);
      await writer.write(row);
    }
    destY += srcH * scale;
  }
  await writer.close();
  await pump;
  let size = 0;
  for (const part of compressed) size += part.length;
  const idat = new Uint8Array(size);
  let offset = 0;
  for (const part of compressed) {
    idat.set(part, offset);
    offset += part.length;
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, outW);
  view.setUint32(4, outH);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [signature, pngChunk("IHDR", ihdr)];
  const chunkSize = 1024 * 1024;
  for (let i = 0; i < idat.length; i += chunkSize) {
    parts.push(pngChunk("IDAT", idat.subarray(i, i + chunkSize)));
  }
  parts.push(pngChunk("IEND", new Uint8Array()));
  const blob = new Blob(parts, { type: "image/png" });
  if (!blob.size) throw new Error("Сторінка завелика, браузер не зібрав зображення. Спробуйте ще раз.");
  return blob;
}

async function settleScroll(tabId, target) {
  const want = Math.max(0, Math.round(target));
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await send(tabId, "Runtime.evaluate", {
      expression: `(() => new Promise((resolve) => {
        const want = ${want};
        const marked = document.querySelector("[data-wp-scroller]");
        const root = marked || document.scrollingElement || document.documentElement;
        const viewport = marked ? marked.clientHeight : window.innerHeight;
        const maxScroll = Math.max(0, root.scrollHeight - viewport);
        const y = Math.min(want, maxScroll);
        document.documentElement.style.scrollBehavior = "auto";
        root.scrollTop = y;
        if (!marked) {
          window.scrollTo(0, y);
          document.documentElement.scrollTop = y;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setTimeout(() => {
            const now = marked || document.scrollingElement || document.documentElement;
            resolve({
              scrollY: marked ? now.scrollTop || 0 : window.scrollY || 0,
              scrollTop: now.scrollTop || 0,
              y,
              maxScroll,
              viewport,
              inner: Boolean(marked),
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
      Math.abs(last.scrollTop - last.y) <= 1 &&
      (last.inner || Math.abs(last.scrollY - last.y) <= 1)
    ) {
      return last;
    }
  }
  if (!last) throw new Error("Не вдалося прокрутити сторінку");
  return last;
}

async function showProgress(tabId, n, total) {
  const label = `Capturing… slice ${n} of ${total}`;
  await chrome.action.setTitle({ tabId, title: label });
  await chrome.action.setBadgeText({ tabId, text: `${n}/${total}`.slice(0, 4) });
  await send(tabId, "Runtime.evaluate", {
    expression: `(() => {
      let el = document.getElementById("wp-progress");
      if (!el) {
        el = document.createElement("div");
        el.id = "wp-progress";
        el.setAttribute("style", "position:fixed;z-index:2147483647;left:50%;bottom:16px;transform:translateX(-50%);background:#1F4D3A;color:#fff;font:600 14px/1.2 sans-serif;padding:8px 14px;border-radius:999px;pointer-events:none");
        document.documentElement.appendChild(el);
      }
      el.textContent = ${JSON.stringify(label)};
    })()`,
    returnByValue: true,
  });
}

async function clearProgress(tabId) {
  await send(tabId, "Runtime.evaluate", {
    expression: `document.getElementById("wp-progress")?.remove()`,
    returnByValue: true,
  });
}

function surfaceTooTall(bytes, viewport) {
  const size = pngSize(bytes);
  return Boolean(size && viewport > 0 && size.height > viewport * 1.35);
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

async function waitForSlice(tabId) {
  const pending = await evaluate(tabId, framesNeedWait);
  if (!pending) return;
  let inflight = 0;
  let idleAt = Date.now();
  const onEvent = (source, method) => {
    if (source.tabId !== tabId) return;
    if (method === "Network.requestWillBeSent") {
      inflight += 1;
      idleAt = Date.now() + 100000;
    } else if (method === "Network.loadingFinished" || method === "Network.loadingFailed") {
      inflight = Math.max(0, inflight - 1);
      if (inflight === 0) idleAt = Date.now();
    }
  };
  chrome.debugger.onEvent.addListener(onEvent);
  try {
    await send(tabId, "Network.enable", {});
  } catch {
    /* network domain is optional */
  }
  const deadline = Date.now() + 6000;
  const started = Date.now();
  let stableSince = started;
  let lastWaiting = pending;
  try {
    while (Date.now() < deadline) {
      const still = await evaluate(tabId, framesNeedWait);
      const idle = inflight === 0 && Date.now() - idleAt >= 500;
      if (!still && idle) return;
      if (still !== lastWaiting) {
        lastWaiting = still;
        stableSince = Date.now();
      }
      if (idle && Date.now() - stableSince >= 1600 && Date.now() - started >= 1600) return;
      await sleep(150);
    }
  } finally {
    chrome.debugger.onEvent.removeListener(onEvent);
    try {
      await send(tabId, "Network.disable", {});
    } catch {
      /* already off */
    }
  }
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
  const hidden = [];
  let covered = 0;
  let guard = 0;
  const total = Math.max(1, Math.ceil(cssHeight / Math.max(1, info.viewportHeight || 800)));
  while (covered < cssHeight - 1 && guard < 80) {
    guard += 1;
    await showProgress(tabId, tiles.length + 1, total);
    const pos = await settleScroll(tabId, covered);
    if (covered > 0) {
      const report = await hideForSlice(tabId);
      hidden.push(report?.count || 0);
    } else {
      hidden.push(0);
    }
    await waitForSlice(tabId);
    const docEnd = Math.min(cssHeight, pos.y + pos.viewport);
    const start = Math.max(covered, pos.y);
    const keep = docEnd - start;
    if (keep <= 1) break;
    await clearProgress(tabId);
    const tile = await grabViewport(tabId);
    if (surfaceTooTall(tile, pos.viewport)) {
      console.info("[page-to-pdf] surface taller than the viewport, using scroll-stitch");
      return null;
    }
    tiles.push(await cropSlice(tile, start - pos.y, keep, pos.viewport));
    covered = start + keep;
  }
  await clearProgress(tabId);
  if (!tiles.length) return null;
  const image = await shotToPng(tiles);
  return { image, hidden, slices: tiles.length, path: "viewport-stitch" };
}

async function scrollStitch(tab, cssHeight, info) {
  const slices = [];
  const hidden = [];
  let covered = 0;
  let guard = 0;
  const viewportGuess = Math.max(1, info?.viewportHeight || 800);
  const total = Math.max(1, Math.ceil(cssHeight / viewportGuess));
  while (covered < cssHeight - 1 && guard < 80) {
    guard += 1;
    await attach(tab.id);
    let pos;
    try {
      await showProgress(tab.id, slices.length + 1, total);
      const settled = await settleScroll(tab.id, covered);
      if (covered > 0) {
        const report = await hideForSlice(tab.id);
        hidden.push(report?.count || 0);
      } else {
        hidden.push(0);
      }
      await waitForSlice(tab.id);
      pos = {
        y: settled.y,
        viewport: settled.viewport,
        height: Math.min(cssHeight, settled.maxScroll + settled.viewport),
      };
      await clearProgress(tab.id);
    } finally {
      await detach(tab.id);
    }
    await sleep(90);
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
  }
  if (!slices.length) throw new Error("Не вдалося зібрати сторінку прокруткою");
  const image = await shotToPng(slices);
  return { image, hidden, slices: slices.length, path: "scroll-stitch" };
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
    const started = Date.now();
    console.info(
      "[page-to-pdf] page",
      info.cssWidth,
      info.cssHeight,
      info.fullHeight,
      info.viewportHeight,
      info.scrollMode,
      info.scroller,
    );
    let shot = null;
    try {
      await send(tab.id, "Page.enable");
      shot = await captureSurface(tab.id, info);
    } finally {
      await detach(tab.id);
    }
    if (!shot) shot = await scrollStitch(tab, info.cssHeight, info);
    const image = shot.image;
    const captureMeta = {
      path: shot.path,
      scroller: info.scroller || "document",
      slices: shot.slices,
      hidden: shot.hidden || [],
      ms: Date.now() - started,
    };
    captureMeta.line = `path=${captureMeta.path} scroller=${captureMeta.scroller} slices=${captureMeta.slices} hidden=${captureMeta.hidden.join(",")} ms=${captureMeta.ms}`;
    console.info("[page-to-pdf]", captureMeta.line);
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
      capture: captureMeta,
    });
    await openResult(id);
    return { id, width: image.width, height: image.height, capture: captureMeta };
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
    chrome.action.setTitle({ tabId: tab.id, title: "Зняти всю сторінку в PDF" }).catch(() => {});
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
