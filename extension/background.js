import { framesNeedWait, hideOverlays, preparePage, restorePage } from "./page-fns.js";
import { chooseScrollMode, contentBox, captureOverlap, seamBandCss, innerScrollTarget, matchBandOffset, nextInnerStrip, sidebarColumns, viewportArea } from "./scroll-plan.js";
import { putShot } from "./idb.js";

const busy = new Set();

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

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
    return t("captureInterrupted");
  }
  if (/cannot access a |extensions gallery|cannot be scripted|webstore/i.test(message)) {
    return t("blockedPage");
  }
  if (/permission|activeTab|captureVisibleTab/i.test(message)) {
    return t("visibleDenied");
  }
  return message || t("captureFailed");
}

function safeName(title) {
  const cleaned = (title || t("pageFallback"))
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || t("pageFallback");
}

async function send(tabId, method, params) {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

async function evaluate(tabId, fn, extras = []) {
  const prelude = extras.map((helper) => helper.toString()).join("\n");
  const expression = `${prelude}\n(${fn.toString()})()`;
  const result = await send(tabId, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
    throw new Error(detail || t("pageRefused"));
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
    if (!blob) throw new Error(t("imageTooBig"));
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
  if (!blob.size) throw new Error(t("imageTooBig"));
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
    if (result.exceptionDetails) throw new Error(t("scrollFailed"));
    last = result.result?.value;
    if (
      last &&
      Math.abs(last.scrollTop - last.y) <= 1 &&
      (last.inner || Math.abs(last.scrollY - last.y) <= 1)
    ) {
      return last;
    }
  }
  if (!last) throw new Error(t("scrollFailed"));
  return last;
}

async function showProgress(tabId, n, total) {
  const label = t("capturing", [String(n), String(total)]);
  const ratio = Math.max(0.06, Math.min(1, n / Math.max(1, total)));
  await chrome.action.setTitle({ tabId, title: label });
  await chrome.action.setBadgeText({ tabId, text: `${n}/${total}`.slice(0, 4) });
  await send(tabId, "Runtime.evaluate", {
    expression: `(() => {
      let el = document.getElementById("wp-progress");
      if (!el) {
        el = document.createElement("div");
        el.id = "wp-progress";
        el.setAttribute("style", "position:fixed;z-index:2147483647;left:0;right:0;bottom:0;height:36px;display:flex;align-items:center;gap:12px;padding:0 14px;background:#ffffff;border-top:1px solid #DCE1EA;pointer-events:none;font:600 12px/1 Roboto,Arial,sans-serif;color:#111827");
        el.innerHTML = '<span id="wp-progress-label" style="white-space:nowrap"></span><span style="flex:1;height:10px;background:#DCE1EA;border-radius:3px;overflow:hidden"><span id="wp-progress-fill" style="display:block;height:100%;width:0;background:#2449D8;transition:width .6s linear"></span></span>';
        document.documentElement.appendChild(el);
      }
      const labelEl = el.querySelector("#wp-progress-label");
      const fill = el.querySelector("#wp-progress-fill");
      if (labelEl) labelEl.textContent = ${JSON.stringify(label)};
      if (fill) fill.style.width = "${Math.round(ratio * 100)}%";
      el.style.visibility = "visible";
    })()`,
    returnByValue: true,
  });
}

async function concealProgress(tabId) {
  await send(tabId, "Runtime.evaluate", {
    expression: `(() => {
      const el = document.getElementById("wp-progress");
      if (el) el.style.visibility = "hidden";
      return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 40))));
    })()`,
    awaitPromise: true,
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
  if (!result?.data) throw new Error(t("noImage"));
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
  if (!blob) throw new Error(t("imageTooBig"));
  return new Uint8Array(await blob.arrayBuffer());
}

async function cropDevicePixels(bytes, rect) {
  const size = pngSize(bytes);
  if (!size) return bytes;
  const x = Math.max(0, Math.min(size.width - 1, rect.x));
  const y = Math.max(0, Math.min(size.height - 1, rect.y));
  const width = Math.max(1, Math.min(size.width - x, rect.width));
  const height = Math.max(1, Math.min(size.height - y, rect.height));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d").drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  if (!blob) throw new Error(t("imageTooBig"));
  return new Uint8Array(await blob.arrayBuffer());
}

const SEAM_BLEND = 0;
const SEAM_WINDOW = 16;
const SEAM_THRESHOLD = 12;

async function fadeBytes(prevBytes, frameBytes, cut, blend) {
  const prev = await createImageBitmap(new Blob([prevBytes], { type: "image/png" }));
  const frame = await createImageBitmap(new Blob([frameBytes], { type: "image/png" }));
  const width = prev.width;
  if (frame.width !== width || cut < blend || cut > frame.height || prev.height < blend) {
    prev.close();
    frame.close();
    return prevBytes;
  }
  const canvas = new OffscreenCanvas(width, prev.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(prev, 0, 0);
  const old = ctx.getImageData(0, prev.height - blend, width, blend);
  const scratch = new OffscreenCanvas(width, blend);
  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  scratchCtx.drawImage(frame, 0, cut - blend, width, blend, 0, 0, width, blend);
  const incoming = scratchCtx.getImageData(0, 0, width, blend);
  const before = old.data;
  const after = incoming.data;
  for (let row = 0; row < blend; row += 1) {
    const alpha = (row + 1) / (blend + 1);
    const keep = 1 - alpha;
    const start = row * width * 4;
    for (let i = start; i < start + width * 4; i += 4) {
      before[i] = before[i] * keep + after[i] * alpha;
      before[i + 1] = before[i + 1] * keep + after[i + 1] * alpha;
      before[i + 2] = before[i + 2] * keep + after[i + 2] * alpha;
    }
  }
  ctx.putImageData(old, 0, prev.height - blend);
  prev.close();
  frame.close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  if (!blob) return prevBytes;
  return new Uint8Array(await blob.arrayBuffer());
}

async function joinFrame(previousBytes, frameBytes, expectedCss, viewportCss, overlapCss) {
  const view = await imageGray(frameBytes);
  const scale = view.height / Math.max(1, viewportCss);
  const expectedCut = Math.round(Math.max(0, expectedCss) * scale);
  let cut = Math.max(0, Math.min(view.height - 1, expectedCut));
  if (previousBytes && expectedCss > 8) {
    const previous = await imageGray(previousBytes);
    const bandH = Math.min(
      previous.height - 1,
      Math.max(8, Math.round(seamBandCss(overlapCss || expectedCss) * scale)),
    );
    if (bandH >= 8 && expectedCut > bandH && bandH < view.height && previous.width === view.width) {
      const band = previous.gray.subarray((previous.height - bandH) * previous.width);
      const match = matchBandOffset({
        band,
        bandWidth: previous.width,
        bandHeight: bandH,
        frame: view.gray,
        frameWidth: view.width,
        frameHeight: view.height,
        expectedTop: expectedCut - bandH,
        windowPx: SEAM_WINDOW,
        threshold: SEAM_THRESHOLD,
      });
      if (match.matched) cut = match.cut;
    }
  }
  const blend = Math.max(0, Math.min(SEAM_BLEND, cut));
  const prevOut =
    previousBytes && blend >= 2 ? await fadeBytes(previousBytes, frameBytes, cut, blend) : previousBytes;
  const rows = await cropDevicePixels(frameBytes, {
    x: 0,
    y: cut,
    width: view.width,
    height: Math.max(1, view.height - cut),
  });
  return { rows, prevOut, height: view.height - cut };
}

function paintStrip(ctx, bitmap, x, y, blend) {
  const width = bitmap.width;
  const fresh = bitmap.height - blend;
  if (blend >= 2 && y >= blend && x >= 0) {
    const old = ctx.getImageData(x, y - blend, width, blend);
    const scratch = new OffscreenCanvas(width, blend);
    const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
    scratchCtx.drawImage(bitmap, 0, 0, width, blend, 0, 0, width, blend);
    const incoming = scratchCtx.getImageData(0, 0, width, blend);
    const before = old.data;
    const after = incoming.data;
    for (let row = 0; row < blend; row += 1) {
      const alpha = (row + 1) / (blend + 1);
      const keep = 1 - alpha;
      const start = row * width * 4;
      for (let i = start; i < start + width * 4; i += 4) {
        before[i] = before[i] * keep + after[i] * alpha;
        before[i + 1] = before[i + 1] * keep + after[i + 1] * alpha;
        before[i + 2] = before[i + 2] * keep + after[i + 2] * alpha;
      }
    }
    ctx.putImageData(old, x, y - blend);
  }
  if (fresh > 0) ctx.drawImage(bitmap, 0, blend, width, fresh, x, y, width, fresh);
}

async function composeInner(tiles, cssWidth) {
  const bitmaps = [];
  for (const tile of tiles) {
    bitmaps.push(await createImageBitmap(new Blob([tile.bytes], { type: "image/png" })));
  }
  const fullWidth = bitmaps[0].width;
  const scale = fullWidth / Math.max(1, cssWidth);
  const anchor = Math.max(
    1,
    Math.min(bitmaps[0].height, tiles[0].scrollerBottom || bitmaps[0].height),
  );
  let extra = 0;
  const strips = [];
  for (let i = 1; i < bitmaps.length; i += 1) {
    const bitmap = bitmaps[i];
    const column = tiles[i].pixelX == null ? Math.round((tiles[i].x || 0) * scale) : tiles[i].pixelX;
    strips.push({ bitmap, column, width: bitmap.width, height: bitmap.height, blend: tiles[i].blend || 0 });
    extra += bitmap.height - (tiles[i].blend || 0);
  }
  const fullHeight = Math.max(bitmaps[0].height, anchor + extra);
  let outScale = 1;
  if (fullHeight > 32768) outScale = 32768 / fullHeight;
  if (fullWidth * outScale > 8192) outScale = Math.min(outScale, 8192 / fullWidth);
  const width = Math.max(1, Math.round(fullWidth * outScale));
  const height = Math.max(1, Math.round(fullHeight * outScale));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const draw = (bitmap, x, y, w, h) => {
    ctx.drawImage(bitmap, Math.round(x * outScale), Math.round(y * outScale), Math.round(w * outScale), Math.round(h * outScale));
  };
  draw(bitmaps[0], 0, 0, bitmaps[0].width, bitmaps[0].height);
  let y = anchor;
  for (const strip of strips) {
    const skip = strip.blend || 0;
    const blend = outScale > 0.999 ? skip : 0;
    if (blend >= 2) {
      paintStrip(ctx, strip.bitmap, strip.column, y, blend);
    } else {
      ctx.drawImage(
        strip.bitmap,
        0,
        skip,
        strip.width,
        Math.max(1, strip.height - skip),
        Math.round(strip.column * outScale),
        Math.round(y * outScale),
        Math.round(strip.width * outScale),
        Math.max(1, Math.round((strip.height - skip) * outScale)),
      );
    }
    y += strip.height - skip;
    strip.bitmap.close();
  }
  const stripWidth = strips[0]?.width || 0;
  if (stripWidth >= 2) {
    const sides = sidebarColumns(fullWidth, strips[0].column, stripWidth);
    const fromY = Math.round(Math.min(bitmaps[0].height, anchor) * outScale);
    const stretch = (side) => {
      if (!side || height <= fromY) return;
      ctx.drawImage(
        bitmaps[0],
        side.x,
        Math.max(0, Math.min(bitmaps[0].height, anchor) - 1),
        side.width,
        1,
        Math.round(side.x * outScale),
        fromY,
        Math.max(1, Math.round(side.width * outScale)),
        height - fromY,
      );
    };
    stretch(sides.left);
    stretch(sides.right);
  }
  bitmaps[0].close();
  const blob = await canvas.convertToBlob({ type: "image/png" });
  if (!blob) throw new Error(t("imageTooBig"));
  return { blob, width, height, scaled: outScale < 0.999 };
}

async function readScroller(tabId) {
  return evaluate(tabId, () => {
    const el = document.querySelector("[data-wp-scroller]");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      clientLeft: el.clientLeft,
      clientTop: el.clientTop,
      clientWidth: el.clientWidth,
      clientHeight: el.clientHeight,
      offsetWidth: el.offsetWidth,
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop || 0,
    };
  });
}

async function imageGray(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const width = bitmap.width;
  const height = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, width, height).data;
  bitmap.close();
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return { gray, width, height };
}

function deviceBox(box, scaleX, scaleY) {
  const x0 = Math.round(box.left * scaleX);
  const x1 = Math.round((box.left + box.width) * scaleX);
  const y0 = Math.round(box.top * scaleY);
  const y1 = Math.round((box.top + box.height) * scaleY);
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

async function captureInner(tabId, info) {
  const CAP = 30000;
  const tiles = [];
  const hidden = [];
  const viewport = Math.max(1, info.viewportHeight || 800);
  let raw = info.scrollerBox;
  let box = contentBox({
    left: raw.left,
    top: raw.top,
    clientLeft: raw.clientLeft,
    clientTop: raw.clientTop,
    clientWidth: raw.clientWidth || raw.width,
    clientHeight: raw.clientHeight || raw.height,
    offsetWidth: raw.offsetWidth || raw.width,
  });
  let clientHeight = Math.max(1, box.height);
  let previousScrollTop = 0;
  let truncated = false;
  const overlap = captureOverlap(clientHeight);
  const estimated = Math.max(
    1,
    Math.ceil(Math.min(raw.scrollHeight, CAP) / Math.max(1, clientHeight - overlap)),
  );

  await showProgress(tabId, 1, estimated);
  await settleScroll(tabId, 0);
  const opened = await readScroller(tabId);
  if (opened) {
    raw = opened;
    box = contentBox(opened);
    clientHeight = Math.max(1, box.height);
  }
  hidden.push(0);
  await waitForSlice(tabId);
  await sleep(160);
  await concealProgress(tabId);
  const first = await grabViewport(tabId);
  const firstSize = pngSize(first);
  const scaleX = firstSize ? firstSize.width / Math.max(1, info.cssWidth) : info.dpr || 1;
  const scaleY = firstSize ? firstSize.height / viewport : info.dpr || 1;
  const firstRect = deviceBox(box, scaleX, scaleY);
  tiles.push({
    bytes: first,
    full: true,
    scrollerBottom: firstRect.y + firstRect.height,
  });
  let previousView = await imageGray(await cropDevicePixels(first, firstRect));

  let guard = 0;
  while (guard < 80) {
    guard += 1;
    const live = (await readScroller(tabId)) || raw;
    raw = live;
    box = contentBox(live);
    clientHeight = Math.max(1, box.height);
    const maxScroll = Math.max(0, live.scrollHeight - clientHeight);
    const overlap = captureOverlap(clientHeight);
    const target = innerScrollTarget(previousScrollTop, clientHeight, maxScroll, overlap);
    if (target == null) break;
    const outputCss = viewport + Math.max(0, previousScrollTop);
    if (outputCss >= CAP) {
      truncated = true;
      break;
    }
    await showProgress(tabId, tiles.length + 1, estimated);
    await settleScroll(tabId, target);
    await waitForSlice(tabId);
    await sleep(160);
    await concealProgress(tabId);
    const fresh = await readScroller(tabId);
    if (fresh) {
      raw = fresh;
      box = contentBox(fresh);
      clientHeight = Math.max(1, box.height);
    }
    const scrollTop = fresh ? fresh.scrollTop || 0 : target;
    const frame = await grabViewport(tabId);
    const rect = deviceBox(box, scaleX, scaleY);
    const viewBytes = await cropDevicePixels(frame, rect);
    const view = await imageGray(viewBytes);
    const bandH = Math.round(seamBandCss(overlap) * scaleY);
    const expectedCut = Math.round((previousScrollTop + clientHeight - scrollTop) * scaleY);
    const fallbackStrip = nextInnerStrip({
      clientHeight,
      scrollHeight: (fresh || live).scrollHeight,
      scrollTop,
      previousScrollTop,
      dpr: scaleY,
    });
    let cut = fallbackStrip ? Math.max(0, fallbackStrip.cropTop) : Math.max(0, expectedCut);
    if (previousView && bandH >= 8 && bandH < previousView.height && expectedCut > bandH) {
      const band = previousView.gray.subarray((previousView.height - bandH) * previousView.width);
      const match = matchBandOffset({
        band,
        bandWidth: previousView.width,
        bandHeight: bandH,
        frame: view.gray,
        frameWidth: view.width,
        frameHeight: view.height,
        expectedTop: expectedCut - bandH,
        windowPx: SEAM_WINDOW,
        threshold: SEAM_THRESHOLD,
      });
      if (match.matched) cut = match.cut;
    }
    const blend = Math.max(0, Math.min(SEAM_BLEND, cut));
    if (view.height - cut >= 2) {
      tiles.push({
        bytes: await cropDevicePixels(viewBytes, {
          x: 0,
          y: Math.max(0, cut - blend),
          width: view.width,
          height: view.height - Math.max(0, cut - blend),
        }),
        x: box.left,
        pixelX: rect.x,
        blend,
      });
      hidden.push(0);
    } else if (scrollTop >= maxScroll - 1) {
      break;
    }
    previousView = view;
    previousScrollTop = scrollTop;
    if (scrollTop >= maxScroll - 1) break;
  }
  await clearProgress(tabId);
  const image = await composeInner(tiles, info.cssWidth);
  return { image, hidden, slices: tiles.length, path: "inner-scroll", truncated };
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
  const viewport = Math.max(1, info.viewportHeight || 800);
  const overlap = captureOverlap(viewport);
  const tiles = [];
  const hidden = [];
  let committed = 0;
  let previousBytes = null;
  let guard = 0;
  const total = Math.max(1, Math.ceil(cssHeight / Math.max(1, viewport - overlap)));
  while (committed < cssHeight - 1 && guard < 80) {
    guard += 1;
    const target = committed === 0 ? 0 : Math.max(0, committed - overlap);
    await showProgress(tabId, tiles.length + 1, total);
    const pos = await settleScroll(tabId, target);
    if (committed > 0) {
      const report = await hideForSlice(tabId);
      hidden.push(report?.count || 0);
    } else {
      hidden.push(0);
    }
    await waitForSlice(tabId);
    const docEnd = Math.min(cssHeight, pos.y + pos.viewport);
    if (committed > 0 && docEnd <= committed + 1) break;
    await sleep(160);
    await concealProgress(tabId);
    const tile = await grabViewport(tabId);
    if (surfaceTooTall(tile, pos.viewport)) {
      console.info("[page-to-pdf] surface taller than the viewport, using scroll-stitch");
      return null;
    }
    if (!previousBytes) {
      const keep = Math.max(1, docEnd - pos.y);
      const first = await cropSlice(tile, 0, keep, pos.viewport);
      tiles.push(first);
      previousBytes = first;
      committed = pos.y + keep;
      continue;
    }
    const joined = await joinFrame(previousBytes, tile, committed - pos.y, pos.viewport, overlap);
    if (joined.height < 2) break;
    tiles[tiles.length - 1] = joined.prevOut;
    tiles.push(joined.rows);
    previousBytes = tile;
    committed = docEnd;
  }
  await clearProgress(tabId);
  if (!tiles.length) return null;
  const image = await shotToPng(tiles);
  return { image, hidden, slices: tiles.length, path: "viewport-stitch" };
}

async function scrollStitch(tab, cssHeight, info) {
  const viewportGuess = Math.max(1, info?.viewportHeight || 800);
  const overlap = captureOverlap(viewportGuess);
  const slices = [];
  const hidden = [];
  let committed = 0;
  let previousBytes = null;
  let guard = 0;
  const total = Math.max(1, Math.ceil(cssHeight / Math.max(1, viewportGuess - overlap)));
  while (committed < cssHeight - 1 && guard < 80) {
    guard += 1;
    const target = committed === 0 ? 0 : Math.max(0, committed - overlap);
    await attach(tab.id);
    let pos;
    try {
      await showProgress(tab.id, slices.length + 1, total);
      const settled = await settleScroll(tab.id, target);
      if (committed > 0) {
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
      await concealProgress(tab.id);
    } finally {
      await detach(tab.id);
    }
    const docEnd = Math.min(pos.height, pos.y + pos.viewport);
    if (committed > 0 && docEnd <= committed + 1) break;
    await sleep(160);
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    const bytes = base64ToBytes(dataUrl.split(",")[1]);
    if (!previousBytes) {
      const keep = Math.max(1, docEnd - pos.y);
      const first = await cropSlice(bytes, 0, keep, pos.viewport);
      slices.push(first);
      previousBytes = first;
      committed = pos.y + keep;
      continue;
    }
    const joined = await joinFrame(previousBytes, bytes, committed - pos.y, pos.viewport, overlap);
    if (joined.height < 2) break;
    slices[slices.length - 1] = joined.prevOut;
    slices.push(joined.rows);
    previousBytes = bytes;
    committed = docEnd;
  }
  if (!slices.length) throw new Error(t("stitchFailed"));
  const image = await shotToPng(slices);
  return { image, hidden, slices: slices.length, path: "scroll-stitch" };
}

async function openResult(id) {
  await chrome.tabs.create({
    url: chrome.runtime.getURL(`result.html?id=${encodeURIComponent(id)}`),
  });
}

async function capture(tab) {
  if (!tab?.id) throw new Error(t("noTab"));
  if (!tab.url && !tab.pendingUrl) {
    try {
      tab = await chrome.tabs.get(tab.id);
    } catch {
      /* the click already identified the tab */
    }
  }
  if (blockedUrl(tab.url || tab.pendingUrl || "")) {
    throw new Error(t("blockedPage"));
  }
  if (busy.has(tab.id)) throw new Error(t("alreadyBusy"));
  busy.add(tab.id);
  startKeepAlive();
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#2449D8" });
  await chrome.action.setBadgeText({ tabId: tab.id, text: "…" });
  let prepared = false;
  try {
    await attach(tab.id);
    prepared = true;
    const info = await evaluate(tab.id, preparePage, [viewportArea, chooseScrollMode]);
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
      if (info.scrollMode === "viewport") {
        await showProgress(tab.id, 1, 1);
        await clearProgress(tab.id);
        const tile = await grabViewport(tab.id);
        shot = { image: await shotToPng([tile]), hidden: [0], slices: 1, path: "viewport" };
      } else if (info.scrollMode === "inner") {
        shot = await captureInner(tab.id, info);
      } else {
        shot = await captureSurface(tab.id, info);
      }
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
      truncated: Boolean(info.truncated || shot.truncated),
      partial: Boolean(info.partial),
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
    chrome.action.setTitle({ tabId: tab.id, title: t("actionTitle") }).catch(() => {});
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
