/**
 * Pure-JS barcode encoding utilities for mobile SVG rendering.
 *
 * Provides two helpers:
 *   encodeCode128(value) → binary string of bar/space widths ('1' = bar, '0' = space)
 *   encodeQR(value)      → 2-D boolean matrix (true = dark module)
 *
 * Used by the BarcodeDisplay component in the mobile UI.
 * No native modules — works offline.
 *
 * CODE128 implementation:
 *   - Auto-selects Code Set B (printable ASCII 32-127)
 *   - Adds start symbol, checksum, stop symbol
 *   - Returns a string of '1'/'0' representing bar/space modules
 */

// ── CODE128 ───────────────────────────────────────────────────────────────────

/** Code 128 Code Set B encoding table (values 0-106) mapped to bar/space patterns */
const C128B_PATTERNS: string[] = [
  '11011001100','11001101100','11001100110','10010011000','10010001100',
  '10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110',
  '10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100',
  '11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000',
  '10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110',
  '10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000',
  '11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100',
  '10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010',
  '11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100',
  '10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110',
  '10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000',
  '11010011100','1100011101011',// stop pattern
];

// Code Set B value for ASCII char (space=0, '!'=1, ..., DEL=95)
function charToC128B(ch: string): number {
  const code = ch.charCodeAt(0);
  if (code < 32 || code > 127) throw new Error(`CODE128B: unsupported char ${ch}`);
  return code - 32;
}

/**
 * Encodes a string as CODE128 Code Set B.
 * Returns a binary string: '1' = bar, '0' = space.
 * Each module is 1 unit wide (scale up in SVG as needed).
 *
 * @param value - String to encode (printable ASCII only)
 * @returns Binary bar/space string
 */
export function encodeCode128(value: string): string {
  if (!value) return '';

  // Code Set B start symbol is value 104
  const START_B = 104;
  const STOP    = 106;

  let checksum = START_B;
  const parts: number[] = [START_B];

  for (let i = 0; i < value.length; i++) {
    const v = charToC128B(value[i]);
    checksum += (i + 1) * v;
    parts.push(v);
  }
  parts.push(checksum % 103);
  parts.push(STOP);

  return parts.map((p) => C128B_PATTERNS[p]).join('') + '11';
}

// ── QR Code ───────────────────────────────────────────────────────────────────

/**
 * Generate QR code matrix using the `qrcode` npm package.
 * Returns a 2D boolean array: true = dark module.
 *
 * Because `qrcode` is async, this returns a Promise.
 *
 * @param value - String to encode
 * @returns 2D boolean matrix
 */
export async function generateQrMatrix(value: string): Promise<boolean[][]> {
  // Dynamic import so bundle only loaded when needed
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QRCode = require('qrcode') as {
    create: (text: string, opts: object) => { modules: { data: Uint8ClampedArray; size: number } };
  };
  const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
  const { data, size } = qr.modules;
  const matrix: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    matrix.push(Array.from({ length: size }, (_, c) => data[r * size + c] === 1));
  }
  return matrix;
}
