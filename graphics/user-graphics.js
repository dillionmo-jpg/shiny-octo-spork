import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { deflateSync } from "node:zlib";

const MAX_USER_GRAPHIC_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_UNNORMALIZED_USER_GRAPHIC_BYTES = 512 * 1024;
const RECENT_UPLOAD_TTL_MS = 5 * 60 * 1000;
const RECENT_UPLOAD_FALLBACK_MS = 2 * 60 * 1000;
const GRAPHIC_CATALOG_ID_BASE = 900000;
const GRAPHIC_CATALOG_ID_SLOT_SPAN = 200000;
const USER_GRAPHIC_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "swf"];
const USER_GRAPHIC_IMAGE_FILE_EXTENSIONS = ["jpg", "jpeg", "png", "gif"];
const GRAPHIC_SLOT_TEXTURE_SIZES = Object.freeze({
  160: { width: 200, height: 200 },
  161: { width: 650, height: 187 },
  162: { width: 300, height: 160 },
  163: { width: 350, height: 150 },
});
export const GRAPHICS_SHOP_CATEGORY_ID = 160;
export const GRAPHICS_SHOP_ROOT_CATEGORY_ID = 930160;
export const GRAPHICS_SHOP_CUSTOM_CATEGORY_ID = 146;
export const GRAPHICS_SHOP_FULL_CATEGORY_ID = 147;
export const GRAPHICS_SHOP_PANEL_CATEGORY_ID = 159;
export const GRAPHICS_SHOP_GAUGE_CATEGORY_ID = 172;
export const GRAPHICS_SHOP_STORE_TYPE = "2";
export const BUILT_IN_GRAPHIC_CATEGORY_IDS = new Set([146, 148, 149, 150, 151]);

const BUILT_IN_GRAPHIC_CATEGORIES = Object.freeze([
  { categoryId: 146, key: "full", name: "Full Graphics", price: 1200, points: 24 },
  { categoryId: 148, key: "hood", name: "Hood Graphics", price: 350, points: 7 },
  { categoryId: 149, key: "side", name: "Side Graphics", price: 500, points: 10 },
  { categoryId: 150, key: "front", name: "Front Graphics", price: 400, points: 8 },
  { categoryId: 151, key: "back", name: "Back Graphics", price: 400, points: 8 },
]);
const BUILT_IN_GRAPHIC_CATEGORY_BY_KEY = new Map(
  BUILT_IN_GRAPHIC_CATEGORIES.map((category) => [category.key, category]),
);
const BUILT_IN_GRAPHIC_LOCATIONS = Object.freeze([100]);

export const GRAPHIC_SLOT_CONFIGS = Object.freeze([
  {
    slotId: 160,
    key: "hood",
    shortKey: "h",
    name: "Hood Graphic",
    customName: "Custom Hood Graphic",
    customPartId: 16001,
    legacyPartId: 6000,
    price: 95,
  },
  {
    slotId: 161,
    key: "side",
    shortKey: "s",
    name: "Side Graphic",
    customName: "Custom Side Graphic",
    customPartId: 16101,
    legacyPartId: 6001,
    price: 160,
  },
  {
    slotId: 162,
    key: "front",
    shortKey: "f",
    name: "Front Graphic",
    customName: "Custom Front Graphic",
    customPartId: 16201,
    legacyPartId: 6002,
    price: 130,
  },
  {
    slotId: 163,
    key: "rear",
    shortKey: "b",
    aliases: ["back"],
    name: "Rear Graphic",
    customName: "Custom Rear Graphic",
    customPartId: 16301,
    legacyPartId: 6003,
    price: 135,
  },
]);

export const GRAPHIC_SLOT_IDS = new Set(GRAPHIC_SLOT_CONFIGS.map((config) => config.slotId));

const graphicSlotConfigBySlotId = new Map(GRAPHIC_SLOT_CONFIGS.map((config) => [config.slotId, config]));
const graphicSlotConfigByPartId = new Map(
  GRAPHIC_SLOT_CONFIGS.flatMap((config) => [
    [config.customPartId, config],
    [config.legacyPartId, config],
  ]),
);
const pendingUserGraphicUploadsByRemote = new Map();
const recentUserGraphicUploadsByRemote = new Map();

function normalizeRemoteAddress(remoteAddress) {
  return String(remoteAddress || "").replace(/^::ffff:/, "");
}

function safeFileName(value) {
  return basename(String(value || "")).replace(/[^\w.-]/g, "");
}

function requestBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let rejected = false;

    req.on("data", (chunk) => {
      if (rejected) {
        return;
      }

      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        rejected = true;
        reject(Object.assign(new Error("upload-too-large"), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (!rejected) {
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", reject);
  });
}

function parseMultipartUploads(body, contentType) {
  const boundaryMatch = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return [];
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const bodyText = body.toString("latin1");
  const parts = bodyText.split(boundary);
  const uploads = [];

  for (const part of parts) {
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0 || !/filename=/i.test(part.slice(0, headerEnd))) {
      continue;
    }

    const headers = part.slice(0, headerEnd);
    let content = part.slice(headerEnd + 4);
    if (content.endsWith("\r\n")) {
      content = content.slice(0, -2);
    }
    if (content.endsWith("--")) {
      content = content.slice(0, -2);
    }
    if (content.endsWith("\r\n")) {
      content = content.slice(0, -2);
    }

    uploads.push({
      fieldName: headers.match(/name="([^"]*)"/i)?.[1] || "",
      filename: headers.match(/filename="([^"]*)"/i)?.[1] || "",
      bytes: Buffer.from(content, "latin1"),
    });
  }

  return uploads;
}

