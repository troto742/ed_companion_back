import { config as loadEnv } from "dotenv";

loadEnv();

const DEFAULT_API_KEY = "dev-api-key";

const parseNumber = (rawValue: string | undefined, fallback: number): number => {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (rawValue: string | undefined, fallback: boolean): boolean => {
  if (rawValue === undefined) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseCommanderName = (rawValue: string | undefined): string => {
  const normalized = rawValue?.trim();
  return normalized && normalized.length > 0 ? normalized : "default";
};

const parseOptionalString = (rawValue: string | undefined): string | null => {
  const normalized = rawValue?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
};

const parseStringList = (rawValue: string | undefined): string[] => {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

const parseApiKeyLabels = (rawValue: string | undefined): Record<string, string> => {
  const labels: Record<string, string> = {};
  if (!rawValue) {
    return labels;
  }

  const entries = rawValue
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const entry of entries) {
    const separatorIndex = entry.indexOf("=");
    const fallbackSeparator = entry.indexOf(":");
    const resolvedSeparator = separatorIndex >= 0 ? separatorIndex : fallbackSeparator;
    if (resolvedSeparator <= 0) {
      continue;
    }

    const key = entry.slice(0, resolvedSeparator).trim();
    const label = entry.slice(resolvedSeparator + 1).trim();
    if (!key || !label) {
      continue;
    }

    labels[key] = label;
  }

  return labels;
};

export type TenantMode = "single" | "api_key";

const parseTenantMode = (rawValue: string | undefined): TenantMode => {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === "single" || normalized === "api_key") {
    return normalized;
  }

  return "api_key";
};

const apiKeyLabels = parseApiKeyLabels(process.env.API_KEY_LABELS);

const explicitApiKeys = (() => {
  const keys = new Set<string>();

  const fromApiKeys = parseStringList(process.env.API_KEYS);
  for (const key of fromApiKeys) {
    keys.add(key);
  }

  const fromLegacyApiKey = process.env.API_KEY?.trim();
  if (fromLegacyApiKey) {
    keys.add(fromLegacyApiKey);
  }

  for (const key of Object.keys(apiKeyLabels)) {
    keys.add(key);
  }

  return [...keys];
})();

const configuredApiKeys = explicitApiKeys.length > 0 ? explicitApiKeys : [DEFAULT_API_KEY];

export const settings = {
  port: parseNumber(process.env.PORT, 3000),
  apiKeys: configuredApiKeys,
  seedApiKeys: explicitApiKeys,
  apiKeyLabels,
  apiKeyPepper: process.env.API_KEY_PEPPER ?? "",
  bootstrapApiKeys: parseBoolean(process.env.BOOTSTRAP_API_KEYS, true),
  autoProvisionDefaultApiKey: parseBoolean(process.env.AUTO_PROVISION_DEFAULT_API_KEY, true),
  defaultApiKey: parseOptionalString(process.env.DEFAULT_API_KEY) ?? DEFAULT_API_KEY,
  adminApiKey: parseOptionalString(process.env.ADMIN_API_KEY),
  allowAnyApiKey: parseBoolean(process.env.ALLOW_ANY_API_KEY, false),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  ingestRateLimitWindowMs: parseNumber(process.env.INGEST_RATE_LIMIT_WINDOW_MS, 10_000),
  ingestRateLimitMax: parseNumber(process.env.INGEST_RATE_LIMIT_MAX, 200),
  databaseUrl: process.env.DATABASE_URL?.trim() || null,
  databaseSsl: parseBoolean(process.env.DATABASE_SSL, false),
  commanderName: parseCommanderName(process.env.COMMANDER_NAME),
  tenantMode: parseTenantMode(process.env.TENANT_MODE)
};
