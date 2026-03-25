const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BUILD_DIR = path.join(process.cwd(), 'build');
const ICONSET_DIR = path.join(BUILD_DIR, 'icon.iconset');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];

    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function pngFromRgba(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rows = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;

    for (let x = 0; x < width; x += 1) {
      const pixel = pixels[(y * width + x) * 4 + 0];
      const out = rowStart + 1 + x * 4;
      rows[out] = pixels[(y * width + x) * 4 + 0];
      rows[out + 1] = pixels[(y * width + x) * 4 + 1];
      rows[out + 2] = pixels[(y * width + x) * 4 + 2];
      rows[out + 3] = pixels[(y * width + x) * 4 + 3];
      void pixel;
    }
  }

  const compressed = zlib.deflateSync(rows, { level: 9 });

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function blendPixel(buffer, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) {
    return;
  }

  const offset = (y * width + x) * 4;
  const sourceAlpha = (color[3] ?? 255) / 255;
  const destinationAlpha = (buffer[offset + 3] ?? 0) / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);

  if (outputAlpha === 0) {
    return;
  }

  buffer[offset] = Math.round(
    ((color[0] * sourceAlpha) + (buffer[offset] * destinationAlpha * (1 - sourceAlpha))) / outputAlpha
  );
  buffer[offset + 1] = Math.round(
    ((color[1] * sourceAlpha) + (buffer[offset + 1] * destinationAlpha * (1 - sourceAlpha))) / outputAlpha
  );
  buffer[offset + 2] = Math.round(
    ((color[2] * sourceAlpha) + (buffer[offset + 2] * destinationAlpha * (1 - sourceAlpha))) / outputAlpha
  );
  buffer[offset + 3] = Math.round(outputAlpha * 255);
}

function lerpColor(start, end, t) {
  return [
    Math.round(start[0] + (end[0] - start[0]) * t),
    Math.round(start[1] + (end[1] - start[1]) * t),
    Math.round(start[2] + (end[2] - start[2]) * t),
    Math.round(start[3] + (end[3] - start[3]) * t)
  ];
}

function fillRoundedRect(buffer, width, height, rect, radius, color) {
  const xEnd = rect.x + rect.width;
  const yEnd = rect.y + rect.height;

  for (let y = rect.y; y < yEnd; y += 1) {
    for (let x = rect.x; x < xEnd; x += 1) {
      const dx = x < rect.x + radius
        ? rect.x + radius - x
        : x >= xEnd - radius
          ? x - (xEnd - radius - 1)
          : 0;
      const dy = y < rect.y + radius
        ? rect.y + radius - y
        : y >= yEnd - radius
          ? y - (yEnd - radius - 1)
          : 0;

      if (dx === 0 || dy === 0 || dx * dx + dy * dy <= radius * radius) {
        blendPixel(buffer, width, x, y, color);
      }
    }
  }
}

function fillGradientRoundedRect(buffer, width, height, rect, radius, topColor, bottomColor) {
  const xEnd = rect.x + rect.width;
  const yEnd = rect.y + rect.height;

  for (let y = rect.y; y < yEnd; y += 1) {
    const t = rect.height <= 1 ? 0 : (y - rect.y) / (rect.height - 1);
    const color = lerpColor(topColor, bottomColor, t);

    for (let x = rect.x; x < xEnd; x += 1) {
      const dx = x < rect.x + radius
        ? rect.x + radius - x
        : x >= xEnd - radius
          ? x - (xEnd - radius - 1)
          : 0;
      const dy = y < rect.y + radius
        ? rect.y + radius - y
        : y >= yEnd - radius
          ? y - (yEnd - radius - 1)
          : 0;

      if (dx === 0 || dy === 0 || dx * dx + dy * dy <= radius * radius) {
        blendPixel(buffer, width, x, y, color);
      }
    }
  }
}

function fillRect(buffer, width, rect, color) {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      blendPixel(buffer, width, x, y, color);
    }
  }
}

function fillTriangle(buffer, width, p1, p2, p3, color) {
  const minX = Math.floor(Math.min(p1.x, p2.x, p3.x));
  const maxX = Math.ceil(Math.max(p1.x, p2.x, p3.x));
  const minY = Math.floor(Math.min(p1.y, p2.y, p3.y));
  const maxY = Math.ceil(Math.max(p1.y, p2.y, p3.y));

  const area = (p2.y - p3.y) * (p1.x - p3.x) + (p3.x - p2.x) * (p1.y - p3.y);

  if (area === 0) {
    return;
  }

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const w1 = ((p2.y - p3.y) * (x - p3.x) + (p3.x - p2.x) * (y - p3.y)) / area;
      const w2 = ((p3.y - p1.y) * (x - p3.x) + (p1.x - p3.x) * (y - p3.y)) / area;
      const w3 = 1 - w1 - w2;

      if (w1 >= 0 && w2 >= 0 && w3 >= 0) {
        blendPixel(buffer, width, x, y, color);
      }
    }
  }
}

