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
 * New pixels inside an inner scroller after it has been scrolled to scrollTop.
 * covered is how much of the content is already in the image (the first frame counts as clientHeight).
 * The last step is shorter: cropTop skips the overlap and height is only the remainder.
 */
export function nextInnerStrip({ clientHeight, scrollHeight, scrollTop, covered }) {
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const top = Math.max(0, Math.min(scrollTop, maxScroll));
  const viewEnd = Math.min(scrollHeight, top + clientHeight);
  const start = Math.max(covered, top);
  const height = viewEnd - start;
  if (height <= 1) return null;
  return {
    scrollTop: top,
    cropTop: start - top,
    height,
    covered: start + height,
  };
}
