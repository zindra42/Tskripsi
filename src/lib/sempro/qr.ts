import "server-only";

// Pure TypeScript QR Code generator (ISO/IEC 18004)
// Implements Byte mode, Error Correction Level M

const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], GF256_EXP[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, degree: number): Uint8Array {
  const gen = rsGeneratorPoly(degree);
  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    for (let j = 0; j < degree - 1; j++) {
      rem[j] = rem[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    rem[degree - 1] = gfMul(gen[degree], factor);
  }
  return rem;
}

// Version table for Error Correction Level M:
// [version, totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
interface VersionConfig {
  version: number;
  size: number;
  ecPerBlock: number;
  g1Blocks: number;
  g1Data: number;
  g2Blocks: number;
  g2Data: number;
  alignments: number[];
}

const VERSIONS: VersionConfig[] = [
  { version: 1, size: 21, ecPerBlock: 10, g1Blocks: 1, g1Data: 16, g2Blocks: 0, g2Data: 0, alignments: [] },
  { version: 2, size: 25, ecPerBlock: 16, g1Blocks: 1, g1Data: 28, g2Blocks: 0, g2Data: 0, alignments: [6, 18] },
  { version: 3, size: 29, ecPerBlock: 26, g1Blocks: 1, g1Data: 44, g2Blocks: 0, g2Data: 0, alignments: [6, 22] },
  { version: 4, size: 33, ecPerBlock: 18, g1Blocks: 2, g1Data: 32, g2Blocks: 0, g2Data: 0, alignments: [6, 26] },
  { version: 5, size: 37, ecPerBlock: 24, g1Blocks: 2, g1Data: 43, g2Blocks: 0, g2Data: 0, alignments: [6, 30] },
  { version: 6, size: 41, ecPerBlock: 16, g1Blocks: 4, g1Data: 27, g2Blocks: 0, g2Data: 0, alignments: [6, 34] },
  { version: 7, size: 45, ecPerBlock: 18, g1Blocks: 4, g1Data: 31, g2Blocks: 0, g2Data: 0, alignments: [6, 22, 38] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const textBytes = Buffer.from(text, "utf-8");
  const dataLen = textBytes.length;

  // Find minimum version that fits data in Byte Mode (Level M)
  let vConf: VersionConfig | null = null;
  for (const v of VERSIONS) {
    const totalData = v.g1Blocks * v.g1Data + v.g2Blocks * v.g2Data;
    // Header in byte mode: 4 bits mode + 8 bits char count = 12 bits -> 1.5 bytes + data
    if (dataLen + 2 <= totalData) {
      vConf = v;
      break;
    }
  }
  if (!vConf) {
    vConf = VERSIONS[VERSIONS.length - 1]; // Fallback to version 7
  }

  const totalDataBytes = vConf.g1Blocks * vConf.g1Data + vConf.g2Blocks * vConf.g2Data;

  // Build bitstream
  const bits: number[] = [];
  function pushBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >>> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator: 8 bits for versions 1-9
  pushBits(dataLen, 8);
  for (let i = 0; i < dataLen; i++) {
    pushBits(textBytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const remainingBits = totalDataBytes * 8 - bits.length;
  const termLength = Math.min(4, Math.max(0, remainingBits));
  pushBits(0, termLength);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Pad bytes 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < totalDataBytes * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to byte array
  const dataCodewords = new Uint8Array(totalDataBytes);
  for (let i = 0; i < totalDataBytes; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i * 8 + b];
    }
    dataCodewords[i] = byteVal;
  }

  // Error correction blocks
  const blocks: { data: Uint8Array; ec: Uint8Array }[] = [];
  let offset = 0;
  for (let i = 0; i < vConf.g1Blocks; i++) {
    const bData = dataCodewords.slice(offset, offset + vConf.g1Data);
    offset += vConf.g1Data;
    const bEc = rsComputeRemainder(bData, vConf.ecPerBlock);
    blocks.push({ data: bData, ec: bEc });
  }
  for (let i = 0; i < vConf.g2Blocks; i++) {
    const bData = dataCodewords.slice(offset, offset + vConf.g2Data);
    offset += vConf.g2Data;
    const bEc = rsComputeRemainder(bData, vConf.ecPerBlock);
    blocks.push({ data: bData, ec: bEc });
  }

  // Interleave data codewords
  const finalCodewords: number[] = [];
  const maxDataLen = Math.max(vConf.g1Data, vConf.g2Data || 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const b of blocks) {
      if (i < b.data.length) finalCodewords.push(b.data[i]);
    }
  }
  // Interleave error correction codewords
  for (let i = 0; i < vConf.ecPerBlock; i++) {
    for (const b of blocks) {
      finalCodewords.push(b.ec[i]);
    }
  }

  // Matrix creation
  const size = vConf.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setModule(r: number, c: number, val: boolean) {
    matrix[r][c] = val;
    isFunction[r][c] = true;
  }

  // 1. Finder patterns
  function addFinder(top: number, left: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        const isBlack =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        setModule(row, col, isBlack);
      }
    }
  }
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // 2. Alignment patterns
  if (vConf.alignments.length > 0) {
    for (const r of vConf.alignments) {
      for (const c of vConf.alignments) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
            setModule(r + dr, c + dc, isBlack);
          }
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // 4. Dark module
  setModule(size - 8, 8, true);

  // 5. Reserve format info areas
  function markReserved(r: number, c: number) {
    const row = isFunction[r];
    if (row && c >= 0 && c < size) {
      row[c] = true;
    }
  }

  for (let i = 0; i < 9; i++) {
    markReserved(8, i);
    markReserved(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    markReserved(8, size - 1 - i);
    markReserved(size - 1 - i, 8);
  }

  // 6. Place data bits
  const finalBits: number[] = [];
  for (const byte of finalCodewords) {
    for (let b = 7; b >= 0; b--) {
      finalBits.push((byte >>> b) & 1);
    }
  }

  let bitIdx = 0;
  let up = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    for (let vert = 0; vert < size; vert++) {
      const r = up ? size - 1 - vert : vert;
      for (let c = right; c >= right - 1; c--) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Apply Mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1;
        }
      }
    }
    up = !up;
  }

  // 7. Write Format Information (Error Correction Level M = 00, Mask 0 = 000 -> 00000)
  // Mask 0 + EC M with BCH(15, 5) and XOR mask 101010000010010 -> 101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[size - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i] === 1;

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

export function generateQrSvg(text: string, moduleSize = 4): string {
  const matrix = generateQrMatrix(text);
  const size = matrix.length;
  const padding = 2;
  const totalSize = (size + padding * 2) * moduleSize;

  let pathData = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = (c + padding) * moduleSize;
        const y = (r + padding) * moduleSize;
        pathData += `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}"><rect width="100%" height="100%" fill="#ffffff"/><path d="${pathData}" fill="#000000"/></svg>`;
}
