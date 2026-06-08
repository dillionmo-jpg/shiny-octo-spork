export const PANEL_EXPORT_SIZES = Object.freeze({
  hood: Object.freeze({ width: 200, height: 200 }),
  side: Object.freeze({ width: 650, height: 187 }),
  front: Object.freeze({ width: 300, height: 160 }),
  back: Object.freeze({ width: 350, height: 150 }),
});

const TWIPS_PER_PIXEL = 20;

class ByteWriter {
  constructor() {
    this.bytes = [];
  }

  writeU8(value) {
    this.bytes.push(value & 0xff);
  }

  writeU16(value) {
    this.writeU8(value);
    this.writeU8(value >> 8);
  }

  writeU32(value) {
    this.writeU8(value);
    this.writeU8(value >> 8);
    this.writeU8(value >> 16);
    this.writeU8(value >> 24);
  }

  writeBytes(bytes) {
    for (const byte of bytes) this.writeU8(byte);
  }

  toUint8Array() {
    return Uint8Array.from(this.bytes);
  }
}

class BitWriter {
  constructor() {
    this.bytes = [];
    this.currentByte = 0;
    this.bitOffset = 0;
  }

  writeUB(value, bitCount) {
    for (let bit = bitCount - 1; bit >= 0; bit -= 1) {
      const mask = Math.floor(value / (2 ** bit)) & 1;
      this.currentByte = (this.currentByte << 1) | mask;
      this.bitOffset += 1;
      if (this.bitOffset === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.bitOffset = 0;
      }
    }
  }

  writeSB(value, bitCount) {
    const encoded = value < 0 ? (2 ** bitCount) + value : value;
    this.writeUB(encoded, bitCount);
  }

  align() {
    if (this.bitOffset === 0) return;
    this.currentByte <<= 8 - this.bitOffset;
    this.bytes.push(this.currentByte);
    this.currentByte = 0;
    this.bitOffset = 0;
  }

  toUint8Array() {
    this.align();
    return Uint8Array.from(this.bytes);
  }
}

function signedBitLength(...values) {
  let bitCount = 1;
  for (const value of values) {
    while (value < -(2 ** (bitCount - 1)) || value > (2 ** (bitCount - 1)) - 1) {
      bitCount += 1;
    }
  }
  return bitCount;
}

function writeRect({ xmin = 0, xmax, ymin = 0, ymax }) {
  const bitCount = signedBitLength(xmin, xmax, ymin, ymax);
  const bits = new BitWriter();
  bits.writeUB(bitCount, 5);
  bits.writeSB(xmin, bitCount);
  bits.writeSB(xmax, bitCount);
  bits.writeSB(ymin, bitCount);
  bits.writeSB(ymax, bitCount);
  return bits.toUint8Array();
}

function writeMatrix({
  scaleX = 1,
  scaleY = 1,
  rotateSkew0 = 0,
  rotateSkew1 = 0,
  translateX = 0,
  translateY = 0,
} = {}) {
  const bits = new BitWriter();

  if (scaleX !== 1 || scaleY !== 1) {
    const fixedScaleX = Math.round(scaleX * 65536);
    const fixedScaleY = Math.round(scaleY * 65536);
    const bitCount = signedBitLength(fixedScaleX, fixedScaleY);
    bits.writeUB(1, 1);
    bits.writeUB(bitCount, 5);
    bits.writeSB(fixedScaleX, bitCount);
    bits.writeSB(fixedScaleY, bitCount);
  } else {
    bits.writeUB(0, 1);
  }

  if (rotateSkew0 || rotateSkew1) {
    const fixedRotateSkew0 = Math.round(rotateSkew0 * 65536);
    const fixedRotateSkew1 = Math.round(rotateSkew1 * 65536);
    const bitCount = signedBitLength(fixedRotateSkew0, fixedRotateSkew1);
    bits.writeUB(1, 1);
    bits.writeUB(bitCount, 5);
    bits.writeSB(fixedRotateSkew0, bitCount);
    bits.writeSB(fixedRotateSkew1, bitCount);
  } else {
    bits.writeUB(0, 1);
  }

  const translateBits = translateX || translateY ? signedBitLength(translateX, translateY) : 0;
  bits.writeUB(translateBits, 5);
  if (translateBits) {
    bits.writeSB(translateX, translateBits);
    bits.writeSB(translateY, translateBits);
  }

  return bits.toUint8Array();
}

