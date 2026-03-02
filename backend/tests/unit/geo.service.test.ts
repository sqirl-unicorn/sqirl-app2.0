/**
 * Unit tests for geoService — country detection and validation.
 * No DB required.
 */

import { detectCountry, isValidCountry, getCountryName, getAllCountries } from '../../src/services/geoService';
import type { IncomingMessage } from 'http';

function mockReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe('detectCountry', () => {
  it('reads CF-IPCountry header (Cloudflare)', () => {
    expect(detectCountry(mockReq({ 'cf-ipcountry': 'US' }))).toBe('US');
  });

  it('reads X-Country header', () => {
    expect(detectCountry(mockReq({ 'x-country': 'GB' }))).toBe('GB');
  });

  it('uppercases the detected value', () => {
    expect(detectCountry(mockReq({ 'cf-ipcountry': 'au' }))).toBe('AU');
  });

  it('returns null when no country header present', () => {
    expect(detectCountry(mockReq())).toBeNull();
  });

  it('returns null for unknown CF sentinel value "XX"', () => {
    expect(detectCountry(mockReq({ 'cf-ipcountry': 'XX' }))).toBeNull();
  });

  it('returns null for T1 (Tor exit node sentinel)', () => {
    expect(detectCountry(mockReq({ 'cf-ipcountry': 'T1' }))).toBeNull();
  });
});

describe('isValidCountry', () => {
  it('accepts valid ISO alpha-2 codes', () => {
    expect(isValidCountry('AU')).toBe(true);
    expect(isValidCountry('US')).toBe(true);
    expect(isValidCountry('GB')).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(isValidCountry('XX')).toBe(false);
    expect(isValidCountry('ZZ')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isValidCountry('au')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidCountry('')).toBe(false);
  });
});

describe('getCountryName', () => {
  it('returns English name for known code', () => {
    expect(getCountryName('AU')).toBe('Australia');
    expect(getCountryName('US')).toBe('United States');
  });

  it('returns null for unknown code', () => {
    expect(getCountryName('ZZ')).toBeNull();
  });
});

describe('getAllCountries', () => {
  it('returns a non-empty array of {code, name} entries', () => {
    const countries = getAllCountries();
    expect(countries.length).toBeGreaterThan(10);
    expect(countries[0]).toMatchObject({ code: expect.any(String), name: expect.any(String) });
  });

  it('is sorted alphabetically by name', () => {
    const countries = getAllCountries();
    for (let i = 1; i < countries.length; i++) {
      expect(countries[i].name >= countries[i - 1].name).toBe(true);
    }
  });
});