function graphicSlotTextureSize(slotId) {
  return GRAPHIC_SLOT_TEXTURE_SIZES[Number(slotId || 0)] || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleImageChannel(data, width, height, x, y, channel) {
  const x0 = clamp(Math.floor(x), 0, width - 1);
  const y0 = clamp(Math.floor(y), 0, height - 1);
  const x1 = clamp(x0 + 1, 0, width - 1);
  const y1 = clamp(y0 + 1, 0, height - 1);
  const xRatio = clamp(x - x0, 0, 1);
  const yRatio = clamp(y - y0, 0, 1);
  const topLeft = data[((y0 * width + x0) * 4) + channel];
  const topRight = data[((y0 * width + x1) * 4) + channel];
  const bottomLeft = data[((y1 * width + x0) * 4) + channel];
  const bottomRight = data[((y1 * width + x1) * 4) + channel];
  const top = topLeft + (topRight - topLeft) * xRatio;
  const bottom = bottomLeft + (bottomRight - bottomLeft) * xRatio;

  return Math.round(top + (bottom - top) * yRatio);
}

function resizeGraphicExact(decoded, width, height) {
  const sourceWidth = Number(decoded?.width || 0);
  const sourceHeight = Number(decoded?.height || 0);
  if (!sourceWidth || !sourceHeight || !decoded?.data) {
    throw new Error("invalid-graphic-source");
  }

  if (sourceWidth === width && sourceHeight === height) {
    return Buffer.from(decoded.data);
  }

  const data = Buffer.alloc(width * height * 4);
  const xScale = sourceWidth / width;
  const yScale = sourceHeight / height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) * xScale) - 0.5;
      const sourceY = ((y + 0.5) * yScale) - 0.5;
      const targetOffset = (y * width + x) * 4;

      data[targetOffset] = sampleImageChannel(decoded.data, sourceWidth, sourceHeight, sourceX, sourceY, 0);
      data[targetOffset + 1] = sampleImageChannel(decoded.data, sourceWidth, sourceHeight, sourceX, sourceY, 1);
      data[targetOffset + 2] = sampleImageChannel(decoded.data, sourceWidth, sourceHeight, sourceX, sourceY, 2);
      data[targetOffset + 3] = sampleImageChannel(decoded.data, sourceWidth, sourceHeight, sourceX, sourceY, 3);
    }
  }

  return data;
}

function resizeGraphicFit(decoded, width, height) {
  const sourceWidth = Number(decoded?.width || 0);
  const sourceHeight = Number(decoded?.height || 0);
  if (!sourceWidth || !sourceHeight || !decoded?.data) {
    throw new Error("invalid-graphic-source");
  }

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawnWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawnHeight = Math.max(1, Math.round(sourceHeight * scale));
  const fittedData = resizeGraphicExact(decoded, drawnWidth, drawnHeight);
  const canvas = Buffer.alloc(width * height * 4);
  const offsetX = Math.floor((width - drawnWidth) / 2);
  const offsetY = Math.floor((height - drawnHeight) / 2);

  for (let y = 0; y < drawnHeight; y += 1) {
    for (let x = 0; x < drawnWidth; x += 1) {
      const sourceOffset = (y * drawnWidth + x) * 4;
      const targetOffset = ((offsetY + y) * width + (offsetX + x)) * 4;
      canvas[targetOffset] = fittedData[sourceOffset];
      canvas[targetOffset + 1] = fittedData[sourceOffset + 1];
      canvas[targetOffset + 2] = fittedData[sourceOffset + 2];
      canvas[targetOffset + 3] = fittedData[sourceOffset + 3];
    }
  }

  return canvas;
}

function signedBitCount(value) {
  const magnitude = Math.abs(Number(value) || 0);
  return Math.max(2, Math.floor(Math.log2(magnitude || 1)) + 2);
}

class SwfBitWriter {
  constructor() {
    this.bytes = [];
    this.current = 0;
    this.used = 0;
  }

  writeUnsigned(value, bits) {
    for (let bit = bits - 1; bit >= 0; bit -= 1) {
      this.current = (this.current << 1) | ((value >> bit) & 1);
      this.used += 1;
      if (this.used === 8) {
        this.bytes.push(this.current);
        this.current = 0;
        this.used = 0;
      }
    }
  }

  writeSigned(value, bits) {
    const encoded = Number(value) < 0
      ? (1 << bits) + Number(value)
      : Number(value);
    this.writeUnsigned(encoded, bits);
  }

  align() {
    if (this.used > 0) {
      this.bytes.push(this.current << (8 - this.used));
      this.current = 0;
      this.used = 0;
    }
  }

  buffer() {
    this.align();
    return Buffer.from(this.bytes);
  }
}

function swfRect(xMin, xMax, yMin, yMax) {
  const bits = Math.max(
    signedBitCount(xMin),
    signedBitCount(xMax),
    signedBitCount(yMin),
    signedBitCount(yMax),
  );
  const writer = new SwfBitWriter();
  writer.writeUnsigned(bits, 5);
  writer.writeSigned(xMin, bits);
  writer.writeSigned(xMax, bits);
  writer.writeSigned(yMin, bits);
  writer.writeSigned(yMax, bits);
  return writer.buffer();
}

function swfMatrix({ scaleX = 1, scaleY = 1, translateX = 0, translateY = 0 } = {}) {
  const writer = new SwfBitWriter();
  const hasScale = scaleX !== 1 || scaleY !== 1;
  writer.writeUnsigned(hasScale ? 1 : 0, 1);
  if (hasScale) {
    const fixedScaleX = Math.round(scaleX * 65536);
    const fixedScaleY = Math.round(scaleY * 65536);
    const scaleBits = Math.max(signedBitCount(fixedScaleX), signedBitCount(fixedScaleY));
    writer.writeUnsigned(scaleBits, 5);
    writer.writeSigned(fixedScaleX, scaleBits);
    writer.writeSigned(fixedScaleY, scaleBits);
  }
  writer.writeUnsigned(0, 1);
  const translateBits = Math.max(signedBitCount(translateX), signedBitCount(translateY));
  writer.writeUnsigned(translateBits, 5);
  writer.writeSigned(translateX, translateBits);
  writer.writeSigned(translateY, translateBits);
  return writer.buffer();
}

