/**
 * Client-side image compression for receipts.
 *
 * The free Storage tier is 1 GB, which is about 4,000 receipts only if they are
 * compressed first — a modern phone camera produces 4 MB photos of a piece of
 * paper. Longest edge 1280 px is the figure from docs/02-TRD.md section 2.2,
 * and it stays perfectly readable for a grocery bill.
 */

const MAX_EDGE = 1280;
const QUALITY = 0.82;

export interface CompressedImage {
  blob: Blob;
  extension: string;
  originalBytes: number;
  compressedBytes: number;
}

export async function compressImage(file: File): Promise<CompressedImage> {
  // A PDF receipt is passed through untouched; there is nothing to resize.
  if (file.type === "application/pdf") {
    return {
      blob: file,
      extension: "pdf",
      originalBytes: file.size,
      compressedBytes: file.size,
    };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare the image for upload");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", QUALITY);
  });

  if (!blob) throw new Error("Could not compress the image");

  return {
    blob,
    extension: "webp",
    originalBytes: file.size,
    compressedBytes: blob.size,
  };
}
