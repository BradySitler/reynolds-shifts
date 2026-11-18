"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { createLoginToken, normalizeEmail, redeemLoginToken, signOut } from "@/lib/auth";
import { appUrl, emailEnabled, sendEmail } from "@/lib/email";

export async function requestLoginLink(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") || ""));
  if (!email.includes("@")) redirect("/login?error=Please+enter+your+email+address.");

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  let devLink = "";
  if (user?.active) {
    const token = await createLoginToken(user.id);
    const link = appUrl(`/auth/verify?token=${token}`);
    await sendEmail({
      to: user.email,
      subject: "Your Reynolds Shifts sign-in link",
      text: `Hi ${user.name.split(" ")[0]},\n\nTap this link to sign in to Reynolds Shifts. It works once and expires in 30 minutes.\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
    // Local development without email: show the link on screen.
    if (!emailEnabled() && process.env.NODE_ENV !== "production") devLink = link;
  }
  // Same answer whether or not the email is on file, so the page can't be used to look people up.
  const params = new URLSearchParams({ sent: email });
  if (devLink) params.set("dev", devLink);
  redirect(`/login?${params}`);
}

export async function verifyLogin(formData: FormData) {
  const ok = await redeemLoginToken(String(formData.get("token") || ""));
  if (!ok) redirect("/login?error=That+sign-in+link+has+expired+or+was+already+used.+Request+a+new+one.");
  redirect("/");
}

export async function logout() {
  await signOut();
  redirect("/login");
}
