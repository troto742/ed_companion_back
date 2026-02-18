import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";

export interface ApiKeyAuthContext {
  apiKey: string;
  tenantLabel: string | null;
  keyFingerprint: string;
  source: "db" | "env" | "any";
}

export interface ApiKeySeedInput {
  apiKey: string;
  label: string | null;
}

export interface CreatedApiKey {
  id: number;
  label: string;
  keyPrefix: string;
  keyFingerprint: string;
  createdAt: string;
  apiKey: string;
}

export interface StoredApiKey {
  id: number;
  label: string;
  keyPrefix: string;
  keyFingerprint: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface ApiKeyRow {
  id: number | string;
  label: string;
  key_prefix: string;
  key_hash: string;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const normalizeApiKey = (apiKey: string): string => apiKey.trim();
const normalizeLabel = (label: string | null | undefined): string | null => {
  if (typeof label !== "string") {
    return null;
  }

  const normalized = label.trim();
  return normalized.length > 0 ? normalized : null;
};

const toRowModel = (row: ApiKeyRow): StoredApiKey => ({
  id: Number(row.id),
  label: row.label,
  keyPrefix: row.key_prefix,
  keyFingerprint: row.key_hash.slice(0, 12),
  isActive: row.is_active,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at
});

export class ApiKeyStore {
  private readonly cache = new Map<string, { context: ApiKeyAuthContext; expiresAt: number }>();

  constructor(
    private readonly pool: Pool,
    private readonly pepper: string,
    private readonly cacheTtlMs: number = 10_000
  ) {}

  async authenticate(apiKeyInput: string): Promise<ApiKeyAuthContext | null> {
    const apiKey = normalizeApiKey(apiKeyInput);
    if (!apiKey) {
      return null;
    }

    const cached = this.cache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.context;
    }

    const keyPrefix = this.getKeyPrefix(apiKey);
    const keyHash = this.hashApiKey(apiKey);
    const result = await this.pool.query<ApiKeyRow>(
      `
        UPDATE api_keys
           SET last_used_at = CASE
             WHEN last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '30 seconds'
               THEN NOW()
             ELSE last_used_at
           END
         WHERE key_prefix = $1
           AND key_hash = $2
           AND is_active = TRUE
           AND revoked_at IS NULL
        RETURNING id, label, key_prefix, key_hash, is_active, created_at, last_used_at, revoked_at
      `,
      [keyPrefix, keyHash]
    );

    const row = result.rows[0];
    if (!row) {
      this.cache.delete(apiKey);
      return null;
    }

    const context: ApiKeyAuthContext = {
      apiKey,
      tenantLabel: normalizeLabel(row.label),
      keyFingerprint: row.key_hash.slice(0, 12),
      source: "db"
    };

    this.cache.set(apiKey, { context, expiresAt: Date.now() + this.cacheTtlMs });
    return context;
  }

  async createKey(labelInput: string, apiKeyInput?: string): Promise<CreatedApiKey> {
    const label = normalizeLabel(labelInput);
    if (!label) {
      throw new Error("Label is required.");
    }

    const apiKey = normalizeApiKey(apiKeyInput ?? randomBytes(32).toString("base64url"));
    if (!apiKey) {
      throw new Error("API key is required.");
    }

    const keyPrefix = this.getKeyPrefix(apiKey);
    const keyHash = this.hashApiKey(apiKey);
    const result = await this.pool.query<ApiKeyRow>(
      `
        INSERT INTO api_keys (key_prefix, key_hash, label, is_active)
        VALUES ($1, $2, $3, TRUE)
        RETURNING id, label, key_prefix, key_hash, is_active, created_at, last_used_at, revoked_at
      `,
      [keyPrefix, keyHash, label]
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Unable to create API key.");
    }

    return {
      id: Number(row.id),
      label: row.label,
      keyPrefix: row.key_prefix,
      keyFingerprint: row.key_hash.slice(0, 12),
      createdAt: row.created_at,
      apiKey
    };
  }

  async listKeys(): Promise<StoredApiKey[]> {
    const result = await this.pool.query<ApiKeyRow>(
      `
        SELECT id, label, key_prefix, key_hash, is_active, created_at, last_used_at, revoked_at
          FROM api_keys
         ORDER BY id ASC
      `
    );

    return result.rows.map((row) => toRowModel(row));
  }

  async revokeKey(id: number): Promise<boolean> {
    const result = await this.pool.query<ApiKeyRow>(
      `
        UPDATE api_keys
           SET is_active = FALSE,
               revoked_at = COALESCE(revoked_at, NOW())
         WHERE id = $1
           AND is_active = TRUE
        RETURNING id, label, key_prefix, key_hash, is_active, created_at, last_used_at, revoked_at
      `,
      [id]
    );

    const revoked = result.rowCount !== null && result.rowCount > 0;
    if (revoked) {
      this.cache.clear();
    }

    return revoked;
  }

  async seedKeys(keys: ApiKeySeedInput[]): Promise<number> {
    let inserted = 0;

    for (const entry of keys) {
      const apiKey = normalizeApiKey(entry.apiKey);
      if (!apiKey) {
        continue;
      }

      const label = normalizeLabel(entry.label) ?? `key_${this.hashApiKey(apiKey).slice(0, 6)}`;
      const keyPrefix = this.getKeyPrefix(apiKey);
      const keyHash = this.hashApiKey(apiKey);

      const result = await this.pool.query(
        `
          INSERT INTO api_keys (key_prefix, key_hash, label, is_active)
          VALUES ($1, $2, $3, TRUE)
          ON CONFLICT (key_hash) DO NOTHING
        `,
        [keyPrefix, keyHash, label]
      );

      if (result.rowCount && result.rowCount > 0) {
        inserted += 1;
      }
    }

    return inserted;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private getKeyPrefix(apiKey: string): string {
    return apiKey.slice(0, 8);
  }

  private hashApiKey(apiKey: string): string {
    return createHash("sha256").update(`${this.pepper}:${apiKey}`).digest("hex");
  }
}

export const createApiKeyStore = (
  databaseUrl: string,
  databaseSsl: boolean,
  pepper: string
): ApiKeyStore => {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: false } : undefined
  });

  return new ApiKeyStore(pool, pepper);
};
