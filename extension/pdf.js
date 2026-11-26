const encoder = new TextEncoder();

function fmt(n) {
  return (Math.round(n * 100) / 100).toString();
}

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * @param {{ jpeg: Uint8Array, imgW: number, imgH: number, pageW: number, pageH: number }[]} pages
 * @returns {Uint8Array}
 */
export function buildPdf(pages) {
  if (!pages.length) throw new Error("Немає сторінок для PDF");
  const chunks = [];
  let offset = 0;
  const push = (data) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };

  push("%PDF-1.4\n");
  const objects = new Map();
  let nextId = 3;
  const items = pages.map((page) => {
    const pageId = nextId++;
    const contentId = nextId++;
    const imageId = nextId++;
    return { ...page, pageId, contentId, imageId };
  });
  const maxId = nextId - 1;
  const kids = items.map((item) => `${item.pageId} 0 R`).join(" ");
  objects.set(1, { text: "<< /Type /Catalog /Pages 2 0 R >>" });
  objects.set(2, {
    text: `<< /Type /Pages /Count ${items.length} /Kids [${kids}] >>`,
  });

  for (const item of items) {
    if (!item.jpeg?.length || item.imgW < 1 || item.imgH < 1) {
      throw new Error("Порожнє зображення для PDF");
    }
    objects.set(item.pageId, {
      text:
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(item.pageW)} ${fmt(item.pageH)}] ` +
        `/Contents ${item.contentId} 0 R /Resources << /XObject << /Im0 ${item.imageId} 0 R >> >> >>`,
    });
    const content = `q\n${fmt(item.pageW)} 0 0 ${fmt(item.pageH)} 0 0 cm\n/Im0 Do\nQ\n`;
    objects.set(item.contentId, { stream: encoder.encode(content) });
    objects.set(item.imageId, {
      dict:
        `<< /Type /XObject /Subtype /Image /Width ${item.imgW} /Height ${item.imgH} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${item.jpeg.length} >>`,
      stream: item.jpeg,
    });
  }

  const xref = [0];
  for (let id = 1; id <= maxId; id += 1) {
    xref[id] = offset;
    const body = objects.get(id);
    if (body.stream) {
      push(`${id} 0 obj\n`);
      push(body.dict ? `${body.dict}\nstream\n` : `<< /Length ${body.stream.length} >>\nstream\n`);
      push(body.stream);
      push("\nendstream\nendobj\n");
    } else {
      push(`${id} 0 obj\n${body.text}\nendobj\n`);
    }
  }

  const xrefStart = offset;
  push(`xref\n0 ${maxId + 1}\n`);
  push("0000000000 65535 f \n");
  for (let id = 1; id <= maxId; id += 1) {
    push(`${String(xref[id]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);
  return concat(chunks);
}
