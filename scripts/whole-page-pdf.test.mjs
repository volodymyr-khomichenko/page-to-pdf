import assert from "node:assert/strict";
import test from "node:test";
import { buildPdf } from "../extension/pdf.js";

const jpeg = Buffer.from(
  "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9faffda0008010100003f00fb3fd28a28afffd9",
  "hex",
);

test("pdf starts at objects and points xref at them", () => {
  const pdf = buildPdf([
    { jpeg, imgW: 1, imgH: 1, pageW: 100, pageH: 140 },
    { jpeg, imgW: 1, imgH: 1, pageW: 595.28, pageH: 841.89 },
  ]);
  const text = Buffer.from(pdf).toString("latin1");
  assert.equal(text.startsWith("%PDF-1.4"), true);
  assert.match(text, /\/Count 2/);
  const start = text.match(/startxref\n(\d+)/);
  assert.ok(start);
  const xrefAt = Number(start[1]);
  assert.equal(text.slice(xrefAt, xrefAt + 4), "xref");
  const lines = text.slice(xrefAt).split("\n");
  const count = Number(lines[1].split(" ")[1]);
  assert.equal(count, 9);
  for (let id = 1; id < count; id += 1) {
    const offset = Number(lines[id + 2].slice(0, 10));
    assert.equal(text.slice(offset, offset + `${id} 0 obj`.length), `${id} 0 obj`);
  }
  assert.ok(text.includes("/Filter /DCTDecode"));
  assert.equal(jpeg[0], 0xff);
  assert.equal(jpeg[1], 0xd8);
});
