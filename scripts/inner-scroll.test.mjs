import assert from "node:assert/strict";
import test from "node:test";
import { chooseScrollMode, nextInnerStrip } from "../extension/scroll-plan.js";

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
