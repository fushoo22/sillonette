// Draws the extension icons (a small record: navy disc with grooves, raspberry label, paper
// centre) as PNG files, without any image library: 4x4 supersampling + node:zlib.
//   node scripts/make-icons.mjs   -> icons/icon-{16,32,48,128}.png
import { deflateSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";

const NAVY = [32, 56, 86], GROOVE = [58, 86, 120], RASP = [163, 33, 107], PAPER = [255, 250, 243];

function pixel(x, y) { // x, y in [-1, 1]
  const r = Math.hypot(x, y);
  if (r > 1) return null;
  if (r < 0.1) return PAPER;
  if (r < 0.4) return RASP;
  if (r > 0.52 && r < 0.92 && Math.floor((r - 0.52) / 0.1) % 2 === 1) return GROOVE;
  return NAVY;
}

function png(size) {
  const ss = 4, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const c = pixel(((x + (sx + 0.5) / ss) / size) * 2 - 1, ((y + (sy + 0.5) / ss) / size) * 2 - 1);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

for (const s of [16, 32, 48, 128]) writeFileSync(new URL(`../icons/icon-${s}.png`, import.meta.url), png(s));
console.log("icons written");
