import "server-only";

export type Email = { to: string | null | undefined | (string | null)[]; subject: string; text: string };

export function appUrl(path = "/"): string {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return base + path;
}

/**
 * Sends an email through Resend when RESEND_API_KEY is set.
 * Without a key (local development) it prints the email to the server log.
 * Never throws: a failed notification should not undo a request.
 */
export async function sendEmail(email: Email): Promise<void> {
  const to = (Array.isArray(email.to) ? email.to : [email.to]).filter((x): x is string => !!x);
  if (to.length === 0) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`\n[email] to=${to.join(", ")}\nsubject: ${email.subject}\n${email.text}\n`);
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Reynolds Shifts <onboarding@resend.dev>",
        to,
        subject: email.subject,
        text: email.text,
      }),
    });
    if (!res.ok) console.error("[email] Resend error", res.status, await res.text());
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY);
}
