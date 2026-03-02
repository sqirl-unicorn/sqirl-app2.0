/**
 * Geo Service — country detection and validation.
 *
 * Detection priority:
 *   1. CF-IPCountry header (Cloudflare; most reliable in production)
 *   2. X-Country header (custom proxy header)
 *   3. null (caller falls back to 'AU' default)
 *
 * Sentinel values returned by Cloudflare that don't represent real countries
 * (e.g. "XX", "T1") are normalised to null.
 */

import type { IncomingMessage } from 'http';

/** Country entry for UI dropdowns */
export interface Country {
  code: string;
  name: string;
}

/**
 * ISO 3166-1 alpha-2 country list (common subset; extend as needed).
 * Sorted alphabetically by name.
 */
const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afghanistan' },
  { code: 'AL', name: 'Albania' },
  { code: 'DZ', name: 'Algeria' },
  { code: 'AR', name: 'Argentina' },
  { code: 'AU', name: 'Australia' },
  { code: 'AT', name: 'Austria' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'BE', name: 'Belgium' },
  { code: 'BR', name: 'Brazil' },
  { code: 'CA', name: 'Canada' },
  { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'DK', name: 'Denmark' },
  { code: 'EG', name: 'Egypt' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' },
  { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' },
  { code: 'IL', name: 'Israel' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
  { code: 'JO', name: 'Jordan' },
  { code: 'KE', name: 'Kenya' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'MX', name: 'Mexico' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'NO', name: 'Norway' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'KR', name: 'South Korea' },
  { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' },
  { code: 'SE', name: 'Sweden' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'TR', name: 'Turkey' },
  { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'VN', name: 'Vietnam' },
];

/** Set of valid codes for O(1) lookup */
const VALID_CODES = new Set(COUNTRIES.map((c) => c.code));

/** Cloudflare sentinel values that don't represent real countries */
const CF_SENTINELS = new Set(['XX', 'T1', '']);

/**
 * Detect country from request headers.
 * Returns a 2-letter ISO alpha-2 code or null if undetectable.
 *
 * @param req - Incoming HTTP request
 * @returns Uppercase country code or null
 */
export function detectCountry(req: IncomingMessage): string | null {
  const raw =
    (req.headers['cf-ipcountry'] as string | undefined) ??
    (req.headers['x-country'] as string | undefined) ??
    null;

  if (!raw) return null;

  const code = raw.trim().toUpperCase();
  if (CF_SENTINELS.has(code) || !VALID_CODES.has(code)) return null;

  return code;
}

/**
 * Validate an ISO alpha-2 country code.
 * Case-insensitive. Returns false for empty or unknown codes.
 *
 * @param code - Country code to validate
 */
export function isValidCountry(code: string): boolean {
  return VALID_CODES.has(code.toUpperCase());
}

/**
 * Get the English name for a country code.
 * @returns Country name string or null if unknown
 */
export function getCountryName(code: string): string | null {
  return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? null;
}

/**
 * Get all countries sorted alphabetically by name.
 * Used for UI dropdowns.
 */
export function getAllCountries(): Country[] {
  return [...COUNTRIES];
}
