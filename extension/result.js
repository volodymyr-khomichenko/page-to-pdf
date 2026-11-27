import { buildPdf } from "./pdf.js";
import { getShot } from "./idb.js";

const status = document.querySelector("#status");
const meta = document.querySelector("#meta");
const image = document.querySelector("#shot");
const pngButton = document.querySelector("#png");
const pdfButton = document.querySelector("#pdf");
const a4Button = document.querySelector("#a4");

const id = new URLSearchParams(location.search).get("id");
let shot = null;
let bitmap = null;

function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

document.documentElement.lang = chrome.i18n.getUILanguage() || "en";
document.title = t("resultTitle");
document.querySelector("#png").textContent = t("pngButton");
document.querySelector("#pdf").textContent = t("pdfOnePage");
document.querySelector("#a4").textContent = t("pdfA4");
document.querySelector(".privacy").textContent = t("privacy");
image.alt = t("shotAlt");
status.textContent = t("opening");

function downloadBlob(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 15000);
}

function fail(message) {
  status.hidden = true;
  image.hidden = true;
  const box = document.createElement("div");
  box.className = "error";
  box.innerHTML = `<h1>${t("failedTitle")}</h1><p></p>`;
  box.querySelector("p").textContent = message;
  document.querySelector("main").append(box);
  for (const button of [pngButton, pdfButton, a4Button]) button.disabled = true;
}

async function jpegBytes(source, sx, sy, sw, sh) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error(t("pdfTooBig"));
  return {
    jpeg: new Uint8Array(await blob.arrayBuffer()),
    imgW: canvas.width,
    imgH: canvas.height,
  };
}

async function onePagePdf() {
  const pageW = 595.28;
  let pageH = (pageW * bitmap.height) / bitmap.width;
  if (pageH > 14400) {
    const fit = 14400 / pageH;
    pageH = 14400;
    const narrow = pageW * fit;
    const encoded = await jpegBytes(bitmap, 0, 0, bitmap.width, bitmap.height);
    return new Blob([buildPdf([{ ...encoded, pageW: narrow, pageH }])], { type: "application/pdf" });
  }
  const encoded = await jpegBytes(bitmap, 0, 0, bitmap.width, bitmap.height);
  return new Blob([buildPdf([{ ...encoded, pageW, pageH }])], { type: "application/pdf" });
}

async function a4Pdf() {
  const pageW = 595.28;
  const pageH = 841.89;
  const sliceCss = Math.max(1, Math.floor(bitmap.width * (pageH / pageW)));
  const pages = [];
  for (let y = 0; y < bitmap.height; y += sliceCss) {
    const sh = Math.min(sliceCss, bitmap.height - y);
    const encoded = await jpegBytes(bitmap, 0, y, bitmap.width, sh);
    const usedH = pageW * (sh / bitmap.width);
    pages.push({ ...encoded, pageW, pageH: sh === sliceCss ? pageH : usedH });
  }
  return new Blob([buildPdf(pages)], { type: "application/pdf" });
}

async function withBusy(button, work) {
  const label = button.textContent;
  for (const node of [pngButton, pdfButton, a4Button]) node.disabled = true;
  button.textContent = t("preparing");
  try {
    await work();
  } catch (error) {
    status.hidden = false;
    status.textContent = error?.message || t("saveFailed");
  } finally {
    button.textContent = label;
    for (const node of [pngButton, pdfButton, a4Button]) node.disabled = false;
  }
}

pngButton.addEventListener("click", () => {
  withBusy(pngButton, async () => {
    downloadBlob(shot.blob, `${shot.title}.png`);
  });
});

pdfButton.addEventListener("click", () => {
  withBusy(pdfButton, async () => {
    downloadBlob(await onePagePdf(), `${shot.title}.pdf`);
  });
});

a4Button.addEventListener("click", () => {
  withBusy(a4Button, async () => {
    downloadBlob(await a4Pdf(), `${shot.title}-a4.pdf`);
  });
});

if (!id) {
  fail(t("shotMissing"));
} else {
  getShot(id)
    .then(async (stored) => {
      if (!stored) {
        fail(t("shotGone"));
        return;
      }
      if (stored.error) {
        fail(stored.error);
        return;
      }
      shot = stored;
      bitmap = await createImageBitmap(stored.blob);
      const notes = [`${bitmap.width} × ${bitmap.height}`];
      if (stored.scaled) notes.push(t("scaledNote"));
      if (stored.truncated || stored.partial) notes.push(t("truncatedNote"));
      meta.textContent = `${stored.title} · ${notes.join(" · ")}`;
      const path = document.querySelector("#capture-path");
      if (path && stored.capture) {
        path.dataset.capturePath = stored.capture.path || "";
        path.textContent = stored.capture.line || "";
      }
      image.src = URL.createObjectURL(stored.blob);
      image.hidden = false;
      status.textContent = t("staysInBrowser");
      for (const button of [pngButton, pdfButton, a4Button]) button.disabled = false;
    })
    .catch((error) => {
      fail(error?.message || t("openFailed"));
    });
}
