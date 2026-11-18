import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  date,
  time,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", [
  "employee",
  "assistant_pro",
  "head_pro",
  "admin",
]);

export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "approved",
  "denied",
  "cancelled",
]);

export const swapStatusEnum = pgEnum("swap_status", [
  "awaiting_coworker", // waiting for the coworker to accept
  "awaiting_approval", // coworker accepted, waiting for the assistant pro
  "approved",
  "declined", // coworker said no
  "denied", // pro said no
  "cancelled",
]);

/** A Reynolds golf course. */
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * A department at a course, e.g. "Cart Attendants" at Great Waters.
 * approverId is the assistant pro who approves requests for this department.
 */
export const departments = pgTable(
  "departments",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    approverId: integer("approver_id"),
  },
  (t) => [uniqueIndex("departments_course_name").on(t.courseId, t.name)],
);

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** Needed to sign in. People added from a schedule upload may not have one yet. */
    email: text("email"),
    phone: text("phone"),
    role: roleEnum("role").notNull().default("employee"),
    courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email").on(t.email)],
);

export const shifts = pgTable(
  "shifts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    departmentId: integer("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** Null for shifts with no set time, like a pro's "Open" or "Close". */
    startTime: time("start_time"),
    endTime: time("end_time"),
    /** Shift label from the sheet: "EOE" (end of event), "CL" (close), "Open", "Close", "Here". */
    label: text("label"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("shifts_user_date").on(t.userId, t.date), index("shifts_dept_date").on(t.departmentId, t.date)],
);

export const timeOffRequests = pgTable("time_off_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  departmentId: integer("department_id").references(() => departments.id, { onDelete: "set null" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  reason: text("reason"),
  status: requestStatusEnum("status").notNull().default("pending"),
  decidedById: integer("decided_by_id").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const swapRequests = pgTable("swap_requests", {
  id: serial("id").primaryKey(),
  shiftId: integer("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  requesterId: integer("requester_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  coworkerId: integer("coworker_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  /** If set, this is a trade: the requester takes this shift in return. */
  coworkerShiftId: integer("coworker_shift_id").references(() => shifts.id, { onDelete: "cascade" }),
  message: text("message"),
  status: swapStatusEnum("status").notNull().default("awaiting_coworker"),
  decidedById: integer("decided_by_id").references(() => users.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const loginTokens = pgTable("login_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

export const sessions = pgTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type User = typeof users.$inferSelect;
export type Role = User["role"];
