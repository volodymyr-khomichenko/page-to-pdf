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
  const CAP = 25000;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const names = [];

  function label(el) {
    const id = el.id ? `#${el.id}` : "";
    const raw = String(el.className || "");
    const cls = raw.split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""}`;
  }

  function walk(root, visit) {
    if (!root?.querySelectorAll || visit.count >= CAP) return;
    for (const el of root.querySelectorAll("*")) {
      visit.count += 1;
      if (visit.count > CAP) return;
      visit.fn(el);
      if (el.shadowRoot) walk(el.shadowRoot, visit);
    }
  }

  function contentSpan() {
    const h1 = document.querySelector("h1");
    let best = null;
    if (h1) {
      let node = h1;
      while (node && node !== document.body && node !== document.documentElement) {
        const display = getComputedStyle(node).display;
        if (display !== "contents") {
          const rect = node.getBoundingClientRect();
          if (rect.width >= 180 && rect.width <= vw * 0.86 && rect.height >= 32) {
            if (!best || rect.width > best.width + 24) {
              best = { left: rect.left, right: rect.right, width: rect.width };
            }
          }
          if (rect.width > vw * 0.92) break;
        }
        node = node.parentElement;
      }
    }
    if (!best) {
      const main = document.querySelector("article, [role='main'], main");
      if (main && getComputedStyle(main).display !== "contents") {
        const rect = main.getBoundingClientRect();
        if (rect.width >= 180 && rect.width <= vw * 0.9) {
          best = { left: rect.left, right: rect.right, width: rect.width };
        }
      }
    }
    if (!best) return { left: vw * 0.18, right: vw * 0.82, width: vw * 0.64 };
    return best;
  }

  function inDemo(el) {
    let node = el;
    while (node) {
      if (node.nodeType === 1) {
        const tag = node.tagName;
        if (
          tag === "IFRAME" ||
          tag === "OBJECT" ||
          tag === "EMBED" ||
          tag === "INTERACTIVE-EXAMPLE" ||
          tag === "MDN-PLAY-RUNNER" ||
          tag === "MDN-PLAY-EDITOR" ||
          tag === "MDN-PLAY-CONTROLLER"
        ) {
          return true;
        }
      }
      const root = node.getRootNode?.();
      if (root instanceof ShadowRoot) {
        node = root.host;
        continue;
      }
      node = node.parentElement;
    }
    return false;
  }

  function mark(el, gone) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.hasAttribute("data-wp-style")) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    el.setAttribute("data-wp-style", el.getAttribute("style") || "");
    if (gone) el.style.setProperty("display", "none", "important");
    else el.style.setProperty("visibility", "hidden", "important");
    names.push(label(el));
    return true;
  }

  if (!document.body) return { count: 0, names: [] };
  const content = contentSpan();
  const sticky = [];
  const visit = {
    count: 0,
    fn(el) {
      const pos = getComputedStyle(el).position;
      if (pos === "fixed" || pos === "sticky") sticky.push(el);
    },
  };
  walk(document, visit);

  for (const el of sticky) {
    if (inDemo(el) || el.hasAttribute("data-wp-style")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) continue;
    if (rect.width > vw * 0.92 && rect.height > vh * 0.92) continue;
    const mid = rect.left + rect.width / 2;
    const center = (content.left + content.right) / 2;
    const coversCenter = rect.left <= center + 8 && rect.right >= center - 8;
    const bar = rect.height <= 180 && rect.width >= vw * 0.45 && coversCenter;
    const inside =
      mid >= content.left + 12 && mid <= content.right - 12 && rect.width <= content.width + 24;
    const side =
      !coversCenter &&
      rect.width <= vw * 0.5 &&
      rect.width >= 48 &&
      rect.height >= 48 &&
      (mid < content.left || mid > content.right);
    const widget =
      rect.width <= 280 &&
      rect.height <= 280 &&
      (rect.left <= 20 || rect.right >= vw - 20) &&
      (rect.top <= 20 || rect.bottom >= vh - 20);
    if (bar) mark(el, false);
    else if (inside) continue;
    else if (side) mark(el, false);
    else if (widget) mark(el, false);
  }

  return { count: names.length, names: names.slice(0, 16), span: content };
}

export function restorePage() {
  function restoreTree(root) {
    if (!root?.querySelectorAll) return;
    for (const el of root.querySelectorAll("[data-wp-style]")) {
      const prev = el.getAttribute("data-wp-style") || "";
      if (prev) el.setAttribute("style", prev);
      else el.removeAttribute("style");
      el.removeAttribute("data-wp-style");
    }
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) restoreTree(el.shadowRoot);
    }
  }
  restoreTree(document);
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
