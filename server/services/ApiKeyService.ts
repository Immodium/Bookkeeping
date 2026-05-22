// API Key Service for Slimbooks
// Manages creation, verification, listing, and revocation of API keys

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { databaseService } from '../core/DatabaseService.js';

export interface ApiKeyRecord {
  id: number;
  tenant_id: number;
  user_id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface CreateApiKeyResult {
  record: ApiKeyRecord;
  rawKey: string; // ONLY returned on creation, never again
}

interface ApiKeyRow {
  id: number;
  tenant_id: number;
  user_id: number;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function parseScopes(scopesJson: string): string[] {
  try {
    const parsed = JSON.parse(scopesJson);
    return Array.isArray(parsed) ? parsed : ['read', 'write'];
  } catch {
    return ['read', 'write'];
  }
}

function rowToRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: parseScopes(row.scopes),
    last_used_at: row.last_used_at ?? undefined,
    expires_at: row.expires_at ?? undefined,
    created_at: row.created_at
  };
}

class ApiKeyService {
  /**
   * Generate a new API key, hash it, and store.
   * Key format: sk_live_{24 bytes base64url}
   * key_prefix = first 12 characters of the full key
   */
  async createKey(
    tenantId: number,
    userId: number,
    name: string,
    scopes?: string[],
    expiresAt?: string
  ): Promise<CreateApiKeyResult> {
    const rawKey = 'sk_live_' + crypto.randomBytes(24).toString('base64url');
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = await bcrypt.hash(rawKey, 10);
    const scopesJson = JSON.stringify(scopes || ['read', 'write']);
    const now = new Date().toISOString();

    await databaseService.executeQuery(
      `INSERT INTO api_keys (tenant_id, user_id, name, key_hash, key_prefix, scopes, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, userId, name, keyHash, keyPrefix, scopesJson, expiresAt || null, now, now]
    );

    const row = await databaseService.getOne<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE key_hash = ?',
      [keyHash]
    );

    if (!row) {
      throw new Error('Failed to retrieve created API key');
    }

    return {
      record: rowToRecord(row),
      rawKey
    };
  }

  /**
   * Verify a raw key. Look up by key_prefix (first 12 chars), then bcrypt compare.
   * Updates last_used_at on success. Returns null if invalid/expired.
   */
  async verifyKey(rawKey: string): Promise<{ tenantId: number; userId: number; scopes: string[] } | null> {
    if (!rawKey || typeof rawKey !== 'string') {
      return null;
    }

    const keyPrefix = rawKey.substring(0, 12);

    const rows = await databaseService.getMany<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE key_prefix = ?',
      [keyPrefix]
    );

    if (rows.length === 0) {
      return null;
    }

    for (const row of rows) {
      const isMatch = await bcrypt.compare(rawKey, row.key_hash);
      if (!isMatch) {
        continue;
      }

      // Check expiry
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return null;
      }

      // Update last_used_at (fire-and-forget)
      databaseService.executeQuery(
        "UPDATE api_keys SET last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [row.id]
      ).catch(() => {});

      return {
        tenantId: row.tenant_id,
        userId: row.user_id,
        scopes: parseScopes(row.scopes)
      };
    }

    return null;
  }

  /**
   * List all API keys for a tenant+user (no hashes returned).
   */
  async listKeys(tenantId: number, userId: number): Promise<ApiKeyRecord[]> {
    const rows = await databaseService.getMany<ApiKeyRow>(
      'SELECT * FROM api_keys WHERE tenant_id = ? AND user_id = ? ORDER BY created_at DESC',
      [tenantId, userId]
    );
    return rows.map(rowToRecord);
  }

  /**
   * Revoke an API key (scoped to tenant for safety).
   */
  async revokeKey(id: number, tenantId: number): Promise<boolean> {
    const result = await databaseService.executeQuery(
      'DELETE FROM api_keys WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    return result.changes > 0;
  }
}

export const apiKeyService = new ApiKeyService();
