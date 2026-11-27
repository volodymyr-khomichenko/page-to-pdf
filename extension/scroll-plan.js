/** Pure scroll-mode and strip math. No DOM, so tests and the page script can share it. */

export function viewportArea(rect, viewportWidth, viewportHeight) {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.left + rect.width);
  const bottom = Math.min(viewportHeight, rect.top + rect.height);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/**
 * Document scroll wins when the page itself is taller than the viewport.
 * Otherwise the largest visible overflow box wins. No box means one viewport.
 */
export function chooseScrollMode(input) {
  const viewportHeight = input.viewportHeight;
  if (input.documentScrollHeight > viewportHeight + 50) {
    return { mode: "document" };
  }
  let best = null;
  let bestArea = 0;
  for (const item of input.scrollers || []) {
    if (item.scrollHeight <= item.clientHeight + 50) continue;
    const area = viewportArea(item, input.viewportWidth, viewportHeight);
    if (area <= bestArea) continue;
    best = item;
    bestArea = area;
  }
  if (!best) return { mode: "viewport" };
  return { mode: "inner", index: best.index };
}

/**
 * New pixels inside an inner scroller after it has been scrolled.
 * Start and end are both Math.round(css * dpr), so the next strip begins
 * on the exact pixel where the previous one ended, including fractional
 * scrollTop and non-integer devicePixelRatio.
 * `covered` is the CSS content position already in the image. Prefer
 * `previousScrollTop` (the scrollTop actually read after the last step).
 */
export function nextInnerStrip({
  clientHeight,
  scrollHeight,
  scrollTop,
  covered,
  previousScrollTop,
  dpr = 1,
}) {
  const ratio = dpr > 0 ? dpr : 1;
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const top = Math.max(0, Math.min(scrollTop, maxScroll));
  const prev =
    previousScrollTop == null ? Math.max(0, (covered ?? clientHeight) - clientHeight) : previousScrollTop;
  const startPx = Math.round((prev + clientHeight) * ratio);
  const endPx = Math.round((Math.min(scrollHeight, top + clientHeight)) * ratio);
  const viewTopPx = Math.round(top * ratio);
  const height = endPx - startPx;
  if (height <= 0) return null;
  return {
    scrollTop: top,
    cropTop: startPx - viewTopPx,
    height,
    covered: prev + clientHeight + height / ratio,
    pixelStart: startPx,
    pixelEnd: endPx,
    previousScrollTop: prev,
  };
}

/**
 * Content box of an overflow element, excluding borders and the scrollbar.
 * Scrollbar width is offsetWidth - clientWidth (borders included in that
 * difference; clientLeft/clientTop move the origin inside the border).
 */
export function contentBox(metrics) {
  const clientLeft = metrics.clientLeft || 0;
  const clientTop = metrics.clientTop || 0;
  return {
    left: metrics.left + clientLeft,
    top: metrics.top + clientTop,
    width: metrics.clientWidth,
    height: metrics.clientHeight,
    scrollbar: Math.max(0, (metrics.offsetWidth || 0) - (metrics.clientWidth || 0)),
  };
}

/** Columns outside the scroller that must be filled for the full output height. */
export function sidebarColumns(width, scrollerX, scrollerWidth) {
  const x = Math.max(0, Math.min(width, Math.round(scrollerX)));
  const rightEdge = Math.max(x, Math.min(width, x + Math.max(0, Math.round(scrollerWidth))));
  return {
    left: x > 0 ? { x: 0, width: x } : null,
    right: rightEdge < width ? { x: rightEdge, width: width - rightEdge } : null,
  };
}

/** CSS pixels of overlap kept between screens so the join can be matched. */
export const INNER_OVERLAP = 120;
export const INNER_BAND_MARGIN = 20;
export const MATCH_WINDOW = 60;
export const MATCH_THRESHOLD = 24;

/**
 * Overlap for a real capture. Half the view, so the same rows are still on
 * screen for a tall match. Smaller than the view by at least 80px.
 */
export function captureOverlap(clientHeight) {
  const height = Math.max(1, Math.round(clientHeight));
  const cap = Math.max(40, height - 80);
  return Math.max(40, Math.min(Math.round(height * 0.55), cap));
}

/** Band matched inside that overlap, kept clear of a sticky header at the top. */
export function seamBandCss(overlap) {
  return Math.max(48, Math.min(300, overlap - 96));
}

/** Next scroll position: one view minus the overlap, never past the end. */
export function innerScrollTarget(previousScrollTop, clientHeight, maxScroll, overlap = INNER_OVERLAP) {
  const step = Math.max(1, clientHeight - overlap);
  const target = Math.min(maxScroll, previousScrollTop + step);
  if (target <= previousScrollTop + 0.5) return null;
  return target;
}

/**
 * Where the previous strip's bottom band sits in the new frame.
 * `cut` is the device-pixel row in the new frame where unseen pixels begin.
 * A flat band or a poor match returns matched:false so the caller can use scrollTop.
 */
export function matchBandOffset({
  band,
  bandWidth,
  bandHeight,
  frame,
  frameWidth,
  frameHeight,
  expectedTop,
  windowPx = MATCH_WINDOW,
  threshold = MATCH_THRESHOLD,
}) {
  const width = Math.min(bandWidth, frameWidth);
  if (bandHeight < 2 || width < 2 || frameHeight < bandHeight) {
    return { matched: false, flat: true, mean: Infinity, cut: null };
  }
  let min = 255;
  let max = 0;
  const samples = bandHeight * width;
  const stride = Math.max(1, Math.floor(samples / 1500));
  for (let i = 0; i < samples; i += stride) {
    const row = Math.floor(i / width);
    const col = i % width;
    const value = band[row * bandWidth + col];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const flat = max - min < 8;
  const guess = Math.round(expectedTop);
  const start = Math.max(0, guess - windowPx);
  const end = Math.min(frameHeight - bandHeight, guess + windowPx);
  if (end < start) return { matched: false, flat, mean: Infinity, cut: null };
  let best = Infinity;
  const scores = [];
  const denom = bandHeight * width;
  for (let y = start; y <= end; y += 1) {
    let diff = 0;
    for (let row = 0; row < bandHeight; row += 1) {
      const frameAt = (y + row) * frameWidth;
      const bandAt = row * bandWidth;
      for (let x = 0; x < width; x += 1) {
        const delta = frame[frameAt + x] - band[bandAt + x];
        diff += delta < 0 ? -delta : delta;
      }
    }
    const mean = diff / denom;
    scores.push({ y, mean });
    if (mean < best) best = mean;
  }
  let chosen = scores[0];
  let chosenDist = Math.abs(chosen.y - guess);
  for (const score of scores) {
    if (score.mean > best + 0.75) continue;
    const dist = Math.abs(score.y - guess);
    if (score.mean < chosen.mean - 0.75 || dist < chosenDist) {
      chosen = score;
      chosenDist = dist;
    }
  }
  if (flat || chosen.mean > threshold) {
    return { matched: false, flat, mean: chosen.mean, cut: null, top: chosen.y };
  }
  return { matched: true, flat: false, mean: chosen.mean, cut: chosen.y + bandHeight, top: chosen.y };
}
