// Applies every .sql file in db/migrations/ in filename order.
// Run: npx tsx scripts/migrate.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
});

async function migrate() {
  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    process.stdout.write(`Applying ${file} ... `);
    await pool.query(readFileSync(join(dir, file), "utf8"));
    console.log("ok");
  }
  console.log(`Applied ${files.length} migration(s).`);
}

migrate()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
