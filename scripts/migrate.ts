/**
 * Brings the database schema up to date. Runs before every Vercel build.
 * Skips (without failing the build) when no database is connected yet.
 */
import { config } from "dotenv";
import { execSync } from "node:child_process";
config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL isn't set, so database migrations were skipped. Connect a database and redeploy.");
  process.exit(0);
}
execSync("npx drizzle-kit migrate", { stdio: "inherit" });
