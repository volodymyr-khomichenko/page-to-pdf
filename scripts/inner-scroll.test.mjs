import assert from "node:assert/strict";
import test from "node:test";
import { captureOverlap, chooseScrollMode, contentBox, innerScrollTarget, matchBandOffset, nextInnerStrip, seamBandCss, sidebarColumns } from "../extension/scroll-plan.js";

test("a normal scrolling page stays on the document", () => {
  const mode = chooseScrollMode({
    documentScrollHeight: 4200,
    viewportWidth: 1440,
    viewportHeight: 900,
    scrollers: [
      {
        index: 0,
        left: 240,
        top: 80,
        width: 800,
        height: 700,
        clientHeight: 700,
        scrollHeight: 4000,
      },
    ],
  });
  assert.equal(mode.mode, "document");
});

test("an inner list is chosen when the document itself does not scroll", () => {
  const mode = chooseScrollMode({
    documentScrollHeight: 900,
    viewportWidth: 1440,
    viewportHeight: 900,
    scrollers: [
      { index: 0, left: 0, top: 0, width: 220, height: 400, clientHeight: 400, scrollHeight: 900 },
      {
        index: 1,
        left: 240,
        top: 64,
        width: 960,
        height: 800,
        clientHeight: 780,
        scrollHeight: 3200,
      },
    ],
  });
  assert.equal(mode.mode, "inner");
  assert.equal(mode.index, 1);
});

test("no usable scroller means a single viewport", () => {
  const tooShort = chooseScrollMode({
    documentScrollHeight: 880,
    viewportWidth: 1440,
    viewportHeight: 900,
    scrollers: [
      { index: 0, left: 0, top: 0, width: 400, height: 400, clientHeight: 400, scrollHeight: 430 },
    ],
  });
  assert.equal(tooShort.mode, "viewport");

  const offscreen = chooseScrollMode({
    documentScrollHeight: 900,
    viewportWidth: 1440,
    viewportHeight: 900,
    scrollers: [
      { index: 0, left: 0, top: 2000, width: 800, height: 700, clientHeight: 700, scrollHeight: 3000 },
    ],
  });
  assert.equal(offscreen.mode, "viewport");
});

test("the last inner step adds only the new pixels", () => {
  const first = nextInnerStrip({
    clientHeight: 500,
    scrollHeight: 1200,
    scrollTop: 500,
    covered: 500,
  });
  assert.deepEqual(
    { cropTop: first.cropTop, height: first.height, covered: first.covered },
    { cropTop: 0, height: 500, covered: 1000 },
  );
  const last = nextInnerStrip({
    clientHeight: 500,
    scrollHeight: 1200,
    scrollTop: 700,
    covered: first.covered,
  });
  assert.equal(last.scrollTop, 700);
  assert.equal(last.cropTop, 300);
  assert.equal(last.height, 200);
  assert.equal(last.covered, 1200);
});

test("fractional scrollTop strips abut at dpr 1, 1.25 and 2", () => {
  const clientHeight = 480.5;
  const stops = [360.4, 720.8, 1000.2];
  for (const dpr of [1, 1.25, 2]) {
    let previous = 0;
    let end = Math.round(clientHeight * dpr);
    for (const scrollTop of stops) {
      const strip = nextInnerStrip({
        clientHeight,
        scrollHeight: 4000,
        scrollTop,
        previousScrollTop: previous,
        dpr,
      });
      assert.equal(strip.pixelStart, end);
      assert.equal(strip.pixelEnd, Math.round((scrollTop + clientHeight) * dpr));
      assert.equal(strip.height, strip.pixelEnd - strip.pixelStart);
      assert.equal(strip.cropTop, strip.pixelStart - Math.round(scrollTop * dpr));
      assert.ok(strip.height > 0);
      end = strip.pixelEnd;
      previous = scrollTop;
    }
  }
});

test("the content box excludes the scrollbar and the borders", () => {
  const box = contentBox({
    left: 240,
    top: 64,
    clientLeft: 1,
    clientTop: 2,
    clientWidth: 800,
    clientHeight: 700,
    offsetWidth: 817,
  });
  assert.equal(box.left, 241);
  assert.equal(box.top, 66);
  assert.equal(box.width, 800);
  assert.equal(box.height, 700);
  assert.equal(box.scrollbar, 17);
});

