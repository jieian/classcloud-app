/**
 * PWA icon generator.
 *
 * Reads public/icon.png (square source, ideally >=512px) and writes every icon
 * size the PWA manifest + iOS need into public/icons/.
 *
 * Run with: npm run gen:icons
 *
 * Outputs:
 *   icon-192.png        192x192   purpose "any"   (manifest)
 *   icon-512.png        512x512   purpose "any"   (manifest, install)
 *   maskable-512.png    512x512   purpose "maskable" — content inset to ~80%
 *                                 safe-zone on an opaque background so Android
 *                                 adaptive icons don't clip the logo.
 *   apple-touch-icon.png 180x180  opaque (iOS ignores alpha; flattened on white)
 *   favicon-32.png      32x32     (optional convenience favicon)
 */

import sharp from "sharp";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "public", "icon.png");
const OUT_DIR = join(ROOT, "public", "icons");

// Opaque background used for maskable + apple icons (no transparency allowed there).
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

async function generate() {
  await mkdir(OUT_DIR, { recursive: true });

  const meta = await sharp(SRC).metadata();
  console.log(`Source: public/icon.png (${meta.width}x${meta.height})`);

  // --- Standard "any" icons: full-bleed, transparency preserved ---
  for (const size of [192, 512]) {
    await sharp(SRC)
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(join(OUT_DIR, `icon-${size}.png`));
    console.log(`  ✓ icon-${size}.png`);
  }

  // --- Maskable 512: inset content to 80% safe-zone on opaque background ---
  const maskSize = 512;
  const inner = Math.round(maskSize * 0.8); // 80% safe-zone per maskable spec
  const innerBuf = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: { width: maskSize, height: maskSize, channels: 4, background: BG },
  })
    .composite([{ input: innerBuf, gravity: "center" }])
    .png()
    .toFile(join(OUT_DIR, "maskable-512.png"));
  console.log("  ✓ maskable-512.png");

  // --- Apple touch icon 180: opaque (flatten alpha onto white) ---
  await sharp(SRC)
    .resize(180, 180, { fit: "cover" })
    .flatten({ background: BG })
    .png()
    .toFile(join(OUT_DIR, "apple-touch-icon.png"));
  console.log("  ✓ apple-touch-icon.png");

  // --- Favicon 32 (optional convenience) ---
  await sharp(SRC)
    .resize(32, 32, { fit: "cover" })
    .png()
    .toFile(join(OUT_DIR, "favicon-32.png"));
  console.log("  ✓ favicon-32.png");

  console.log("Done → public/icons/");
}

generate().catch((err) => {
  console.error("Icon generation failed:", err);
  process.exit(1);
});