function swfTag(code, body = Buffer.alloc(0)) {
  if (body.length < 0x3f) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE((code << 6) | body.length, 0);
    return Buffer.concat([header, body]);
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE((code << 6) | 0x3f, 0);
  header.writeUInt32LE(body.length, 2);
  return Buffer.concat([header, body]);
}

function defineBitsLossless2Tag(characterId, decoded) {
  const width = Number(decoded.width || 0);
  const height = Number(decoded.height || 0);
  const argb = Buffer.alloc(width * height * 4);
  for (let source = 0, target = 0; source < decoded.data.length; source += 4, target += 4) {
    argb[target] = decoded.data[source + 3];
    argb[target + 1] = decoded.data[source];
    argb[target + 2] = decoded.data[source + 1];
    argb[target + 3] = decoded.data[source + 2];
  }

  const header = Buffer.alloc(7);
  header.writeUInt16LE(characterId, 0);
  header.writeUInt8(5, 2);
  header.writeUInt16LE(width, 3);
  header.writeUInt16LE(height, 5);
  return swfTag(36, Buffer.concat([header, deflateSync(argb)]));
}

function shapeRecordMoveAndFill(fillStyleId) {
  const writer = new SwfBitWriter();
  writer.writeUnsigned(0, 1);
  writer.writeUnsigned(0, 1);
  writer.writeUnsigned(0, 1);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(0, 1);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(2, 5);
  writer.writeSigned(0, 2);
  writer.writeSigned(0, 2);
  writer.writeUnsigned(fillStyleId, 1);
  return writer;
}

function appendStraightEdge(writer, dx, dy) {
  const bits = Math.max(signedBitCount(dx), signedBitCount(dy));
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(1, 1);
  writer.writeUnsigned(bits - 2, 4);
  writer.writeUnsigned(1, 1);
  writer.writeSigned(dx, bits);
  writer.writeSigned(dy, bits);
}

function defineBitmapShapeTag(shapeId, bitmapId, width, height) {
  const widthTwips = width * 20;
  const heightTwips = height * 20;
  const shapeBounds = swfRect(0, widthTwips, 0, heightTwips);
  const fillStyle = Buffer.concat([
    Buffer.from([0x41]),
    Buffer.from([bitmapId & 0xff, (bitmapId >> 8) & 0xff]),
    swfMatrix({ scaleX: 20, scaleY: 20 }),
  ]);

  const styles = Buffer.concat([
    Buffer.from([1]),
    fillStyle,
    Buffer.from([0]),
    Buffer.from([0x10]),
  ]);
  const records = shapeRecordMoveAndFill(1);
  appendStraightEdge(records, widthTwips, 0);
  appendStraightEdge(records, 0, heightTwips);
  appendStraightEdge(records, -widthTwips, 0);
  appendStraightEdge(records, 0, -heightTwips);
  records.writeUnsigned(0, 6);

  const id = Buffer.alloc(2);
  id.writeUInt16LE(shapeId, 0);
  return swfTag(32, Buffer.concat([id, shapeBounds, styles, records.buffer()]));
}

function buildBitmapSwf(decoded) {
  const width = Number(decoded.width || 0);
  const height = Number(decoded.height || 0);
  if (!width || !height || !decoded.data) {
    throw new Error("invalid-swf-bitmap-source");
  }

  const frame = Buffer.concat([
    swfRect(0, width * 20, 0, height * 20),
    Buffer.from([0x00, 0x18, 0x01, 0x00]),
  ]);
  const placeBody = Buffer.concat([
    Buffer.from([0x06, 0x01, 0x00, 0x02, 0x00]),
    swfMatrix(),
  ]);
  const body = Buffer.concat([
    frame,
    swfTag(9, Buffer.from([0xff, 0xff, 0xff])),
    defineBitsLossless2Tag(1, decoded),
    defineBitmapShapeTag(2, 1, width, height),
    swfTag(26, placeBody),
    swfTag(1),
    swfTag(0),
  ]);
  const header = Buffer.alloc(8);
  header.write("FWS", 0, "ascii");
  header.writeUInt8(8, 3);
  header.writeUInt32LE(header.length + body.length, 4);
  return Buffer.concat([header, body]);
}

function decodedGraphicHasAlpha(decoded) {
  const data = decoded?.data;
  if (!data) {
    return false;
  }

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 255) {
      return true;
    }
  }

  return false;
}

function readPngGraphic(buffer) {
  const png = PNG.sync.read(buffer);
  return {
    data: Buffer.from(png.data),
    height: png.height,
    width: png.width,
  };
}

function readJpegGraphic(buffer) {
  const decoded = jpeg.decode(buffer, {
    colorTransform: true,
    maxMemoryUsageInMB: 512,
    useTArray: true,
  });

  return {
    data: Buffer.from(decoded.data),
    height: decoded.height,
    width: decoded.width,
  };
}

function decodeUserGraphic(buffer, fileExt) {
  const normalizedExt = normalizeUserGraphicFileExt(fileExt);
  const detectedImageExt = imageFileExtFromBytes(buffer);
  const isPng = detectedImageExt === "png";
  const isJpeg = detectedImageExt === "jpg";

  if (isPng || normalizedExt === "png") {
    return readPngGraphic(buffer);
  }
  if (isJpeg || normalizedExt === "jpg" || normalizedExt === "jpeg") {
    return readJpegGraphic(buffer);
  }

  return null;
}

function imageFileExtFromBytes(buffer) {
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) {
    return "gif";
  }
  return "";
}

function encodeGraphicPng(decoded) {
  const png = {
    data: decoded.data,
    height: decoded.height,
    width: decoded.width,
  };
  const options = {
    colorType: decodedGraphicHasAlpha(decoded) ? 6 : 2,
    deflateLevel: 9,
    inputColorType: 6,
  };

  try {
    return PNG.sync.write(png, options);
  } catch {
    return PNG.sync.write(png, { colorType: 6, deflateLevel: 9, inputColorType: 6 });
  }
}

