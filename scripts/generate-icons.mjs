/**
 * Renders the app icons from one inline SVG so that the PWA has real PNGs at
 * the sizes Android asks for. Run once; re-run if the mark changes.
 *
 *     node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const PRIMARY = "#0F766E";
const INK = "#FAFAF9";

/** `safe` insets the mark for maskable icons, which get cropped to a circle. */
function markSvg(size, { background, safe, badge = false }) {
  const pad = Math.round(size * safe);
  const inner = size - pad * 2;
  const bar = Math.round(inner * 0.12);
  const gap = Math.round(inner * 0.09);
  const width = inner;
  const roofHeight = Math.round(inner * 0.34);

  // A notification badge is drawn as a silhouette on transparency: Android
  // discards its colours and tints the shape to match the status bar, so a
  // filled square would arrive as a filled square.
  const plate = badge
    ? ""
    : `<rect width="${size}" height="${size}" rx="${background ? Math.round(size * 0.22) : 0}" fill="${PRIMARY}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${plate}
  <g transform="translate(${pad} ${pad})" fill="${badge ? "#FFFFFF" : INK}">
    <path d="M0 ${roofHeight} L${width / 2} 0 L${width} ${roofHeight} L${width - bar} ${roofHeight} L${width / 2} ${bar * 1.1} L${bar} ${roofHeight} Z"/>
    <rect x="0" y="${roofHeight + gap}" width="${width}" height="${bar}" rx="${bar / 2}"/>
    <rect x="0" y="${roofHeight + gap + bar + gap}" width="${Math.round(width * 0.66)}" height="${bar}" rx="${bar / 2}"/>
    <rect x="0" y="${roofHeight + gap + (bar + gap) * 2}" width="${Math.round(width * 0.4)}" height="${bar}" rx="${bar / 2}"/>
  </g>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, safe: 0.18, background: true },
  { file: "icon-512.png", size: 512, safe: 0.18, background: true },
  { file: "icon-maskable-512.png", size: 512, safe: 0.28, background: false },
  { file: "apple-touch-icon.png", size: 180, safe: 0.18, background: true },
  // The notification badge of docs/11-NOTIFICATIONS-SPEC.md section 4.
  { file: "badge-72.png", size: 72, safe: 0.1, background: false, badge: true },
];

await mkdir("public/icons", { recursive: true });

for (const target of targets) {
  const svg = markSvg(target.size, {
    background: target.background,
    safe: target.safe,
    badge: target.badge === true,
  });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(`public/icons/${target.file}`, png);
  console.log(`wrote public/icons/${target.file}`);
}

await writeFile("public/icons/icon.svg", markSvg(512, { background: true, safe: 0.18 }));
console.log("wrote public/icons/icon.svg");
