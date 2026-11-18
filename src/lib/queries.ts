import "server-only";
import { aliasedTable, and, asc, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { User } from "@/db/schema";
import { approvableDepartmentIds } from "./permissions";
import { today } from "./dates";

const { users, shifts, departments, courses, timeOffRequests, swapRequests } = schema;

/** Where-clause limiting a department id column to what this user approves. */
async function deptFilter(user: User, column: typeof shifts.departmentId | typeof timeOffRequests.departmentId) {
  const ids = await approvableDepartmentIds(user);
  if (ids === "all") return sql`true`;
  if (ids.length === 0) return sql`false`;
  return inArray(column, ids);
}

export async function pendingApprovalCount(user: User): Promise<number> {
  if (user.role === "employee") return 0;
  const [t] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(timeOffRequests)
    .where(and(eq(timeOffRequests.status, "pending"), await deptFilter(user, timeOffRequests.departmentId)));
  const [s] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(swapRequests)
    .innerJoin(shifts, eq(shifts.id, swapRequests.shiftId))
    .where(and(eq(swapRequests.status, "awaiting_approval"), await deptFilter(user, shifts.departmentId)));
  return t.n + s.n;
}

export async function incomingSwapCount(userId: number): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(swapRequests)
    .where(and(eq(swapRequests.coworkerId, userId), eq(swapRequests.status, "awaiting_coworker")));
  return r.n;
}

export function upcomingShifts(userId: number, limit = 14) {
  return db
    .select({
      id: shifts.id,
      date: shifts.date,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      note: shifts.note,
      department: departments.name,
      course: courses.name,
    })
    .from(shifts)
    .innerJoin(departments, eq(departments.id, shifts.departmentId))
    .innerJoin(courses, eq(courses.id, departments.courseId))
    .where(and(eq(shifts.userId, userId), gte(shifts.date, today())))
    .orderBy(asc(shifts.date), asc(shifts.startTime))
    .limit(limit);
}

const requester = aliasedTable(users, "requester");
const coworker = aliasedTable(users, "coworker");
const coworkerShift = aliasedTable(shifts, "coworker_shift");

/** Swap requests with the people and shifts filled in. */
export type SwapRow = {
  id: number;
  status: "awaiting_coworker" | "awaiting_approval" | "approved" | "declined" | "denied" | "cancelled";
  message: string | null;
  decisionNote: string | null;
  createdAt: Date;
  requesterId: number;
  requesterName: string;
  coworkerId: number;
  coworkerName: string;
  shiftId: number;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string | null;
  departmentId: number;
  department: string;
  course: string;
  tradeDate: string | null;
  tradeStart: string | null;
  tradeEnd: string | null;
};

export function listSwaps(where: SQL | undefined, order: SQL[], limit = 200): Promise<SwapRow[]> {
  // Drizzle's inferred type collapses with two aliases of one table, so the row type is spelled out above.
  return db
    .select({
      id: swapRequests.id,
      status: swapRequests.status,
      message: swapRequests.message,
      decisionNote: swapRequests.decisionNote,
      createdAt: swapRequests.createdAt,
      requesterId: swapRequests.requesterId,
      requesterName: requester.name,
      coworkerId: swapRequests.coworkerId,
      coworkerName: coworker.name,
      shiftId: shifts.id,
      shiftDate: shifts.date,
      shiftStart: shifts.startTime,
      shiftEnd: shifts.endTime,
      departmentId: shifts.departmentId,
      department: departments.name,
      course: courses.name,
      tradeDate: coworkerShift.date,
      tradeStart: coworkerShift.startTime,
      tradeEnd: coworkerShift.endTime,
    })
    .from(swapRequests)
    .innerJoin(shifts, eq(shifts.id, swapRequests.shiftId))
    .innerJoin(departments, eq(departments.id, shifts.departmentId))
    .innerJoin(courses, eq(courses.id, departments.courseId))
    .innerJoin(requester, eq(requester.id, swapRequests.requesterId))
    .innerJoin(coworker, eq(coworker.id, swapRequests.coworkerId))
    .leftJoin(coworkerShift, eq(coworkerShift.id, swapRequests.coworkerShiftId))
    .where(where)
    .orderBy(...order)
    .limit(limit) as unknown as Promise<SwapRow[]>;
}

export function listTimeOff(where: SQL | undefined, order: SQL[], limit = 200) {
  return db
    .select({
      id: timeOffRequests.id,
      status: timeOffRequests.status,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
      reason: timeOffRequests.reason,
      decisionNote: timeOffRequests.decisionNote,
      createdAt: timeOffRequests.createdAt,
      userId: timeOffRequests.userId,
      userName: users.name,
      departmentId: timeOffRequests.departmentId,
      department: departments.name,
      course: courses.name,
    })
    .from(timeOffRequests)
    .innerJoin(users, eq(users.id, timeOffRequests.userId))
    .leftJoin(departments, eq(departments.id, timeOffRequests.departmentId))
    .leftJoin(courses, eq(courses.id, departments.courseId))
    .where(where)
    .orderBy(...order)
    .limit(limit);
}
export type TimeOffRow = Awaited<ReturnType<typeof listTimeOff>>[number];

export async function pendingApprovals(user: User) {
  const timeOff = await listTimeOff(
    and(eq(timeOffRequests.status, "pending"), await deptFilter(user, timeOffRequests.departmentId)),
    [asc(timeOffRequests.startDate)],
  );
  const swaps = await listSwaps(
    and(eq(swapRequests.status, "awaiting_approval"), await deptFilter(user, shifts.departmentId)),
    [asc(shifts.date)],
  );
  return { timeOff, swaps };
}

export async function recentDecisions(user: User) {
  const timeOff = await listTimeOff(
    and(inArray(timeOffRequests.status, ["approved", "denied"]), await deptFilter(user, timeOffRequests.departmentId)),
    [desc(timeOffRequests.decidedAt)],
    10,
  );
  const swaps = await listSwaps(
    and(inArray(swapRequests.status, ["approved", "denied"]), await deptFilter(user, shifts.departmentId)),
    [desc(swapRequests.decidedAt)],
    10,
  );
  return { timeOff, swaps };
}

export function allCourses() {
  return db.select().from(courses).orderBy(asc(courses.name));
}

export function allDepartments() {
  return db
    .select({ id: departments.id, name: departments.name, courseId: departments.courseId, approverId: departments.approverId, course: courses.name })
    .from(departments)
    .innerJoin(courses, eq(courses.id, departments.courseId))
    .orderBy(asc(courses.name), asc(departments.name));
}