function normalizeUserGraphicUpload({ bytes, fileExt, slotId }) {
  const textureSize = graphicSlotTextureSize(slotId);
  const originalBytes = bytes.length;

  if (!textureSize) {
    if (originalBytes > MAX_UNNORMALIZED_USER_GRAPHIC_BYTES) {
      throw Object.assign(new Error("custom-graphic-too-large"), { statusCode: 406 });
    }
    return {
      bytes,
      fileExt,
      normalized: false,
      originalBytes,
    };
  }

  let decoded;
  try {
    decoded = decodeUserGraphic(bytes, fileExt);
  } catch {
    decoded = null;
  }
  if (!decoded) {
    if (originalBytes > MAX_UNNORMALIZED_USER_GRAPHIC_BYTES) {
      throw Object.assign(new Error("custom-graphic-too-large"), { statusCode: 406 });
    }
    return {
      bytes,
      fileExt,
      normalized: false,
      originalBytes,
    };
  }

  const target = {
    data: resizeGraphicFit(decoded, textureSize.width, textureSize.height),
    height: textureSize.height,
    width: textureSize.width,
  };
  const normalizedBytes = encodeGraphicPng(target);

  return {
    bytes: normalizedBytes,
    fileExt: "png",
    height: textureSize.height,
    normalized: decoded.width !== textureSize.width || decoded.height !== textureSize.height,
    originalBytes,
    originalHeight: decoded.height,
    originalWidth: decoded.width,
    targetHeight: textureSize.height,
    targetWidth: textureSize.width,
    width: textureSize.width,
  };
}

export function normalizeUserGraphicFileExt(value, fallback = "png") {
  const normalized = String(value || "").trim().toLowerCase().replace(/^\./, "");
  if (USER_GRAPHIC_FILE_EXTENSIONS.includes(normalized)) {
    return normalized;
  }

  return fallback;
}

export function userDecalDirectory(dataRoot) {
  return join(String(dataRoot || ""), "userDecals");
}

export function userDecalPath(fileName, { dataRoot }) {
  return join(userDecalDirectory(dataRoot), safeFileName(fileName));
}

export function assetUserDecalDirectory(assetRoot) {
  return join(String(assetRoot || ""), "cache", "car", "userDecals");
}

function assetBuiltInDecalDirectories(assetRoot) {
  const root = String(assetRoot || "");

  return [
    join(root, "cache", "car", "decals"),
    join(root, "car", "decals"),
    join(root, "decals"),
  ];
}

function clientSafeUserDecalDirectory(dataRoot) {
  return join(userDecalDirectory(dataRoot), "client-safe");
}

export function graphicSlotConfig(slotId) {
  return graphicSlotConfigBySlotId.get(Number(slotId || 0)) || null;
}

export function graphicSlotForPartId(partId) {
  return graphicSlotConfigByPartId.get(Number(partId || 0))?.slotId || 0;
}

export function graphicSlotConfigForPartId(partId) {
  return graphicSlotConfigByPartId.get(Number(partId || 0)) || null;
}

export function graphicCatalogPartId(slotId, decalId) {
  const normalizedSlotId = Number(slotId || 0);
  const normalizedDecalId = Number(decalId || 0);
  return GRAPHIC_CATALOG_ID_BASE
    + (normalizedSlotId - 160) * GRAPHIC_CATALOG_ID_SLOT_SPAN
    + normalizedDecalId;
}

export function getCustomGraphicSlotIdForField(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return 0;
  }

  for (const config of GRAPHIC_SLOT_CONFIGS) {
    const exactCandidates = [config.shortKey, String(config.slotId)];
    const wordCandidates = [config.key, ...(config.aliases || [])];
    if (
      exactCandidates.includes(normalized)
      || wordCandidates.some((candidate) => normalized === candidate || normalized.includes(candidate))
    ) {
      return config.slotId;
    }
  }

  return 0;
}

export function isUserGraphicUploadType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return [
    "graphic",
    "graphics",
    "ugg",
    "userdecal",
    "userdecals",
    "usergraphic",
    "usergraphics",
  ].includes(normalized);
}

function partCommonAttributes(config, overrides = {}) {
  return {
    pi: config.slotId,
    ci: config.slotId,
    pcid: config.slotId,
    categoryID: config.slotId,
    p: config.price,
    pp: 0,
    g: "C",
    b: "graphics",
    bn: "Graphics",
    l: 100,
    mo: 0,
    hp: 0,
    tq: 0,
    wt: 0,
    cc: 0,
    ...overrides,
  };
}

export function buildCustomGraphicPlaceholderPart(config, { legacy = false } = {}) {
  const partId = legacy ? config.legacyPartId : config.customPartId;
  const displayName = legacy && config.key === "rear"
    ? "Custom Back Graphic"
    : config.customName;

  return {
    i: partId,
    t: "c",
    pt: "p",
    n: displayName,
    mn: legacy ? "Custom" : config.name,
    di: 1,
    pdi: 1,
    ug: 1,
    ...partCommonAttributes(
      config,
      legacy
        ? {
          p: 0,
          pp: config.price,
          g: "A",
        }
        : {},
    ),
  };
}

export function buildUserGraphicCatalogPart({ slotId, decalId }) {
  const config = graphicSlotConfig(slotId);
  const normalizedDecalId = Number(decalId || 0);
  if (!config || !normalizedDecalId) {
    return null;
  }

  const name = `${config.name} ${normalizedDecalId}`;
  return {
    i: graphicCatalogPartId(config.slotId, normalizedDecalId),
    t: "c",
    pt: "c",
    n: name,
    mn: name,
    di: normalizedDecalId,
    pdi: normalizedDecalId,
    ...partCommonAttributes(config),
  };
}

