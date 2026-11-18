/**
 * Creates (or promotes) the first admin so someone can sign in to a new site.
 * Usage: npm run create-admin -- you@example.com "Your Name"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email?.includes("@")) {
    console.error('Usage: npm run create-admin -- you@example.com "Your Name"');
    process.exit(1);
  }
  const { db, schema } = await import("../src/db");
  const name = nameParts.join(" ") || email.split("@")[0];
  await db
    .insert(schema.users)
    .values({ email: email.trim().toLowerCase(), name, role: "admin" })
    .onConflictDoUpdate({ target: schema.users.email, set: { role: "admin", active: true } });
  console.log(`${email} is an admin. Sign in at the site with that email.`);
  process.exit(0);
}
main();
