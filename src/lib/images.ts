/** Longest edge kept for progress photos: plenty for side-by-side comparison on a phone. */
export const MAX_PHOTO_EDGE = 2000;

/**
 * Re-encodes a large photo as a JPEG whose longest edge is at most `maxEdge`, so a camera-roll import
 * doesn't fill the browser's storage quota. EXIF orientation is applied by `createImageBitmap`
 * (the default `imageOrientation: "from-image"`). Returns the original when it is already small,
 * when re-encoding wouldn't make it smaller, or when the browser can't decode it (e.g. HEIC on
 * desktop Chrome).
 */
export async function shrinkPhoto(file: Blob, maxEdge = MAX_PHOTO_EDGE): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