export function buildCustomGraphicCatalogPart({
  basePart,
  partId,
  slotId,
  decalId,
  fileExt,
}) {
  const config = graphicSlotConfig(slotId)
    || graphicSlotConfigForPartId(partId)
    || GRAPHIC_SLOT_CONFIGS[1];
  const normalizedDecalId = String(decalId || "").replace(/[^0-9]/g, "") || "1";
  const normalizedFileExt = normalizeUserGraphicFileExt(fileExt);
  const name = basePart?.n || config.customName;

  return {
    ...(basePart || {}),
    i: Number(partId || basePart?.i || config.customPartId),
    pi: config.slotId,
    ci: config.slotId,
    t: "c",
    pt: "c",
    n: name,
    mn: basePart?.mn || name,
    p: Number(basePart?.p) > 0 ? Number(basePart.p) : config.price,
    pp: Number(basePart?.pp ?? 0),
    g: basePart?.g || "C",
    di: normalizedDecalId,
    pdi: normalizedDecalId,
    b: basePart?.b || "graphics",
    bn: basePart?.bn || "Custom Graphics",
    l: basePart?.l || 200,
    mo: Number(basePart?.mo || 0),
    hp: Number(basePart?.hp || 0),
    tq: Number(basePart?.tq || 0),
    wt: Number(basePart?.wt || 0),
    cc: Number(basePart?.cc || 0),
    fe: normalizedFileExt,
  };
}

export function buildGraphicsCatalogParts({ assetRoot, includeUploadedDecals = false } = {}) {
  const parts = [
    ...buildBuiltInGraphicCatalogParts({ assetRoot }),
    ...GRAPHIC_SLOT_CONFIGS.map((config) => buildCustomGraphicPlaceholderPart(config, { legacy: true })),
  ];
  if (!includeUploadedDecals) {
    return parts;
  }

  const decalsDir = assetUserDecalDirectory(assetRoot);

  if (!existsSync(decalsDir)) {
    return parts;
  }

  for (const fileName of readdirSync(decalsDir)) {
    const match = fileName.match(/^(160|161|162|163)_(\d+)\.swf$/i);
    if (!match) {
      continue;
    }

    const part = buildUserGraphicCatalogPart({
      slotId: Number(match[1]),
      decalId: Number(match[2]),
    });
    if (part) {
      parts.push(part);
    }
  }

  return parts;
}

function builtInGraphicPartId({ categoryId, designId, locationId }) {
  const locationIndex = Math.max(0, BUILT_IN_GRAPHIC_LOCATIONS.indexOf(Number(locationId)));

  return 940000 + Number(categoryId) * 10000 + Number(designId) * 10 + locationIndex;
}

function buildBuiltInGraphicCatalogParts({ assetRoot } = {}) {
  const designs = new Map();

  for (const decalDir of assetBuiltInDecalDirectories(assetRoot)) {
    if (!existsSync(decalDir)) {
      continue;
    }

    for (const fileName of readdirSync(decalDir)) {
      const swfMatch = fileName.match(/^(\d+)_(full|hood|side|front|back)\.swf$/i);
      if (swfMatch) {
        const designId = Number(swfMatch[1]);
        const key = swfMatch[2].toLowerCase();
        // Built-in graphic designs (full and hood/side/front/back panels) are
        // universal: the design artwork is shared and the per-car package
        // decalLoader warps it onto the selected car, so every car can use them.
        const category = BUILT_IN_GRAPHIC_CATEGORY_BY_KEY.get(key);
        if (category) {
          const mapKey = `${category.categoryId}:${designId}`;
          const entry = designs.get(mapKey) || { category, designId, variations: new Set() };
          designs.set(mapKey, entry);
        }
        continue;
      }

      const thumbnailMatch = fileName.match(/^(\d+)_(full|hood|side|front|back)_(\d+)_th\.jpg$/i);
      if (thumbnailMatch) {
        const designId = Number(thumbnailMatch[1]);
        const key = thumbnailMatch[2].toLowerCase();
        const variationId = Number(thumbnailMatch[3]);
        const category = BUILT_IN_GRAPHIC_CATEGORY_BY_KEY.get(key);
        const mapKey = `${category?.categoryId || 0}:${designId}`;
        const entry = designs.get(mapKey) || { category, designId, variations: new Set() };
        if (category && variationId > 0) {
          entry.variations.add(variationId);
          designs.set(mapKey, entry);
        }
      }
    }
    break;
  }

  return [...designs.values()]
    .filter((entry) => entry.category)
    .sort((left, right) => (
      Number(left.category.categoryId) - Number(right.category.categoryId)
      || Number(left.designId) - Number(right.designId)
    ))
    .flatMap(({ category, designId, variations }) => {
      const renderedVariations = [...variations]
        .sort((left, right) => left - right)
        .map((variationId) => ({
          i: variationId,
          di: variationId,
          n: variationId === 1 ? "Default" : `Variation ${variationId}`,
        }));

      return BUILT_IN_GRAPHIC_LOCATIONS.map((locationId) => ({
        i: builtInGraphicPartId({ categoryId: category.categoryId, designId, locationId }),
        pi: category.categoryId,
        ci: category.categoryId,
        pcid: category.categoryId,
        categoryID: category.categoryId,
        t: "c",
        pt: "c",
        n: `${category.name} ${designId}`,
        mn: category.name,
        p: category.price,
        pp: category.points,
        g: "C",
        di: designId,
        pdi: designId,
        b: "graphics",
        bn: "Graphics",
        l: locationId,
        mo: 0,
        hp: 0,
        tq: 0,
        wt: 0,
        cc: 0,
        variations: renderedVariations,
      }));
    });
}

function escapeXmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/'/g, "&apos;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function graphicsPartNode(config) {
  const part = buildCustomGraphicPlaceholderPart(config, { legacy: true });
  const panelName = config.key === "rear" ? "Back" : config.name.replace(/\s+Graphic$/i, "");

  return "<p " +
    `i='${part.i}' pi='${part.pi}' ci='${part.ci}' pcid='${part.pcid}' categoryID='${part.categoryID}' ` +
    `t='${part.t}' pt='p' n='${escapeXmlAttribute(part.n)}' ` +
    `pn='${escapeXmlAttribute(panelName)}' slot='${config.slotId}' sk='${config.shortKey}' ` +
    `p='${part.p}' pp='${part.pp}' g='${part.g}' di='${part.di}' pdi='${part.pdi}' ` +
    `b='${part.b}' bn='${part.bn}' mn='${escapeXmlAttribute(part.mn)}' l='${part.l}' ug='1'/>`;
}

