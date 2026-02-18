import { createHash } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { JournalPayload, StatusPayload } from "../types/ingest";
import { RouteLeg, StateSnapshot } from "../types/state";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

const normalizeTimestamp = (rawTimestamp: string | null | undefined): string => {
  const parsed = Date.parse(rawTimestamp ?? "");
  return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
};

const getJournalEventHash = (payload: JournalPayload): string => {
  const rawEventType = payload.eventType.trim().toLowerCase();
  const normalizedTimestamp = normalizeTimestamp(payload.timestamp);
  const normalizedData = stableStringify(payload.data ?? {});
  return createHash("sha256")
    .update(`${normalizedTimestamp}|${rawEventType}|${normalizedData}`)
    .digest("hex");
};

const parseJsonColumn = <T>(value: unknown): T | null => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  if (typeof value === "object") {
    return value as T;
  }

  return null;
};

const getSnapshotUpdatedAt = (snapshot: StateSnapshot): string => {
  return normalizeTimestamp(
    snapshot.route.updatedAt
      ?? snapshot.location.updatedAt
      ?? snapshot.ship.updatedAt
      ?? new Date().toISOString()
  );
};

export interface PersistenceStore {
  loadSnapshot(commanderName: string): Promise<StateSnapshot | null>;
  persistJournal(commanderName: string, payload: JournalPayload, snapshot: StateSnapshot): Promise<void>;
  persistJournalBatch(
    commanderName: string,
    events: JournalPayload[],
    snapshot: StateSnapshot
  ): Promise<void>;
  persistStatus(commanderName: string, payload: StatusPayload, snapshot: StateSnapshot): Promise<void>;
  persistRoute(
    commanderName: string,
    routeName: string,
    legs: RouteLeg[],
    snapshot: StateSnapshot
  ): Promise<void>;
  close(): Promise<void>;
}

export class PostgresPersistence implements PersistenceStore {
  private commanderIdsByName: Map<string, number> = new Map();

  constructor(private readonly pool: Pool) {}

  async loadSnapshot(commanderName: string): Promise<StateSnapshot | null> {
    const commanderId = await this.ensureCommanderId(this.pool, commanderName);
    const result = await this.pool.query(
      "SELECT ship, location, route FROM current_state WHERE commander_id = $1",
      [commanderId]
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const ship = parseJsonColumn<StateSnapshot["ship"]>(row.ship);
    const location = parseJsonColumn<StateSnapshot["location"]>(row.location);
    const route = parseJsonColumn<StateSnapshot["route"]>(row.route);

    if (!ship || !location || !route) {
      return null;
    }

    return { ship, location, route };
  }

  async persistJournal(
    commanderName: string,
    payload: JournalPayload,
    snapshot: StateSnapshot
  ): Promise<void> {
    await this.persistJournalBatch(commanderName, [payload], snapshot);
  }

  async persistJournalBatch(
    commanderName: string,
    events: JournalPayload[],
    snapshot: StateSnapshot
  ): Promise<void> {
    await this.withTransaction(commanderName, async (client, commanderId) => {
      for (const event of events) {
        await client.query(
          `
            INSERT INTO journal_events (commander_id, event_ts, event_type, event_hash, payload)
            VALUES ($1, $2, $3, $4, $5::jsonb)
            ON CONFLICT (commander_id, event_hash) DO NOTHING
          `,
          [
            commanderId,
            normalizeTimestamp(event.timestamp),
            event.eventType.trim(),
            getJournalEventHash(event),
            JSON.stringify(event.data ?? {})
          ]
        );
      }

      await this.upsertCurrentState(client, commanderId, snapshot);
    });
  }

  async persistStatus(
    commanderName: string,
    payload: StatusPayload,
    snapshot: StateSnapshot
  ): Promise<void> {
    await this.withTransaction(commanderName, async (client, commanderId) => {
      await client.query(
        `
          INSERT INTO status_events (
            commander_id,
            status_ts,
            flags,
            fsd_charging,
            fuel_main,
            fuel_reserve,
            cargo,
            hull,
            shields,
            star_system,
            body_name,
            station_name,
            payload
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        `,
        [
          commanderId,
          normalizeTimestamp(payload.timestamp),
          payload.flags ?? null,
          payload.fsdCharging ?? null,
          payload.fuel?.main ?? null,
          payload.fuel?.reserve ?? null,
          payload.cargo ?? null,
          payload.hull ?? null,
          payload.shields ?? null,
          payload.starSystem ?? null,
          payload.bodyName ?? null,
          payload.stationName ?? null,
          JSON.stringify(payload)
        ]
      );

      await this.upsertCurrentState(client, commanderId, snapshot);
    });
  }

  async persistRoute(
    commanderName: string,
    routeName: string,
    legs: RouteLeg[],
    snapshot: StateSnapshot
  ): Promise<void> {
    await this.withTransaction(commanderName, async (client, commanderId) => {
      const routeResult = await client.query<{ id: number }>(
        `
          INSERT INTO routes (commander_id, name, loaded_at)
          VALUES ($1, $2, $3)
          RETURNING id
        `,
        [commanderId, routeName, normalizeTimestamp(snapshot.route.updatedAt)]
      );

      const routeId = routeResult.rows[0]?.id;
      if (!routeId) {
        throw new Error("Unable to persist route metadata.");
      }

      for (const [index, leg] of legs.entries()) {
        await client.query(
          `
            INSERT INTO route_legs (
              route_id,
              seq,
              system_name,
              distance,
              distance_remaining,
              fuel_left,
              fuel_used,
              refuel,
              neutron_star
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [
            routeId,
            index,
            leg.systemName,
            leg.distance,
            leg.distanceRemaining,
            leg.fuelLeft,
            leg.fuelUsed,
            leg.refuel,
            leg.neutronStar
          ]
        );
      }

      await this.upsertCurrentState(client, commanderId, snapshot);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async ensureCommanderId(queryable: Queryable, commanderName: string): Promise<number> {
    const cachedCommanderId = this.commanderIdsByName.get(commanderName);
    if (cachedCommanderId !== undefined) {
      return cachedCommanderId;
    }

    const result = await queryable.query<{ id: number }>(
      `
        INSERT INTO commanders (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `,
      [commanderName]
    );

    const commanderId = result.rows[0]?.id;
    if (!commanderId) {
      throw new Error("Unable to resolve commander id.");
    }

    this.commanderIdsByName.set(commanderName, commanderId);
    return commanderId;
  }

  private async upsertCurrentState(
    client: PoolClient,
    commanderId: number,
    snapshot: StateSnapshot
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO current_state (commander_id, ship, location, route, updated_at)
        VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
        ON CONFLICT (commander_id) DO UPDATE
          SET ship = EXCLUDED.ship,
              location = EXCLUDED.location,
              route = EXCLUDED.route,
              updated_at = EXCLUDED.updated_at
      `,
      [
        commanderId,
        JSON.stringify(snapshot.ship),
        JSON.stringify(snapshot.location),
        JSON.stringify(snapshot.route),
        getSnapshotUpdatedAt(snapshot)
      ]
    );
  }

  private async withTransaction<T>(
    commanderName: string,
    callback: (client: PoolClient, commanderId: number) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const commanderId = await this.ensureCommanderId(client, commanderName);
      const value = await callback(client, commanderId);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export const createPostgresPersistence = (
  databaseUrl: string,
  databaseSsl: boolean
): PostgresPersistence => {
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: false } : undefined
  });

  return new PostgresPersistence(pool);
};
