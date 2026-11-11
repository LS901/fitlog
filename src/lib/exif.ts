/**
 * Minimal EXIF reader: just enough to date a photo. Reads the JPEG APP1 "Exif" segment and returns
 * DateTimeOriginal (falling back to DateTimeDigitized, then IFD0 DateTime) plus OffsetTimeOriginal
 * when the camera wrote one. Anything malformed or missing returns undefined; callers fall back to
 * the file's modified time.
 */

export interface ExifDate {
  /** wall-clock time as written by the camera, `YYYY-MM-DDTHH:MM:SS` (no zone) */
  local: string;
  /** UTC offset such as `+01:00`, when present */
  offset?: string;
}

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_OFFSET_ORIGINAL = 0x9011;
const TYPE_ASCII = 2;

/** How much of a file to read: APP1 is at most 64 KB and comes right after the SOI marker. */
export const EXIF_SCAN_BYTES = 128 * 1024;

export function parseExifDate(buf: ArrayBuffer): ExifDate | undefined {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return undefined;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      if (v.getUint8(p) !== 0xff) return undefined;
      const marker = v.getUint8(p + 1);
      if (marker === 0xff) {
        p += 1; // fill byte
        continue;
      }
      if (marker === 0xda || marker === 0xd9) return undefined; // image data / end: no EXIF
      const len = v.getUint16(p + 2);
      if (marker === 0xe1 && ascii(v, p + 4, 6) === "Exif\0\0") {
        return readTiff(v, p + 10, Math.min(v.byteLength, p + 2 + len));
      }
      p += 2 + len;
    }
  } catch {
    // RangeError from a truncated or corrupt file
  }
  return undefined;
}

function readTiff(v: DataView, start: number, end: number): ExifDate | undefined {
  const order = ascii(v, start, 2);
  if (order !== "II" && order !== "MM") return undefined;
  const le = order === "II";
  const u16 = (o: number) => v.getUint16(start + o, le);
  const u32 = (o: number) => v.getUint32(start + o, le);
  if (u16(2) !== 42) return undefined;

  /** tag → string value, for the ASCII tags of one IFD; also returns the Exif sub-IFD pointer */
  const readIfd = (offset: number) => {
    const tags = new Map<number, string>();
    let exifIfd: number | undefined;
    if (start + offset + 2 > end) return { tags, exifIfd };
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const e = offset + 2 + i * 12;
      if (start + e + 12 > end) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const n = u32(e + 4);
      if (tag === TAG_EXIF_IFD) exifIfd = u32(e + 8);
      else if (type === TYPE_ASCII) {
        const at = n <= 4 ? e + 8 : u32(e + 8);
        if (start + at + n <= end) tags.set(tag, ascii(v, start + at, n).replace(/\0+$/, "").trim());
      }
    }
    return { tags, exifIfd };
  };

  const ifd0 = readIfd(u32(4));
  const exif = ifd0.exifIfd !== undefined ? readIfd(ifd0.exifIfd).tags : new Map<number, string>();
  const raw =
    exif.get(TAG_DATETIME_ORIGINAL) ?? exif.get(TAG_DATETIME_DIGITIZED) ?? ifd0.tags.get(TAG_DATETIME);
  const local = raw && toLocal(raw);
  if (!local) return undefined;
  const offset = exif.get(TAG_OFFSET_ORIGINAL);
  return /^[+-]\d{2}:\d{2}$/.test(offset ?? "") ? { local, offset } : { local };
}

/** "2026:11:03 07:12:45" → "2026-11-03T07:12:45"; rejects blank or zeroed dates. */
function toLocal(s: string): string | undefined {
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m || m[1] === "0000" || m[2] === "00" || m[3] === "00") return undefined;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

function ascii(v: DataView, at: number, n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += String.fromCharCode(v.getUint8(at + i));
  return s;
}

/** ISO timestamp for an EXIF date. Without an offset the camera time is taken as this device's local time. */
export function exifDateToIso(d: ExifDate): string {
  return new Date(d.offset ? d.local + d.offset : d.local).toISOString();
}

/** When a photo was taken: EXIF if available, else the file's modified time, else now. */
export async function photoDate(file: Blob & { lastModified?: number }): Promise<{
  date: string;
  fromExif: boolean;
}> {
  const exif = parseExifDate(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
  if (exif) return { date: exifDateToIso(exif), fromExif: true };
  return { date: new Date(file.lastModified || Date.now()).toISOString(), fromExif: false };
}
