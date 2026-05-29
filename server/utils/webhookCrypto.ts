/**
 * AES-256-GCM encryption helpers for webhook secrets stored at rest.
 *
 * Ciphertext format stored in the DB (single column, plaintext-compatible):
 *   enc:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 *
 * When WEBHOOK_ENCRYPTION_KEY is not set the helpers are no-ops, so existing
 * plaintext secrets continue to work until the key is configured.
 */

import crypto from 'crypto';
import { serverConfig } from '../config/index.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = 'enc:';

function getKey(): Buffer | null {
  const hex = serverConfig.webhookEncryptionKey;
  if (!hex) return null;
  if (hex.length !== 64) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptWebhookSecret(plaintext: string): string {
  const key = getKey();
  if (!key) return plaintext; // encryption not configured — store as-is

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv) as crypto.CipherGCM;
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptWebhookSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // plaintext (pre-encryption era)

  const key = getKey();
  if (!key) {
    throw new Error('WEBHOOK_ENCRYPTION_KEY is required to decrypt stored webhook secrets');
  }

  const [, ivHex, tagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !tagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted webhook secret');
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGO, key, iv) as crypto.DecipherGCM;
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}
