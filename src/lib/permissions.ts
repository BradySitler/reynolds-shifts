import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";

type Dept = { id: number; courseId: number; approverId: number | null };

/**
 * Who can approve a request for a department:
 * - the assistant pro set as that department's approver
 * - any head pro at the same course
 * - admins
 */
export function canApprove(user: User, dept: Dept | null | undefined): boolean {
  if (!dept) return user.role === "admin";
  if (user.role === "admin") return true;
  if (user.role === "head_pro" && user.courseId === dept.courseId) return true;
  return dept.approverId === user.id;
}

/** Department ids this user can approve for. "all" for admins. */
export async function approvableDepartmentIds(user: User): Promise<number[] | "all"> {
  if (user.role === "admin") return "all";
  if (user.role === "employee") return [];
  const rows = await db
    .select({ id: schema.departments.id, courseId: schema.departments.courseId, approverId: schema.departments.approverId })
    .from(schema.departments);
  return rows.filter((d) => canApprove(user, d)).map((d) => d.id);
}

/** Can this user manage employees, departments and schedules for a course? */
export function canManageCourse(user: User, courseId: number | null): boolean {
  if (user.role === "admin") return true;
  return user.role === "head_pro" && courseId != null && user.courseId === courseId;
}

/**
 * Who gets emailed about a request in this department: its assistant pro.
 * If none is set (or they're inactive), the course's head pros, then admins.
 */
export async function approverEmails(departmentId: number | null): Promise<string[]> {
  if (departmentId != null) {
    const dept = await db.query.departments.findFirst({ where: eq(schema.departments.id, departmentId) });
    if (dept?.approverId) {
      const a = await db.query.users.findFirst({ where: eq(schema.users.id, dept.approverId) });
      if (a?.active) return [a.email];
    }
    if (dept) {
      const heads = await db
        .select({ email: schema.users.email })
        .from(schema.users)
        .where(and(eq(schema.users.courseId, dept.courseId), eq(schema.users.role, "head_pro"), eq(schema.users.active, true)));
      if (heads.length) return heads.map((h) => h.email);
    }
  }
  const admins = await db
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(and(inArray(schema.users.role, ["admin"]), eq(schema.users.active, true)));
  return admins.map((a) => a.email);
}
