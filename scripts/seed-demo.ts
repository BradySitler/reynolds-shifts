/**
 * Fills a local database with a demo course, people and two weeks of shifts.
 * Usage: npm run seed:demo   (never run against the real database)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db, schema } = await import("../src/db");
  const { addDays, today, weekStart } = await import("../src/lib/dates");
  const { courses, departments, users, shifts } = schema;

  const [course] = await db.insert(courses).values({ name: "Demo Course" }).returning();
  const [carts, starters] = await db
    .insert(departments)
    .values([{ courseId: course.id, name: "Cart Attendants" }, { courseId: course.id, name: "Starters" }])
    .returning();

  const mk = (name: string, role: typeof users.$inferInsert.role, departmentId: number | null, phone?: string) => ({
    name,
    email: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@example.com",
    role,
    courseId: course.id,
    departmentId,
    phone: phone ?? null,
  });
  const people = await db
    .insert(users)
    .values([
      mk("Admin User", "admin", null),
      mk("Hannah Head", "head_pro", null, "706-555-0100"),
      mk("Carter Assistant", "assistant_pro", carts.id, "706-555-0101"),
      mk("Stella Assistant", "assistant_pro", starters.id, "706-555-0102"),
      ...["Avery Lane", "Blake Moore", "Casey Reed", "Drew Park", "Emery Fox", "Finley Shaw", "Gray Cole", "Harper Wynn"].map((n, i) =>
        mk(n, "employee", carts.id, `706-555-01${10 + i}`),
      ),
      ...["Jordan Bell", "Kai Burke", "Logan Hart", "Morgan Pike", "Noel Ross", "Oakley Tate"].map((n, i) =>
        mk(n, "employee", starters.id, `706-555-01${30 + i}`),
      ),
    ])
    .returning();

  await db.update(departments).set({ approverId: people.find((p) => p.name === "Carter Assistant")!.id }).where(eq(departments.id, carts.id));
  await db.update(departments).set({ approverId: people.find((p) => p.name === "Stella Assistant")!.id }).where(eq(departments.id, starters.id));

  const start = weekStart(today());
  const rows: (typeof shifts.$inferInsert)[] = [];
  const staff = people.filter((p) => p.role === "employee");
  for (let d = 0; d < 14; d++) {
    const date = addDays(start, d);
    staff.forEach((p, i) => {
      if ((i + d) % 3 === 0) return; // everyone gets some days off
      const early = (i + d) % 2 === 0;
      rows.push({ userId: p.id, departmentId: p.departmentId!, date, startTime: early ? "06:30" : "11:00", endTime: early ? "14:30" : "19:00" });
    });
  }
  await db.insert(shifts).values(rows);
  console.log(`Seeded ${people.length} people and ${rows.length} shifts. Sign in as admin.user@example.com, carter.assistant@example.com or avery.lane@example.com.`);
  process.exit(0);
}
import { eq } from "drizzle-orm";
main();
