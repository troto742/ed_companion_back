import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { settings } from "../config";

const ensureMigrationTable = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const run = async (): Promise<void> => {
  if (!settings.databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations.");
  }

  const pool = new Pool({
    connectionString: settings.databaseUrl,
    ssl: settings.databaseSsl ? { rejectUnauthorized: false } : undefined
  });

  try {
    await ensureMigrationTable(pool);

    const migrationsDir = join(__dirname, "../../sql/migrations");
    const entries = await readdir(migrationsDir);
    const files = entries
      .filter((entry) => entry.endsWith(".sql"))
      .sort((left, right) => left.localeCompare(right));

    for (const fileName of files) {
      const migrationVersion = fileName.replace(/\.sql$/i, "");
      const alreadyRan = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE version = $1",
        [migrationVersion]
      );

      if (alreadyRan.rowCount && alreadyRan.rowCount > 0) {
        continue;
      }

      const fullPath = join(migrationsDir, fileName);
      const sql = await readFile(fullPath, "utf8");

      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(
          "INSERT INTO schema_migrations (version) VALUES ($1)",
          [migrationVersion]
        );
        await pool.query("COMMIT");
        console.log(`Applied migration: ${migrationVersion}`);
      } catch (error) {
        await pool.query("ROLLBACK");
        throw error;
      }
    }

    console.log("Migrations are up to date.");
  } finally {
    await pool.end();
  }
};

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown migration error";
  console.error(`Migration failed: ${message}`);
  process.exit(1);
});
