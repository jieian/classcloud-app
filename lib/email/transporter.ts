import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.warn("[email] RESEND_API_KEY is not set — emails will be silently skipped.");
}

const resend = new Resend(apiKey ?? "re_missing_key");

export default resend;
