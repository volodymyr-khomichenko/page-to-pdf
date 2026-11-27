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
  const documentRoot = document.scrollingElement || document.documentElement;

  function scrollerLabel(el) {
    if (!el || el === documentRoot || el === document.documentElement || el === document.body) return "document";
    const id = el.id ? `#${el.id}` : "";
    const cls = String(el.className || "").split(/\s+/).filter(Boolean)[0] || "";
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""}`;
  }

  function findScroller() {
    const scrollers = [];
    function walk(node) {
      if (!node?.querySelectorAll) return;
      for (const el of node.querySelectorAll("*")) {
        if (el.shadowRoot) walk(el.shadowRoot);
        const overflow = getComputedStyle(el).overflowY;
        if (overflow !== "auto" && overflow !== "scroll") continue;
        if (el === documentRoot || el === document.body || el === document.documentElement) continue;
        const rect = el.getBoundingClientRect();
        scrollers.push({
          index: scrollers.length,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          clientHeight: el.clientHeight,
          scrollHeight: el.scrollHeight,
          el,
        });
      }
    }
    walk(document);
    const decision = chooseScrollMode({
      documentScrollHeight: documentRoot.scrollHeight,
      viewportWidth: vw,
      viewportHeight: vh,
      scrollers,
    });
    if (decision.mode !== "inner") {
      return { el: documentRoot, mode: decision.mode, name: "document", box: null };
    }
    const picked = scrollers[decision.index];
    return { el: picked.el, mode: "inner", name: scrollerLabel(picked.el), box: picked };
  }

  const scroller = findScroller();
  document.querySelector("[data-wp-scroller]")?.removeAttribute("data-wp-scroller");
  if (scroller.mode === "inner") {
    scroller.el.setAttribute("data-wp-scroller", scroller.name);
    scroller.el.setAttribute("data-wp-saved-scroll", String(scroller.el.scrollTop || 0));
  }
  const root = scroller.el;
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
      "html::-webkit-scrollbar,body::-webkit-scrollbar{width:0 !important;height:0 !important}" +
      "[data-wp-scroller]{scrollbar-width:none !important}" +
      "[data-wp-scroller]::-webkit-scrollbar{display:none !important;width:0 !important;height:0 !important}";
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
  const warmStart = performance.now();
  const hasFrame = Boolean(document.querySelector("iframe"));
  if (hasFrame) {
    const pause = Math.max(280, Math.floor((scroller.mode === "inner" ? root.clientHeight : vh) * 0.85));
    const warmLimit = Math.min(root.scrollHeight, CAP);
    for (let y = 0; y < warmLimit; y += pause) {
      if (performance.now() - warmStart > 8000) break;
      root.scrollTop = y;
      if (scroller.mode === "document") window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
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
  let scrollerBox = null;
  if (scroller.mode === "inner") {
    const rect = scroller.el.getBoundingClientRect();
    scrollerBox = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      clientLeft: scroller.el.clientLeft,
      clientTop: scroller.el.clientTop,
      clientWidth: scroller.el.clientWidth,
      clientHeight: scroller.el.clientHeight,
      offsetWidth: scroller.el.offsetWidth,
      scrollHeight: scroller.el.scrollHeight,
    };
  }
  return {
    cssWidth: vw,
    cssHeight: scroller.mode === "viewport" ? vh : Math.min(fullHeight, CAP),
    fullHeight,
    viewportHeight: vh,
    dpr: window.devicePixelRatio || 1,
    truncated: scroller.mode === "viewport" ? false : fullHeight > CAP,
    partial: scroller.mode === "viewport",
    scroller: scroller.name,
    scrollMode: scroller.mode,
    scrollerBox,
  };
}

export async function hideOverlays() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const names = [];

  function label(el) {
    const id = el.id ? `#${el.id}` : "";
    const raw = String(el.className || "");
    const cls = raw.split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""}`;
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

  function mark(el, hard) {
    if (!el || el === document.body || el === document.documentElement) return false;
    if (!el.hasAttribute("data-wp-style")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      el.setAttribute("data-wp-style", el.getAttribute("style") || "");
      el.style.setProperty("visibility", "hidden", "important");
      if (hard) el.style.setProperty("overflow", "hidden", "important");
      names.push(label(el));
    }
    if (!hard) return true;
    const box = el.getBoundingClientRect();
    for (const child of el.querySelectorAll("*")) {
      if (child.hasAttribute("data-wp-style") || inDemo(child)) continue;
      const rect = child.getBoundingClientRect();
      const overflow = getComputedStyle(child).overflowY;
      const spills = overflow === "auto" || overflow === "scroll" || rect.height > box.height + 24 || rect.bottom > vh + 4;
      if (!spills) continue;
      child.setAttribute("data-wp-style", child.getAttribute("style") || "");
      child.style.setProperty("display", "none", "important");
      names.push(label(child));
    }
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

  function up(node) {
    if (!node) return null;
    const root = node.getRootNode?.();
    if (root instanceof ShadowRoot) return root.host;
    return node.parentElement;
  }

  function topPinned(el) {
    let top = null;
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.position === "sticky" || cs.position === "fixed") top = node;
      node = up(node);
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
      mark(pin, false);
      return;
    }
    if (selfPinned && isBar(own)) {
      mark(el, false);
      return;
    }
    if (pin && outside(pinRect)) mark(pin, true);
    if ((selfPinned || scroller) && outside(own)) mark(el, true);
    if (fromStuck && outside(own) && own.width <= 56 && own.height <= 56) mark(el, true);
  }

  const seen = [];
  const bag = new Set();
  const points = [];
  for (let y = 8; y < vh; y += 40) {
    for (let x = 4; x <= 520; x += 52) points.push([x, y], [vw - x, y]);
  }
  for (let x = 24; x < vw; x += 160) points.push([x, 8], [x, 48]);
  for (const [x, y] of points) {
    for (const el of document.elementsFromPoint(x, y)) bag.add(el);
  }
  for (const el of bag) {
    if (!el || el === document.body || el === document.documentElement || inDemo(el)) continue;
    seen.push(el);
  }

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
  if (names.length) {
    for (const el of await nudge()) consider(el, true);
  }

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
    if (rect.height >= 120) continue;
    const src = frame.getAttribute("src") || "";
    if (!src && rect.height < 48) continue;
    try {
      const doc = frame.contentDocument;
      if (doc && doc.readyState === "complete" && rect.height >= 80) continue;
    } catch {
      /* cross-origin preview still short */
    }
    waiting += 1;
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
  document.getElementById("wp-progress")?.remove();
  for (const el of document.querySelectorAll("[data-wp-saved-scroll]")) {
    el.scrollTop = Number(el.getAttribute("data-wp-saved-scroll") || 0);
    el.removeAttribute("data-wp-saved-scroll");
  }
  document.querySelector("[data-wp-scroller]")?.removeAttribute("data-wp-scroller");
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