function fillCircle(buffer, width, centerX, centerY, radius, color) {
  for (let y = Math.max(0, centerY - radius); y <= centerY + radius; y += 1) {
    for (let x = Math.max(0, centerX - radius); x <= centerX + radius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;

      if (dx * dx + dy * dy <= radius * radius) {
        blendPixel(buffer, width, x, y, color);
      }
    }
  }
}

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const blueTop = [24, 78, 166, 255];
  const orangeBottom = [223, 95, 56, 255];
  const mid = lerpColor(blueTop, orangeBottom, 0.52);
  const shadow = [7, 18, 40, 36];
  const white = [255, 255, 255, 245];

  fillRoundedRect(
    pixels,
    size,
    size,
    {
      x: Math.round(size * 0.21),
      y: Math.round(size * 0.18),
      width: Math.round(size * 0.58),
      height: Math.round(size * 0.46)
    },
    Math.round(size * 0.16),
    shadow
  );

  fillGradientRoundedRect(
    pixels,
    size,
    size,
    {
      x: Math.round(size * 0.19),
      y: Math.round(size * 0.14),
      width: Math.round(size * 0.6),
      height: Math.round(size * 0.46)
    },
    Math.round(size * 0.17),
    blueTop,
    orangeBottom
  );

  fillCircle(
    pixels,
    size,
    Math.round(size * 0.67),
    Math.round(size * 0.49),
    Math.round(size * 0.18),
    [orangeBottom[0], orangeBottom[1], orangeBottom[2], 120]
  );
  fillCircle(
    pixels,
    size,
    Math.round(size * 0.67),
    Math.round(size * 0.49),
    Math.round(size * 0.13),
    [0, 0, 0, 0]
  );

  fillRoundedRect(
    pixels,
    size,
    size,
    {
      x: Math.round(size * 0.44),
      y: Math.round(size * 0.235),
      width: Math.round(size * 0.12),
      height: Math.round(size * 0.19)
    },
    Math.round(size * 0.06),
    white
  );
  fillRoundedRect(
    pixels,
    size,
    size,
    {
      x: Math.round(size * 0.395),
      y: Math.round(size * 0.44),
      width: Math.round(size * 0.21),
      height: Math.round(size * 0.04)
    },
    Math.round(size * 0.02),
    white
  );
  fillRoundedRect(
    pixels,
    size,
    size,
    {
      x: Math.round(size * 0.485),
      y: Math.round(size * 0.48),
      width: Math.round(size * 0.03),
      height: Math.round(size * 0.09)
    },
    Math.round(size * 0.015),
    white
  );

  return pngFromRgba(size, size, pixels);
}

function writeIco(pngBuffer, outputPath) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);

  const entry = Buffer.alloc(16);
  entry[0] = 0;
  entry[1] = 0;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12);

  fs.writeFileSync(outputPath, Buffer.concat([header, entry, pngBuffer]));
}

function writeIcns(chunks, outputPath) {
  const body = [];

  for (const [type, pngBuffer] of chunks) {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, 'ascii');
    header.writeUInt32BE(pngBuffer.length + 8, 4);
    body.push(header, pngBuffer);
  }

  const totalLength = 8 + body.reduce((sum, item) => sum + item.length, 0);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 4, 'ascii');
  fileHeader.writeUInt32BE(totalLength, 4);

  fs.writeFileSync(outputPath, Buffer.concat([fileHeader, ...body]));
}

function buildIconset() {
  const sizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024]
  ];

  ensureDir(ICONSET_DIR);

  for (const [name, size] of sizes) {
    fs.writeFileSync(path.join(ICONSET_DIR, name), drawIcon(size));
  }
}

function main() {
  ensureDir(BUILD_DIR);

  const icon1024 = drawIcon(1024);
  const icon256 = drawIcon(256);
  const icnsChunks = [
    ['icp4', drawIcon(16)],
    ['icp5', drawIcon(32)],
    ['icp6', drawIcon(64)],
    ['ic07', drawIcon(128)],
    ['ic08', drawIcon(256)],
    ['ic09', drawIcon(512)],
    ['ic10', icon1024]
  ];

  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), icon1024);
  writeIco(icon256, path.join(BUILD_DIR, 'icon.ico'));
  buildIconset();
  writeIcns(icnsChunks, path.join(BUILD_DIR, 'icon.icns'));
}

main();