export function buildGraphicsPartGroupXml() {
  const totalPointPrice = GRAPHIC_SLOT_CONFIGS.reduce((total, config) => total + Number(config.price || 0), 0);
  const panelButtonOrder = [161, 163, 162, 160];
  const panels = panelButtonOrder
    .map((slotId) => graphicSlotConfigBySlotId.get(slotId))
    .filter(Boolean)
    .map(graphicsPartNode)
    .join("");

  return `<g i='${GRAPHICS_SHOP_PANEL_CATEGORY_ID}' n='Panel' s='${GRAPHICS_SHOP_STORE_TYPE}' pp='${totalPointPrice}'>${panels}</g>`;
}

export function rememberUserGraphicUploadRequest({
  remoteAddress,
  accountId,
  uploadType,
  filename,
  slot,
  fieldName,
}) {
  if (!isUserGraphicUploadType(uploadType) || Number(accountId || 0) <= 0) {
    return false;
  }

  const slotId = Number(slot || 0) || getCustomGraphicSlotIdForField(fieldName || filename);
  pendingUserGraphicUploadsByRemote.set(normalizeRemoteAddress(remoteAddress), {
    accountId: Number(accountId),
    filename: String(filename || ""),
    requestedAt: Date.now(),
    slotId,
    uploadType: String(uploadType || ""),
  });

  return true;
}

function pruneRecentUploads(remoteKey) {
  const now = Date.now();
  const uploads = recentUserGraphicUploadsByRemote.get(remoteKey) || [];
  const kept = uploads.filter((upload) => now - Number(upload.createdAt || 0) <= RECENT_UPLOAD_TTL_MS);
  if (kept.length) {
    recentUserGraphicUploadsByRemote.set(remoteKey, kept);
  } else {
    recentUserGraphicUploadsByRemote.delete(remoteKey);
  }
  return kept;
}

export function rememberRecentUserGraphicUpload({
  remoteAddress,
  fieldName,
  targetPath,
  slotId,
}) {
  const remoteKey = normalizeRemoteAddress(remoteAddress);
  const inferredSlotId = Number(slotId || 0) || getCustomGraphicSlotIdForField(fieldName);
  const uploads = pruneRecentUploads(remoteKey);
  uploads.push({
    createdAt: Date.now(),
    fieldName: String(fieldName || ""),
    slotId: inferredSlotId,
    targetPath,
  });
  recentUserGraphicUploadsByRemote.set(remoteKey, uploads);
}

export function consumeRecentUserGraphicUpload({ remoteAddress, slotId }) {
  const remoteKey = normalizeRemoteAddress(remoteAddress);
  const normalizedSlotId = Number(slotId || 0);
  const uploads = pruneRecentUploads(remoteKey);
  const sorted = [...uploads].sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));
  const match = sorted.find((upload) => !normalizedSlotId || !upload.slotId || Number(upload.slotId) === normalizedSlotId);
  if (!match) {
    return null;
  }

  recentUserGraphicUploadsByRemote.set(
    remoteKey,
    uploads.filter((upload) => upload !== match),
  );
  return match;
}

function nextUserGraphicDecalId(dataRoot, fileExt) {
  const dir = userDecalDirectory(dataRoot);
  const base = Date.now() % 1000000;
  for (let offset = 0; offset < 1000; offset += 1) {
    const candidate = String((base + offset) % 1000000).replace(/[^0-9]/g, "");
    const uploadPathAvailable = !existsSync(join(dir, `${candidate}.${fileExt}`));
    const installedPathAvailable = GRAPHIC_SLOT_CONFIGS.every((config) => (
      !existsSync(join(dir, `${config.slotId}_${candidate}.swf`))
    ));
    if (uploadPathAvailable && installedPathAvailable) {
      return candidate;
    }
  }

  return String(Date.now()).replace(/[^0-9]/g, "").slice(-12);
}

export function getUserGraphicUploadResponseAttrs(slotKey, decalId, extension, fieldName = "") {
  const slotId = Number(slotKey || 0) || getCustomGraphicSlotIdForField(slotKey || fieldName);
  const config = graphicSlotConfig(slotId);
  const normalizedExt = normalizeUserGraphicFileExt(extension);

  if (!config) {
    return { i: decalId, fx: normalizedExt };
  }

  return {
    [config.shortKey]: decalId,
    [`${config.shortKey}x`]: normalizedExt,
  };
}

export function buildUserGraphicUploadResponseBody(decalId, attrs) {
  const serializedAttrs = Object.entries(attrs || {})
    .map(([key, value]) => `${key}='${value}'`)
    .join(" ");
  return `<r i='${decalId}'${serializedAttrs ? ` ${serializedAttrs}` : ""}/>`;
}

