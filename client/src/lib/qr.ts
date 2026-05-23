/*
 * Equipment ID — QR code decoder (browser-side).
 *
 * Uses jsQR to scan an image File for a QR code.  The image is drawn onto
 * an off-screen canvas so we can extract raw RGBA pixel data, which jsQR
 * requires.  Returns the decoded string on success, or null if no QR code
 * was found or decoding failed.
 *
 * This runs entirely in the browser — no server round-trip.
 */
import jsQR from "jsqr";

export async function decodeQrFromFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const canvas = document.createElement("canvas");
        // Limit to 2048px on the longest side to keep memory reasonable
        const MAX = 2048;
        const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert",
        });
        resolve(code?.data ?? null);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}