function makeTag(type, body = new Uint8Array()) {
  const writer = new ByteWriter();
  if (body.length < 0x3f) {
    writer.writeU16((type << 6) | body.length);
  } else {
    writer.writeU16((type << 6) | 0x3f);
    writer.writeU32(body.length);
  }
  writer.writeBytes(body);
  return writer.toUint8Array();
}

async function deflateBytes(bytes) {
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  const { deflateSync } = await import("node:zlib");
  return new Uint8Array(deflateSync(bytes));
}

function toArgbBitmapData(rgba) {
  const argb = new Uint8Array(rgba.length);
  for (let index = 0; index < rgba.length; index += 4) {
    argb[index] = rgba[index + 3];
    argb[index + 1] = rgba[index];
    argb[index + 2] = rgba[index + 1];
    argb[index + 3] = rgba[index + 2];
  }
  return argb;
}

async function defineBitsLossless2({ characterId, width, height, rgba }) {
  const writer = new ByteWriter();
  writer.writeU16(characterId);
  writer.writeU8(5);
  writer.writeU16(width);
  writer.writeU16(height);
  writer.writeBytes(await deflateBytes(toArgbBitmapData(rgba)));
  return makeTag(36, writer.toUint8Array());
}

function writeStraightEdge(bits, deltaX, deltaY) {
  const bitCount = Math.max(2, signedBitLength(deltaX, deltaY));
  bits.writeUB(1, 1);
  bits.writeUB(1, 1);
  bits.writeUB(bitCount - 2, 4);
  bits.writeUB(1, 1);
  bits.writeSB(deltaX, bitCount);
  bits.writeSB(deltaY, bitCount);
}

function writeShapeRecords(widthTwips, heightTwips) {
  const bits = new BitWriter();
  bits.writeUB(1, 4);
  bits.writeUB(0, 4);

  bits.writeUB(0, 1);
  bits.writeUB(0, 1);
  bits.writeUB(0, 1);
  bits.writeUB(1, 1);
  bits.writeUB(1, 1);
  bits.writeUB(1, 1);
  bits.writeUB(1, 5);
  bits.writeSB(0, 1);
  bits.writeSB(0, 1);
  bits.writeUB(1, 1);
  bits.writeUB(1, 1);

  writeStraightEdge(bits, widthTwips, 0);
  writeStraightEdge(bits, 0, heightTwips);
  writeStraightEdge(bits, -widthTwips, 0);
  writeStraightEdge(bits, 0, -heightTwips);

  bits.writeUB(0, 6);
  return bits.toUint8Array();
}

function defineBitmapShape({ shapeId, bitmapId, widthTwips, heightTwips }) {
  const writer = new ByteWriter();
  writer.writeU16(shapeId);
  writer.writeBytes(writeRect({ xmax: widthTwips, ymax: heightTwips }));

  writer.writeU8(1);
  writer.writeU8(0x41);
  writer.writeU16(bitmapId);
  writer.writeBytes(writeMatrix({ scaleX: TWIPS_PER_PIXEL, scaleY: TWIPS_PER_PIXEL }));
  writer.writeU8(0);
  writer.writeBytes(writeShapeRecords(widthTwips, heightTwips));

  return makeTag(32, writer.toUint8Array());
}

function placeObject2({ characterId, depth }) {
  const writer = new ByteWriter();
  writer.writeU8(0x06);
  writer.writeU16(depth);
  writer.writeU16(characterId);
  writer.writeBytes(writeMatrix());
  return makeTag(26, writer.toUint8Array());
}