test("an inner step keeps a 120px overlap", () => {
  assert.equal(innerScrollTarget(0, 1135, 4000), 1135 - 120);
  assert.equal(innerScrollTarget(2000, 835, 2100), 2100);
  assert.equal(innerScrollTarget(2100, 835, 2100), null);
});

test("pixel match finds a shifted join and rejects a flat band", () => {
  const width = 30;
  const frameHeight = 90;
  const bandHeight = 20;
  const frame = new Uint8Array(width * frameHeight);
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < width; x += 1) frame[y * width + x] = (y * 3 + x * 5) % 251;
  }
  const trueTop = 17;
  const band = frame.subarray(trueTop * width, (trueTop + bandHeight) * width);
  const found = matchBandOffset({
    band,
    bandWidth: width,
    bandHeight,
    frame,
    frameWidth: width,
    frameHeight,
    expectedTop: trueTop - 6,
  });
  assert.equal(found.matched, true);
  assert.equal(found.top, trueTop);
  assert.equal(found.cut, trueTop + bandHeight);

  const flat = new Uint8Array(width * bandHeight).fill(240);
  const missed = matchBandOffset({
    band: flat,
    bandWidth: width,
    bandHeight,
    frame,
    frameWidth: width,
    frameHeight,
    expectedTop: 10,
  });
  assert.equal(missed.matched, false);
  assert.equal(missed.flat, true);

  const repeat = new Uint8Array(width * frameHeight);
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < width; x += 1) repeat[y * width + x] = ((y % 10) * 9 + x) % 251;
  }
  const tied = matchBandOffset({
    band: repeat.subarray(20 * width, 40 * width),
    bandWidth: width,
    bandHeight,
    frame: repeat,
    frameWidth: width,
    frameHeight,
    expectedTop: 20,
  });
  assert.equal(tied.matched, true);
  assert.equal(tied.top, 20);
});

test("capture keeps about half a screen of overlap", () => {
  assert.equal(captureOverlap(800), 440);
  assert.equal(seamBandCss(440), 300);
  assert.equal(captureOverlap(200), 110);
  const step = innerScrollTarget(0, 800, 5000, captureOverlap(800));
  assert.equal(step, 360);
});

test("a tight window stays on the predicted row instead of a similar one", () => {
  const width = 24;
  const row = 40;
  const frameHeight = row * 6;
  const frame = new Uint8Array(width * frameHeight);
  for (let y = 0; y < frameHeight; y += 1) {
    const n = Math.floor(y / row);
    for (let x = 0; x < width; x += 1) frame[y * width + x] = 40 + n * 30 + (y % row === 4 ? 7 : 0);
  }
  const trueTop = row;
  const bandHeight = 80;
  const shifted = matchBandOffset({
    band: frame.subarray(trueTop * width, (trueTop + bandHeight) * width),
    bandWidth: width,
    bandHeight,
    frame,
    frameWidth: width,
    frameHeight,
    expectedTop: trueTop + row,
    windowPx: 16,
    threshold: 12,
  });
  assert.equal(shifted.matched, false);
  const exact = matchBandOffset({
    band: frame.subarray(trueTop * width, (trueTop + bandHeight) * width),
    bandWidth: width,
    bandHeight,
    frame,
    frameWidth: width,
    frameHeight,
    expectedTop: trueTop + 3,
    windowPx: 16,
    threshold: 12,
  });
  assert.equal(exact.matched, true);
  assert.equal(exact.top, trueTop);
});

test("the sidebar column continues beside the scroller", () => {
  const sides = sidebarColumns(1440, 220, 1040);
  assert.deepEqual(sides.left, { x: 0, width: 220 });
  assert.deepEqual(sides.right, { x: 1260, width: 180 });
  const flush = sidebarColumns(1000, 0, 1000);
  assert.equal(flush.left, null);
  assert.equal(flush.right, null);
});
