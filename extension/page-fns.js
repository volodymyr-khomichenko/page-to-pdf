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
  const pause = Math.max(280, Math.floor(vh * 0.85));
  const warmLimit = Math.min(root.scrollHeight, CAP);
  for (let y = 0; y < warmLimit; y += pause) {
    root.scrollTop = y;
    window.scrollTo(0, y);
    await new Promise((resolve) => setTimeout(resolve, 160));
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

export async function hideOverlays() {
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

  function textColumn() {
    const samples = [];
    const h1 = document.querySelector("h1");
    let h1w = 0;
    if (h1) {
      const rect = h1.getBoundingClientRect();
      if (rect.width >= 80 && rect.height >= 8) {
        samples.push(rect);
        h1w = rect.width;
      }
    }
    const scope =
      document.querySelector("#mw-content-text, article, [role='main'], main") || document.body;
    for (const p of scope.querySelectorAll("p")) {
      if (p.closest("nav, aside, header, footer, [role='navigation']")) continue;
      const rect = p.getBoundingClientRect();
      if (rect.width < 160 || rect.height < 14 || rect.width > vw * 0.94) continue;
      if (h1w >= 280 && rect.width > h1w * 1.6) continue;
      samples.push(rect);
      if (samples.length >= 6) break;
    }
    if (!samples.length) return { left: vw * 0.18, right: vw * 0.82, width: vw * 0.64 };
    const left = Math.min(...samples.map((rect) => rect.left));
    const right = Math.max(...samples.map((rect) => rect.right));
    if (right - left < 140) return { left: vw * 0.18, right: vw * 0.82, width: vw * 0.64 };
    return { left, right, width: right - left };
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
          tag.startsWith("MDN-PLAY")
        ) {
          return true;
        }
        const cls = String(node.className || "");
        if (/sandpack|sp-preview|sp-stack|sp-wrapper|sp-layout/i.test(cls)) return true;
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

  function mark(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (el.hasAttribute("data-wp-style")) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    el.setAttribute("data-wp-style", el.getAttribute("style") || "");
    el.style.setProperty("visibility", "hidden", "important");
    names.push(label(el));
    return true;
  }

  if (!document.body) return { count: 0, names: [] };
  const content = textColumn();

  function overlapRatio(rect) {
    const overlap = Math.max(
      0,
      Math.min(rect.right, content.right) - Math.max(rect.left, content.left),
    );
    return content.width > 0 ? overlap / content.width : 1;
  }

  function outside(rect) {
    if (rect.width < 8 || rect.height < 8) return false;
    if (rect.width > vw * 0.55) return false;
    return overlapRatio(rect) < 0.15;
  }

  function topPinned(el) {
    let top = null;
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.position === "sticky" || cs.position === "fixed") top = node;
      node = node.parentElement;
    }
    return top;
  }

  function isBar(rect) {
    const center = (content.left + content.right) / 2;
    const covers = rect.left <= center && rect.right >= center;
    return rect.height <= 180 && rect.width >= vw * 0.45 && (covers || overlapRatio(rect) >= 0.15);
  }

  function consider(el, fromStuck) {
    if (!el || inDemo(el)) return;
    const pin = topPinned(el);
    const own = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const selfPinned = cs.position === "sticky" || cs.position === "fixed";
    const scroller =
      (cs.overflowY === "auto" || cs.overflowY === "scroll") &&
      own.height >= vh * 0.55 &&
      own.height <= vh * 1.25;
    const pinRect = pin ? pin.getBoundingClientRect() : null;
    if (pin && isBar(pinRect)) {
      mark(pin);
      return;
    }
    if (selfPinned && isBar(own)) {
      mark(el);
      return;
    }
    if (pin && outside(pinRect)) mark(pin);
    if ((selfPinned || scroller) && outside(own)) mark(el);
    if (fromStuck && outside(own) && own.width <= 56 && own.height <= 56) mark(el);
  }

  const seen = [];
  const visit = {
    count: 0,
    fn(el) {
      if (inDemo(el) || seen.length > 400) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;
      if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) return;
      const cs = getComputedStyle(el);
      const sticky = cs.position === "sticky" || cs.position === "fixed";
      const scroller =
        (cs.overflowY === "auto" || cs.overflowY === "scroll") && rect.height >= vh * 0.5;
      const edgeToggle = rect.width <= 48 && rect.height <= 48 && (rect.left <= 28 || rect.right >= vw - 28);
      if (sticky || scroller || edgeToggle) seen.push(el);
    },
  };
  walk(document, visit);

  async function nudge() {
    const root = document.scrollingElement || document.documentElement;
    const y0 = root.scrollTop || 0;
    const maxScroll = Math.max(0, root.scrollHeight - vh);
    let delta = 120;
    if (y0 + delta > maxScroll - 1) delta = y0 > 120 ? -120 : 0;
    if (!delta) return [];
    const before = seen.map((el) => {
      const rect = el.getBoundingClientRect();
      return { el, top: rect.top, left: rect.left };
    });
    root.scrollTop = y0 + delta;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const stuck = [];
    for (const item of before) {
      const rect = item.el.getBoundingClientRect();
      if (Math.abs(rect.top - item.top) <= 2 && Math.abs(rect.left - item.left) <= 2) stuck.push(item.el);
    }
    root.scrollTop = y0;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return stuck;
  }

  const stuck = new Set(await nudge());
  for (const el of seen) consider(el, stuck.has(el));
  for (const el of await nudge()) consider(el, true);

  return { count: names.length, names: names.slice(0, 16), span: content };
}

export function framesNeedWait() {
  const frames = [];
  function walk(root) {
    if (!root?.querySelectorAll || frames.length > 40) return;
    for (const el of root.querySelectorAll("iframe")) frames.push(el);
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  }
  walk(document);
  let waiting = 0;
  for (const frame of frames) {
    const rect = frame.getBoundingClientRect();
    if (rect.width < 180 || rect.bottom < 8 || rect.top > window.innerHeight - 8) continue;
    if (rect.height < 120) {
      waiting += 1;
      continue;
    }
    try {
      const doc = frame.contentDocument;
      if (doc && doc.readyState !== "complete") waiting += 1;
    } catch {
      /* cross-origin and already tall */
    }
  }
  return waiting;
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