function normalizeRgba({ width, height, rgba }) {
  if (!Number.isInteger(width) || width <= 0 || width > 8191) {
    throw new Error(`Invalid SWF bitmap width: ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0 || height > 8191) {
    throw new Error(`Invalid SWF bitmap height: ${height}`);
  }
  if (!rgba || rgba.length !== width * height * 4) {
    throw new Error(`RGBA data length must be ${width * height * 4} bytes`);
  }
  return rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer || rgba);
}

function normalizeBytes(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  throw new Error("SWF data must be a Uint8Array or ArrayBuffer");
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)) >>> 0;
}

function readRectInfo(bytes, offset) {
  let byteOffset = offset;
  let bitOffset = 0;
  const readUB = (bitCount) => {
    let value = 0;
    for (let index = 0; index < bitCount; index += 1) {
      const bit = (bytes[byteOffset] >> (7 - bitOffset)) & 1;
      value = (value << 1) | bit;
      bitOffset += 1;
      if (bitOffset === 8) {
        bitOffset = 0;
        byteOffset += 1;
      }
    }
    return value;
  };
  const readSB = (bitCount) => {
    const value = readUB(bitCount);
    const signBit = 1 << (bitCount - 1);
    return value & signBit ? value - (1 << bitCount) : value;
  };

  const bitCount = readUB(5);
  const xmin = readSB(bitCount);
  const xmax = readSB(bitCount);
  const ymin = readSB(bitCount);
  const ymax = readSB(bitCount);
  if (bitOffset !== 0) byteOffset += 1;

  return {
    xmin,
    xmax,
    ymin,
    ymax,
    endOffset: byteOffset,
  };
}

function readTags(bytes, startOffset) {
  const tags = [];
  let offset = startOffset;
  while (offset + 2 <= bytes.length) {
    const header = readU16(bytes, offset);
    offset += 2;
    const type = header >> 6;
    let length = header & 0x3f;
    if (length === 0x3f) {
      length = readU32(bytes, offset);
      offset += 4;
    }
    const bodyOffset = offset;
    const nextOffset = offset + length;
    tags.push({ type, length, bodyOffset, nextOffset });
    offset = nextOffset;
    if (type === 0) break;
  }
  return tags;
}

export function inspectCustomGraphicSwf(input) {
  const bytes = normalizeBytes(input);
  if (bytes.length < 12) throw new Error("SWF data is too short");
  const signature = String.fromCharCode(bytes[0], bytes[1], bytes[2]);
  const version = bytes[3];
  const fileLength = readU32(bytes, 4);
  const rect = readRectInfo(bytes, 8);
  const frameHeaderEnd = rect.endOffset + 4;

  return {
    signature,
    version,
    fileLength,
    byteLength: bytes.length,
    width: (rect.xmax - rect.xmin) / TWIPS_PER_PIXEL,
    height: (rect.ymax - rect.ymin) / TWIPS_PER_PIXEL,
    tags: readTags(bytes, frameHeaderEnd).map((tag) => ({
      type: tag.type,
      length: tag.length,
    })),
  };
}

export function validateCustomGraphicSwf(input, { width, height } = {}) {
  try {
    const inspection = inspectCustomGraphicSwf(input);
    const tagTypes = inspection.tags.map((tag) => tag.type);
    const expectedTags = [36, 32, 26, 1, 0];
    const tagsMatch = expectedTags.every((type, index) => tagTypes[index] === type);
    const sizeMatches = (width == null || inspection.width === width)
      && (height == null || inspection.height === height);
    const valid = inspection.signature === "FWS"
      && inspection.version === 8
      && inspection.fileLength === inspection.byteLength
      && tagsMatch
      && sizeMatches;

    return {
      valid,
      signature: inspection.signature,
      version: inspection.version,
      width: inspection.width,
      height: inspection.height,
      tagTypes,
      byteLength: inspection.byteLength,
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message || String(error),
    };
  }
}

export async function createCustomGraphicSwf({ width, height, rgba, frameRate = 24 }) {
  const normalizedRgba = normalizeRgba({ width, height, rgba });
  const widthTwips = width * TWIPS_PER_PIXEL;
  const heightTwips = height * TWIPS_PER_PIXEL;
  const bitmapId = 1;
  const shapeId = 2;
  const tags = [
    await defineBitsLossless2({ characterId: bitmapId, width, height, rgba: normalizedRgba }),
    defineBitmapShape({ shapeId, bitmapId, widthTwips, heightTwips }),
    placeObject2({ characterId: shapeId, depth: 1 }),
    makeTag(1),
    makeTag(0),
  ];

  const frame = new ByteWriter();
  frame.writeBytes(writeRect({ xmax: widthTwips, ymax: heightTwips }));
  frame.writeU16(Math.round(frameRate) << 8);
  frame.writeU16(1);
  for (const tag of tags) frame.writeBytes(tag);

  const frameBytes = frame.toUint8Array();
  const fileLength = 8 + frameBytes.length;
  const writer = new ByteWriter();
  writer.writeU8(0x46);
  writer.writeU8(0x57);
  writer.writeU8(0x53);
  writer.writeU8(8);
  writer.writeU32(fileLength);
  writer.writeBytes(frameBytes);
  return writer.toUint8Array();
}
