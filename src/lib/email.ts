import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type Email = { to: string | null | undefined | (string | null)[]; subject: string; text: string };

export function appUrl(path = "/"): string {
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = (process.env.APP_URL || (vercelUrl ? `https://${vercelUrl}` : "http://localhost:3000")).replace(/\/$/, "");
  return base + path;
}

let gmail: Transporter | undefined;
function gmailTransport(): Transporter | undefined {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return undefined;
  gmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: pass.replace(/\s+/g, "") }, // Google shows app passwords with spaces
  });
  return gmail;
}

/**
 * Sends an email through a Gmail account (GMAIL_USER + GMAIL_APP_PASSWORD),
 * or through Resend when RESEND_API_KEY is set instead.
 * With neither (local development) it prints the email to the server log.
 * Never throws: a failed notification should not undo a request.
 */
export async function sendEmail(email: Email): Promise<void> {
  const to = (Array.isArray(email.to) ? email.to : [email.to]).filter((x): x is string => !!x);
  if (to.length === 0) return;
  try {
    const smtp = gmailTransport();
    if (smtp) {
      // One message per person, so coworkers' addresses aren't shared with each other.
      for (const addr of to) {
        await smtp.sendMail({
          from: `"${process.env.EMAIL_FROM_NAME || "Reynolds Shifts"}" <${process.env.GMAIL_USER}>`,
          to: addr,
          subject: email.subject,
          text: email.text,
        });
      }
      return;
    }
    const key = process.env.RESEND_API_KEY;
    if (key) {
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
      return;
    }
    console.log(`\n[email] to=${to.join(", ")}\nsubject: ${email.subject}\n${email.text}\n`);
  } catch (err) {
    console.error("[email] send failed", err);
  }
}

export function emailEnabled() {
  return Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || process.env.RESEND_API_KEY);
}
