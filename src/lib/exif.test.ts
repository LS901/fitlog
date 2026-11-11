import { describe, expect, it } from "vitest";
import { exifDateToIso, parseExifDate, photoDate } from "./exif";

type Tag = { tag: number; type: number; value: string | number };

/**
 * Builds a minimal JPEG: SOI, an optional APP0, an APP1 Exif segment holding IFD0 (+ optional Exif
 * sub-IFD) with the given tags, then SOS. Strings longer than 4 bytes go in a data area after the IFDs.
 */
function jpeg({
  ifd0 = [],
  exif,
  le = true,
  app0 = true,
}: {
  ifd0?: Tag[];
  exif?: Tag[];
  le?: boolean;
  app0?: boolean;
}): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) =>
    le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0);

  const ifdSize = (tags: Tag[]) => 2 + tags.length * 12 + 4;
  const ifd0Tags = exif ? [...ifd0, { tag: 0x8769, type: 4, value: 0 }] : ifd0;
  const ifd0At = 8;
  const exifAt = ifd0At + ifdSize(ifd0Tags);
  let dataAt = exifAt + (exif ? ifdSize(exif) : 0);
  const data: number[] = [];

  const writeIfd = (tags: Tag[]) => {
    tiff.push(...u16(tags.length));
    for (const t of tags) {
      tiff.push(...u16(t.tag), ...u16(t.type));
      if (t.tag === 0x8769) tiff.push(...u32(1), ...u32(exifAt));
      else if (typeof t.value === "string") {
        const bytes = str(t.value);
        tiff.push(...u32(bytes.length));
        if (bytes.length <= 4) tiff.push(...bytes, ...Array(4 - bytes.length).fill(0));
        else {
          tiff.push(...u32(dataAt));
          data.push(...bytes);
          dataAt += bytes.length;
        }
      } else tiff.push(...u32(1), ...u32(t.value));
    }
    tiff.push(...u32(0));
  };

  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At));
  writeIfd(ifd0Tags);
  if (exif) writeIfd(exif);
  tiff.push(...data);

  const app1 = [...str("Exif"), 0, ...tiff];
  const bytes = [
    0xff, 0xd8,
    ...(app0 ? [0xff, 0xe0, 0, 16, ...Array(14).fill(0)] : []),
    0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1,
    0xff, 0xda, 0, 2,
  ];
  return new Uint8Array(bytes).buffer;
}

const ASCII = 2;

describe("parseExifDate", () => {
  it("reads DateTimeOriginal and its offset from the Exif sub-IFD (little-endian)", () => {
    const buf = jpeg({
      ifd0: [{ tag: 0x0132, type: ASCII, value: "2026:11:05 10:00:00" }],
      exif: [
        { tag: 0x9003, type: ASCII, value: "2026:11:03 07:12:45" },
        { tag: 0x9011, type: ASCII, value: "+01:00" },
      ],
    });
    expect(parseExifDate(buf)).toEqual({ local: "2026-11-03T07:12:45", offset: "+01:00" });
  });

  it("works big-endian and without an APP0 segment", () => {
    const buf = jpeg({
      le: false,
      app0: false,
      exif: [{ tag: 0x9003, type: ASCII, value: "2025:12:31 23:59:59" }],
    });
    expect(parseExifDate(buf)).toEqual({ local: "2025-12-31T23:59:59" });
  });

  it("falls back to DateTimeDigitized, then IFD0 DateTime", () => {
    expect(
      parseExifDate(jpeg({ exif: [{ tag: 0x9004, type: ASCII, value: "2026:01:02 03:04:05" }] })),
    ).toEqual({ local: "2026-01-02T03:04:05" });
    expect(
      parseExifDate(jpeg({ ifd0: [{ tag: 0x0132, type: ASCII, value: "2026:02:03 04:05:06" }] })),
    ).toEqual({ local: "2026-02-03T04:05:06" });
  });

  it("ignores zeroed dates and malformed offsets", () => {
    expect(
      parseExifDate(jpeg({ exif: [{ tag: 0x9003, type: ASCII, value: "0000:00:00 00:00:00" }] })),
    ).toBeUndefined();
    expect(
      parseExifDate(
        jpeg({
          exif: [
            { tag: 0x9003, type: ASCII, value: "2026:11:03 07:12:45" },
            { tag: 0x9011, type: ASCII, value: "   " },
          ],
        }),
      ),
    ).toEqual({ local: "2026-11-03T07:12:45" });
  });

  it("returns undefined for non-JPEGs, JPEGs without EXIF and truncated files", () => {
    expect(parseExifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeUndefined();
    expect(parseExifDate(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeUndefined();
    const full = jpeg({ exif: [{ tag: 0x9003, type: ASCII, value: "2026:11:03 07:12:45" }] });
    expect(parseExifDate(full.slice(0, 30))).toBeUndefined();
    expect(parseExifDate(new ArrayBuffer(0))).toBeUndefined();
  });
});

describe("exifDateToIso", () => {
  it("applies the offset when there is one", () => {
    expect(exifDateToIso({ local: "2026-11-03T07:12:45", offset: "+01:00" })).toBe(
      "2026-11-03T06:12:45.000Z",
    );
  });

  it("treats a zone-less time as local time", () => {
    expect(exifDateToIso({ local: "2026-11-03T07:12:45" })).toBe(
      new Date(2026, 10, 3, 7, 12, 45).toISOString(),
    );
  });
});

describe("photoDate", () => {
  it("prefers EXIF, otherwise the file's modified time", async () => {
    const withExif = new File(
      [jpeg({ exif: [{ tag: 0x9003, type: ASCII, value: "2026:11:03 07:12:45" }, { tag: 0x9011, type: ASCII, value: "Z0:00" }] })],
      "a.jpg",
      { lastModified: Date.UTC(2026, 10, 11) },
    );
    expect(await photoDate(withExif)).toEqual({
      date: new Date(2026, 10, 3, 7, 12, 45).toISOString(),
      fromExif: true,
    });

    const plain = new File([new Uint8Array([1, 2, 3])], "b.png", {
      lastModified: Date.UTC(2026, 10, 11, 12),
    });
    expect(await photoDate(plain)).toEqual({ date: "2026-11-11T12:00:00.000Z", fromExif: false });
  });
});
