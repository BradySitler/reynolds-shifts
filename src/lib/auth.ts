import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";
import type { Role, User } from "@/db/schema";

const SESSION_COOKIE = "rs_session";
const SESSION_DAYS = 60;
const LOGIN_TOKEN_MINUTES = 30;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Creates a one-time sign-in token for a user and returns the raw token. */
export async function createLoginToken(userId: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.loginTokens).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000),
  });
  return token;
}

/** Uses a sign-in token (once) and starts a session. Returns false if the token is bad. */
export async function redeemLoginToken(token: string): Promise<boolean> {
  const [row] = await db
    .update(schema.loginTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.loginTokens.tokenHash, sha256(token)),
        isNull(schema.loginTokens.usedAt),
        gt(schema.loginTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!row) return false;

  const user = await db.query.users.findFirst({ where: eq(schema.users.id, row.userId) });
  if (!user?.active) return false;

  const sessionId = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(schema.sessions).values({ idHash: sha256(sessionId), userId: user.id, expiresAt });
  (await cookies()).set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return true;
}

export async function signOut() {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await db.delete(schema.sessions).where(eq(schema.sessions.idHash, sha256(sid)));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const [row] = await db
    .select({ user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.idHash, sha256(sid)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.user.active) return null;
  return row.user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export const isManager = (role: Role) => role !== "employee";

export async function requireManager(): Promise<User> {
  const user = await requireUser();
  if (!isManager(user.role)) redirect("/");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "head_pro") redirect("/");
  return user;
}