export async function handleUserGraphicUpload({
  req,
  config,
  logger,
  remoteAddress,
  searchParams = new URLSearchParams(),
}) {
  const remoteKey = normalizeRemoteAddress(remoteAddress);
  const pendingUpload = pendingUserGraphicUploadsByRemote.get(remoteKey);
  const requestUrl = `${searchParams?.size ? `?${searchParams.toString()}` : ""}`;

  let body;
  try {
    body = await requestBody(req, MAX_USER_GRAPHIC_UPLOAD_BYTES);
  } catch (error) {
    if (error.statusCode === 413) {
      return { statusCode: 413, body: "<r s='0'/>" };
    }
    throw error;
  }

  logger.info("User graphic upload request received", {
    accountId: searchParams.get("accountID") || searchParams.get("aid") || pendingUpload?.accountId || 0,
    bodyBytes: body.length,
    contentLength: req.headers["content-length"] || "",
    contentType: req.headers["content-type"] || "",
    hasPendingUpload: Boolean(pendingUpload),
    postBackId: searchParams.get("NeatUpload_PostBackID") || "",
    remoteAddress: remoteKey,
    requestUrl,
    slot: searchParams.get("slot") || "",
  });

  if (!body.length) {
    logger.warn("User graphic upload request had no body", {
      accountId: searchParams.get("accountID") || searchParams.get("aid") || pendingUpload?.accountId || 0,
      hasPendingUpload: Boolean(pendingUpload),
      postBackId: searchParams.get("NeatUpload_PostBackID") || "",
      remoteAddress: remoteKey,
      requestUrl,
    });
    return { statusCode: 200, body: "<r s='1'/>" };
  }

  const uploads = parseMultipartUploads(body, req.headers["content-type"]);
  if (uploads.length === 0) {
    uploads.push({
      fieldName: searchParams.get("slot") || "",
      filename: pendingUpload?.filename || searchParams.get("fn") || "graphic.png",
      bytes: body,
    });
  }

  const responseAttrs = {};
  const savedUploads = [];
  let responseDecalId = "";

  for (const upload of uploads) {
    const fieldSlotId = getCustomGraphicSlotIdForField(upload.fieldName);
    const explicitSlotId = Number(searchParams.get("slot") || 0)
      || getCustomGraphicSlotIdForField(searchParams.get("slot"));
    const slotId = fieldSlotId || explicitSlotId || pendingUpload?.slotId || 0;
    const fileExt = normalizeUserGraphicFileExt(searchParams.get("ext") || extname(upload.filename));
    let normalizedUpload;
    try {
      normalizedUpload = normalizeUserGraphicUpload({
        bytes: upload.bytes,
        fileExt,
        slotId,
      });
    } catch (error) {
      if (error.statusCode === 406) {
        logger.warn("User graphic upload rejected because it could not be normalized small enough", {
          accountId: pendingUpload?.accountId || 0,
          bytes: upload.bytes.length,
          fieldName: upload.fieldName || "",
          fileExt,
          filename: upload.filename || "",
          slotId,
        });
        return { statusCode: 406, body: "<r s='0'/>" };
      }
      throw error;
    }

    const savedFileExt = normalizeUserGraphicFileExt(normalizedUpload.fileExt, fileExt);
    const decalId = nextUserGraphicDecalId(config.dataRoot, savedFileExt);
    const targetPath = userDecalPath(`${decalId}.${savedFileExt}`, { dataRoot: config.dataRoot });

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, normalizedUpload.bytes);
    rememberRecentUserGraphicUpload({
      remoteAddress,
      fieldName: upload.fieldName || searchParams.get("slot") || "",
      targetPath,
      slotId,
    });

    Object.assign(
      responseAttrs,
      getUserGraphicUploadResponseAttrs(slotId, decalId, savedFileExt, upload.fieldName),
    );
    responseDecalId ||= decalId;
    savedUploads.push({
      bytes: normalizedUpload.bytes.length,
      decalId,
      fileExt: savedFileExt,
      fieldName: upload.fieldName || "",
      normalized: Boolean(normalizedUpload.normalized),
      originalBytes: normalizedUpload.originalBytes,
      originalHeight: normalizedUpload.originalHeight || 0,
      originalWidth: normalizedUpload.originalWidth || 0,
      slotId,
      targetPath,
      targetHeight: normalizedUpload.targetHeight || normalizedUpload.height || 0,
      targetWidth: normalizedUpload.targetWidth || normalizedUpload.width || 0,
    });
  }

  pendingUserGraphicUploadsByRemote.delete(remoteKey);

  const bodyText = buildUserGraphicUploadResponseBody(responseDecalId || "1", responseAttrs);

  logger.info("User graphic upload saved", {
    accountId: pendingUpload?.accountId || 0,
    uploadCount: savedUploads.length,
    uploads: savedUploads,
    responseBody: bodyText,
  });

  return { statusCode: 200, body: bodyText };
}

function resolveDecalIdFromPath(filePath) {
  const fileName = basename(String(filePath || ""));
  const match = fileName.match(/^(?:\d+_)?(\d+)\.(?:png|jpe?g|gif|swf)$/i);
  return match?.[1] || "";
}

function exactUserGraphicUploadPath({ dataRoot, decalId, fileExt, slotId }) {
  const decalDir = userDecalDirectory(dataRoot);
  const normalizedDecalId = String(decalId || "").replace(/[^0-9]/g, "");
  const preferredExt = normalizeUserGraphicFileExt(fileExt);
  const candidates = [
    join(decalDir, `${normalizedDecalId}.${preferredExt}`),
    join(decalDir, `${normalizedDecalId}.swf`),
    ...USER_GRAPHIC_IMAGE_FILE_EXTENSIONS.map((extension) => join(decalDir, `${normalizedDecalId}.${extension}`)),
  ];

  if (Number(slotId || 0) > 0) {
    candidates.unshift(
      join(decalDir, `${Number(slotId)}_${normalizedDecalId}.swf`),
      ...USER_GRAPHIC_IMAGE_FILE_EXTENSIONS.map((extension) => (
        join(decalDir, `${Number(slotId)}_${normalizedDecalId}.${extension}`)
      )),
    );
  }

  return candidates.find((candidate) => existsSync(candidate)) || "";
}

function recentUserGraphicUploadPath({ dataRoot }) {
  const decalDir = userDecalDirectory(dataRoot);
  if (!existsSync(decalDir)) {
    return "";
  }

  const now = Date.now();
  return readdirSync(decalDir)
    .filter((fileName) => /\.(png|jpe?g|gif|swf)$/i.test(fileName))
    .map((fileName) => {
      const filePath = join(decalDir, fileName);
      return {
        filePath,
        ageMs: now - statSync(filePath).mtimeMs,
      };
    })
    .filter((file) => file.ageMs <= RECENT_UPLOAD_FALLBACK_MS)
    .sort((left, right) => left.ageMs - right.ageMs)[0]?.filePath || "";
}

function userGraphicSlotIdFromFilePath(filePath) {
  const match = basename(String(filePath || "")).match(/^(160|161|162|163)_\d+\.(?:png|jpe?g|gif|swf)$/i);

  return Number(match?.[1] || 0);
}

