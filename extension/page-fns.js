export async function preparePage() {
  const CAP = 30000;

  function promoteImages() {
    for (const img of document.images) {
      const lazy =
        img.getAttribute("data-src") ||
        img.getAttribute("data-lazy-src") ||
        img.getAttribute("data-original");
      if (lazy && (!img.getAttribute("src") || img.src.startsWith("data:"))) {
        img.src = lazy;
      }
      const srcset = img.getAttribute("data-srcset");
      if (srcset && !img.getAttribute("srcset")) img.setAttribute("srcset", srcset);
      img.loading = "eager";
    }
  }

  promoteImages();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const root = document.scrollingElement || document.documentElement;
  if (!document.documentElement.dataset.wpScroll) {
    document.documentElement.dataset.wpScroll = String(root.scrollTop || 0);
  }
  if (document.documentElement.dataset.wpScrollBehavior === undefined) {
    document.documentElement.dataset.wpScrollBehavior =
      document.documentElement.style.scrollBehavior || "";
  }
  document.documentElement.style.scrollBehavior = "auto";

  if (!document.getElementById("wp-hide-style")) {
    const style = document.createElement("style");
    style.id = "wp-hide-style";
    style.textContent =
      "html::-webkit-scrollbar,body::-webkit-scrollbar{width:0 !important;height:0 !important}";
    document.documentElement.appendChild(style);
  }

  const step = Math.max(240, Math.floor(vh * 0.9));
  const maxSteps = Math.ceil(CAP / step) + 8;
  let y = 0;
  for (let i = 0; i < maxSteps && y < CAP; i += 1) {
    root.scrollTop = y;
    await new Promise((resolve) => setTimeout(resolve, 40));
    promoteImages();
    const grown = root.scrollHeight;
    const goal = Math.min(grown, CAP);
    if (y + step >= goal) {
      root.scrollTop = Math.min(goal, CAP);
      await new Promise((resolve) => setTimeout(resolve, 40));
      const again = root.scrollHeight;
      if (again <= grown + 8 || y + step >= CAP) break;
    }
    y += step;
  }
  root.scrollTop = 0;

  const pending = [...document.images].filter((img) => !img.complete);
  await Promise.race([
    Promise.all(
      pending.map(
        (img) =>
          new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }),
      ),
    ),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  if (document.fonts?.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]);
  }
  window.scrollTo(0, 0);
  root.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
  await new Promise((resolve) => setTimeout(resolve, 80));
  if ((window.scrollY || 0) > 1 || (root.scrollTop || 0) > 1) {
    window.scrollTo(0, 0);
    root.scrollTop = 0;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const fullHeight = root.scrollHeight;
  return {
    cssWidth: vw,
    cssHeight: Math.min(fullHeight, CAP),
    fullHeight,
    viewportHeight: vh,
    dpr: window.devicePixelRatio || 1,
    truncated: fullHeight > CAP,
  };
}

export function hideOverlays() {
  function isSide(rect, vw) {
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.width > Math.min(420, vw * 0.4)) return false;
    return rect.left <= 32 || rect.right >= vw - 32;
  }

  function mark(el, gone) {
    if (!el || el === document.body || el === document.documentElement) return;
    if (el.hasAttribute("data-wp-style")) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    el.setAttribute("data-wp-style", el.getAttribute("style") || "");
    if (gone) el.style.setProperty("display", "none", "important");
    else el.style.setProperty("visibility", "hidden", "important");
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!document.body) return false;
  for (const el of document.body.querySelectorAll("*")) {
    let sticky = null;
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.position === "fixed" || cs.position === "sticky") {
        sticky = node;
        break;
      }
      node = node.parentElement;
    }
    if (!sticky || sticky.hasAttribute("data-wp-style")) continue;
    const rect = sticky.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.height > vh * 0.65 && rect.width > vw * 0.65) continue;
    const own = el === sticky ? rect : el.getBoundingClientRect();
    const bar = rect.height <= 180 && rect.width >= vw * 0.45;
    const widget =
      rect.width <= 420 &&
      rect.height <= 640 &&
      rect.right >= vw - 28 &&
      rect.bottom >= vh - 28;
    if (isSide(rect, vw)) mark(sticky, true);
    else if (sticky !== el && isSide(own, vw)) mark(el, true);
    else if (bar || widget) mark(sticky, false);
  }
  return true;
}

export function restorePage() {
  for (const el of document.querySelectorAll("[data-wp-style]")) {
    const prev = el.getAttribute("data-wp-style") || "";
    if (prev) el.setAttribute("style", prev);
    else el.removeAttribute("style");
    el.removeAttribute("data-wp-style");
  }
  document.getElementById("wp-hide-style")?.remove();
  const behavior = document.documentElement.dataset.wpScrollBehavior;
  if (behavior !== undefined) {
    if (behavior) document.documentElement.style.scrollBehavior = behavior;
    else document.documentElement.style.removeProperty("scroll-behavior");
    delete document.documentElement.dataset.wpScrollBehavior;
  }
  const y = Number(document.documentElement.dataset.wpScroll || 0);
  delete document.documentElement.dataset.wpScroll;
  const root = document.scrollingElement || document.documentElement;
  root.scrollTop = Number.isFinite(y) ? y : 0;
  return true;
}
