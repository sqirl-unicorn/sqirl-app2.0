/**
 * Client-side zero-knowledge crypto service.
 *
 * All encryption/decryption happens in the browser — the server sees only
 * encrypted blobs. Master key stays in memory only (never persisted).
 *
 * Uses TweetNaCl:
 *   - secretbox (symmetric) for data encryption
 *   - box (asymmetric) for sharing keys between users
 *
 * Recovery model:
 *   - Generate 5 independent recovery keys
 *   - Each slot = encrypt(masterKey, recoveryKey[i])
 *   - Any one key can independently recover the account
 */

import * as nacl from 'tweetnacl';

// ── Codec helpers ─────────────────────────────────────────────────────────────

function encodeBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr));
}

function decodeBase64(str: string): Uint8Array {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

function encodeUTF8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function decodeUTF8(arr: Uint8Array): string {
  return new TextDecoder().decode(arr);
}

// ── Low-level primitives ──────────────────────────────────────────────────────

function deriveKey(password: string, salt: string): string {
  const hash = nacl.hash(encodeUTF8(password + salt));
  return encodeBase64(hash.slice(0, nacl.secretbox.keyLength));
}

function generateSalt(): string {
  return encodeBase64(nacl.randomBytes(16));
}

function encryptSymmetric(plaintext: string, key: string): string {
  const keyBytes = decodeBase64(key);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = encodeUTF8(plaintext);
  const cipher = nacl.secretbox(msg, nonce, keyBytes);
  const combined = new Uint8Array(nonce.length + cipher.length);
  combined.set(nonce);
  combined.set(cipher, nonce.length);
  return encodeBase64(combined);
}

function decryptSymmetric(blob: string, key: string): string | null {
  try {
    const keyBytes = decodeBase64(key);
    const combined = decodeBase64(blob);
    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const cipher = combined.slice(nacl.secretbox.nonceLength);
    const plain = nacl.secretbox.open(cipher, nonce, keyBytes);
    return plain ? decodeUTF8(plain) : null;
  } catch {
    return null;
  }
}

// ── CryptoService ─────────────────────────────────────────────────────────────

export interface GeneratedKeys {
  publicKey: string;
  encryptedPrivateKey: string;
  salt: string;
  masterKey: string; // In-memory only — never persist
}

export interface RecoveryKeySet {
  /** 5 plain-text recovery keys — shown to user once, then discarded */
  keys: string[];
  /** 5 encrypted masterKey blobs — stored on server */
  slots: string[];
}

class CryptoService {
  /**
   * Generate all keys for a new user registration.
   * Returns masterKey for in-memory use only — never send to server.
   *
   * @param password - User's chosen password
   * @returns Public key, encrypted private key, salt, and in-memory masterKey
   */
  async generateUserKeys(password: string): Promise<GeneratedKeys> {
    const salt = generateSalt();
    const masterKey = deriveKey(password, salt);
    const keyPair = nacl.box.keyPair();
    const encryptedPrivateKey = encryptSymmetric(
      encodeBase64(keyPair.secretKey),
      masterKey
    );
    return {
      publicKey: encodeBase64(keyPair.publicKey),
      encryptedPrivateKey,
      salt,
      masterKey,
    };
  }

  /**
   * Unlock the user's private key on login.
   * Throws if the password is wrong (decryption produces null).
   *
   * @param password            - User's password
   * @param encryptedPrivateKey - From server
   * @param salt                - From server
   * @returns Decrypted private key (base64) and derived masterKey
   */
  async unlockPrivateKey(
    password: string,
    encryptedPrivateKey: string,
    salt: string
  ): Promise<{ privateKey: string; masterKey: string }> {
    const masterKey = deriveKey(password, salt);
    const privateKey = decryptSymmetric(encryptedPrivateKey, masterKey);
    if (!privateKey) throw new Error('SQIRL-AUTH-CRYPTO-001: Invalid password');
    return { privateKey, masterKey };
  }

  /**
   * Generate 5 independent recovery keys and their corresponding
   * server-storage slots (each slot = encrypt(masterKey, recoveryKey[i])).
   *
   * Any one key can independently recover the account.
   *
   * @param masterKey - In-memory master key from generateUserKeys / unlockPrivateKey
   * @returns { keys: string[], slots: string[] } — keys shown to user, slots sent to server
   */
  generateRecoveryKeys(masterKey: string): RecoveryKeySet {
    const keys: string[] = [];
    const slots: string[] = [];
    for (let i = 0; i < 5; i++) {
      const rawKey = encodeBase64(nacl.randomBytes(32));
      keys.push(rawKey);
      slots.push(encryptSymmetric(masterKey, rawKey));
    }
    return { keys, slots };
  }

  /**
   * Format a raw base64 recovery key for human-readable display.
   * Output: 8 groups of 5 uppercase alphanumeric chars separated by dashes.
   * e.g. "ABCDE-FGHIJ-KLMNO-PQRST-UVWXY-Z1234-56789-ABCDE"
   *
   * @param rawKey - Base64-encoded recovery key
   * @returns Display-formatted string
   */
  formatRecoveryKey(rawKey: string): string {
    const clean = rawKey.replace(/[+/=]/g, (c) =>
      c === '+' ? 'X' : c === '/' ? 'Y' : ''
    );
    const groups = clean.match(/.{1,5}/g) ?? [];
    return groups.slice(0, 8).join('-').toUpperCase();
  }

  /**
   * Recover the masterKey from a single recovery key and the user's stored slot.
   *
   * @param recoveryKey - One of the 5 keys the user kept
   * @param slot        - The corresponding encrypted slot from the server
   * @returns Recovered masterKey, or null if the key is wrong
   */
  recoverMasterKey(recoveryKey: string, slot: string): string | null {
    return decryptSymmetric(slot, recoveryKey);
  }

  /** Generic symmetric encrypt — for user data blobs */
  encrypt(data: string, key: string): string {
    return encryptSymmetric(data, key);
  }

  /** Generic symmetric decrypt — for user data blobs */
  decrypt(blob: string, key: string): string | null {
    return decryptSymmetric(blob, key);
  }
}

export const cryptoService = new CryptoService();