export function isUserGraphicRequestPath(pathname) {
  const normalizedPath = decodeURIComponent(pathname || "").replace(/\\/g, "/");

  return /^\/(?:ugg\/)?cache\/car\/userDecals\/[^/]+$/i.test(normalizedPath);
}

export function clientUserGraphicFilePath(filePath, { dataRoot }) {
  const slotId = userGraphicSlotIdFromFilePath(filePath);
  if (!slotId) {
    return filePath;
  }

  let sourceBuffer;
  let sourceStat;
  try {
    sourceStat = statSync(filePath);
    sourceBuffer = readFileSync(filePath);
    const sourceExt = normalizeUserGraphicFileExt(extname(filePath));
    const detectedImageExt = imageFileExtFromBytes(sourceBuffer);
    const imageBackedSwf = sourceExt === "swf" && USER_GRAPHIC_IMAGE_FILE_EXTENSIONS.includes(detectedImageExt);
    const normalized = normalizeUserGraphicUpload({
      bytes: sourceBuffer,
      fileExt: extname(filePath),
      slotId,
    });

    if (!imageBackedSwf && !normalized.normalized && normalized.bytes.length === sourceBuffer.length) {
      return filePath;
    }

    const safeExt = imageBackedSwf
      ? "swf"
      : normalizeUserGraphicFileExt(normalized.fileExt, extname(filePath));
    const safePath = join(
      clientSafeUserDecalDirectory(dataRoot),
      `${basename(filePath, extname(filePath))}.${safeExt}`,
    );
    if (existsSync(safePath)) {
      const safeStat = statSync(safePath);
      if (safeStat.mtimeMs >= sourceStat.mtimeMs) {
        return safePath;
      }
    }

    mkdirSync(dirname(safePath), { recursive: true });
    if (imageBackedSwf) {
      const decoded = decodeUserGraphic(normalized.bytes, normalized.fileExt);
      if (!decoded) {
        return filePath;
      }
      writeFileSync(safePath, buildBitmapSwf(decoded));
    } else {
      writeFileSync(safePath, normalized.bytes);
    }

    return safePath;
  } catch {
    return filePath;
  }
}

function moveUserGraphicUpload(sourcePath, targetPath) {
  if (resolve(sourcePath) === resolve(targetPath)) {
    return;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  try {
    renameSync(sourcePath, targetPath);
  } catch (error) {
    if (existsSync(sourcePath)) {
      copyFileSync(sourcePath, targetPath);
      unlinkSync(sourcePath);
      return;
    }
    throw error;
  }
}

export function finalizeUserGraphicInstall({
  dataRoot,
  remoteAddress,
  slotId,
  decalId,
  fileExt,
  logger,
}) {
  const normalizedSlotId = Number(slotId || 0);
  let resolvedDecalId = String(decalId || "").replace(/[^0-9]/g, "") || "1";
  let resolvedFileExt = normalizeUserGraphicFileExt(fileExt);
  let sourcePath = exactUserGraphicUploadPath({
    dataRoot,
    decalId: resolvedDecalId,
    fileExt: resolvedFileExt,
    slotId: normalizedSlotId,
  });

  if (!sourcePath) {
    const recentUpload = consumeRecentUserGraphicUpload({ remoteAddress, slotId: normalizedSlotId });
    if (recentUpload?.targetPath && existsSync(recentUpload.targetPath)) {
      sourcePath = recentUpload.targetPath;
    }
  }

  if (!sourcePath) {
    sourcePath = recentUserGraphicUploadPath({ dataRoot });
    if (sourcePath) {
      logger?.warn("Using recent upload fallback for custom graphic", {
        decalId,
        slotId: normalizedSlotId,
        sourcePath,
        remoteAddress,
      });
    }
  }

  if (!sourcePath) {
    logger?.warn("Custom graphic source upload missing", {
      decalId,
      slotId: normalizedSlotId,
      remoteAddress,
    });
    return {
      decalId: resolvedDecalId,
      fileExt: resolvedFileExt,
      sourcePath: "",
      targetPath: "",
    };
  }

  resolvedFileExt = normalizeUserGraphicFileExt(extname(sourcePath), resolvedFileExt);
  resolvedDecalId = resolveDecalIdFromPath(sourcePath) || resolvedDecalId;
  const targetPath = userDecalPath(`${normalizedSlotId}_${resolvedDecalId}.swf`, { dataRoot });
  moveUserGraphicUpload(sourcePath, targetPath);

  logger?.info("Custom graphic finalized for install", {
    decalId: resolvedDecalId,
    fileExt: resolvedFileExt,
    slotId: normalizedSlotId,
    sourcePath,
    targetPath,
  });

  return {
    decalId: resolvedDecalId,
    fileExt: "swf",
    sourcePath,
    targetPath,
  };
}

export function resolveUserGraphicRequestPath(pathname, { assetRoot, dataRoot }) {
  const normalizedPath = decodeURIComponent(pathname || "").replace(/\\/g, "/");
  const match = normalizedPath.match(/^\/(?:ugg\/)?cache\/car\/userDecals\/([^/]+)$/i);
  if (!match) {
    return [];
  }

  const fileName = safeFileName(match[1]);
  const candidates = [
    join(userDecalDirectory(dataRoot), fileName),
    join(assetUserDecalDirectory(assetRoot), fileName),
  ];

  const installedGraphicMatch = fileName.match(/^(160|161|162|163)_(\d+)\.swf$/i);
  if (installedGraphicMatch) {
    const basenameWithoutExt = `${installedGraphicMatch[1]}_${installedGraphicMatch[2]}`;
    candidates.push(
      ...USER_GRAPHIC_IMAGE_FILE_EXTENSIONS.flatMap((extension) => [
        join(userDecalDirectory(dataRoot), `${basenameWithoutExt}.${extension}`),
        join(assetUserDecalDirectory(assetRoot), `${basenameWithoutExt}.${extension}`),
      ]),
    );
  }

  return candidates;
}
