import { createHash } from "node:crypto";
import { TenantMode } from "../config";
import { PersistenceStore } from "../db/postgresPersistence";
import { StateStore } from "./stateStore";

export interface TenantRuntime {
  tenantId: string;
  tenantLabel: string;
  keyFingerprint: string;
  commanderName: string;
  store: StateStore;
}

interface RuntimeRegistryOptions {
  persistence: PersistenceStore | null;
  commanderName: string;
  tenantMode: TenantMode;
  resolveTenantLabel: (apiKey: string) => string | null;
}

interface TenantIdentity {
  tenantId: string;
  tenantLabel: string;
  keyFingerprint: string;
  commanderName: string;
}

const normalizeLabel = (rawLabel: string | null): string | null => {
  if (!rawLabel) {
    return null;
  }

  const normalized = rawLabel.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveTenantIdentity = (
  apiKey: string,
  tenantMode: TenantMode,
  baseCommanderName: string,
  rawLabel: string | null,
  externalFingerprint: string | null
): TenantIdentity => {
  if (tenantMode === "single") {
    return {
      tenantId: "single",
      tenantLabel: normalizeLabel(rawLabel) ?? "single",
      keyFingerprint: "single",
      commanderName: baseCommanderName
    };
  }

  const hash = createHash("sha256").update(apiKey).digest("hex");
  const hashShort = hash.slice(0, 12);
  const resolvedLabel = normalizeLabel(rawLabel) ?? `key_${hash.slice(0, 6)}`;
  const keyFingerprint = normalizeLabel(externalFingerprint) ?? hashShort;

  return {
    tenantId: `tenant_${hashShort}`,
    tenantLabel: resolvedLabel,
    keyFingerprint,
    commanderName: `${baseCommanderName}_${hash.slice(0, 16)}`
  };
};

export class RuntimeRegistry {
  private runtimes: Map<string, Promise<TenantRuntime>> = new Map();

  constructor(private readonly options: RuntimeRegistryOptions) {}

  async getRuntime(
    apiKey: string,
    tenantLabel: string | null = null,
    keyFingerprint: string | null = null
  ): Promise<TenantRuntime> {
    const identity = resolveTenantIdentity(
      apiKey,
      this.options.tenantMode,
      this.options.commanderName,
      tenantLabel ?? this.options.resolveTenantLabel(apiKey),
      keyFingerprint
    );

    const existing = this.runtimes.get(identity.tenantId);
    if (existing) {
      const runtime = await existing;
      if (identity.tenantLabel && runtime.tenantLabel !== identity.tenantLabel) {
        runtime.tenantLabel = identity.tenantLabel;
      }

      if (identity.keyFingerprint && runtime.keyFingerprint !== identity.keyFingerprint) {
        runtime.keyFingerprint = identity.keyFingerprint;
      }

      return runtime;
    }

    const runtimePromise = this.createRuntime(identity);
    this.runtimes.set(identity.tenantId, runtimePromise);

    try {
      return await runtimePromise;
    } catch (error) {
      this.runtimes.delete(identity.tenantId);
      throw error;
    }
  }

  private async createRuntime(identity: TenantIdentity): Promise<TenantRuntime> {
    const runtime: TenantRuntime = {
      tenantId: identity.tenantId,
      tenantLabel: identity.tenantLabel,
      keyFingerprint: identity.keyFingerprint,
      commanderName: identity.commanderName,
      store: new StateStore()
    };

    if (this.options.persistence) {
      const snapshot = await this.options.persistence.loadSnapshot(runtime.commanderName);
      if (snapshot) {
        runtime.store.setSnapshot(snapshot);
      }
    }

    console.log(
      `Initialized tenant label='${runtime.tenantLabel}' fingerprint='${runtime.keyFingerprint}' commander='${runtime.commanderName}'`
    );

    return runtime;
  }
}
