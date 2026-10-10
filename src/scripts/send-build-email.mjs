#!/usr/bin/env node
// Emails the finished APK's download link, like Expo's own build email. Run by
// .github/workflows/build-apk-local.yml after the APK is published as a GitHub
// release. Uses the same provider switch as build-and-notify.mjs and the
// backend (EMAIL_PROVIDER=brevo or smtp), so one set of mail settings serves all.

const {
  EMAIL_PROVIDER = "smtp",
  SMTP_HOST,
  SMTP_PORT = "587",
  SMTP_SECURE = "false",
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  MAIL_TO,
  BREVO_API_KEY,
  BREVO_FROM_EMAIL,
  BREVO_FROM_NAME = "Šoma360",
  APK_URL,
  APK_NAME = "app-release.apk",
  APK_SIZE_MB = "",
  APP_VERSION = "",
  VERSION_CODE = "",
  BRANCH = "",
  COMMIT = "",
  COMMIT_MESSAGE = "",
  RUN_URL = "",
  PUSH_ENABLED = "false",
} = process.env;

const usingBrevo = EMAIL_PROVIDER.trim().toLowerCase() === "brevo";

function need(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}
need("MAIL_TO", MAIL_TO);
need("APK_URL", APK_URL);
if (usingBrevo) {
  need("BREVO_API_KEY", BREVO_API_KEY);
  need("BREVO_FROM_EMAIL", BREVO_FROM_EMAIL);
} else {
  need("SMTP_HOST", SMTP_HOST);
  need("SMTP_USER", SMTP_USER);
  need("SMTP_PASS", SMTP_PASS);
  need("MAIL_FROM", MAIL_FROM);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const subject = `Šoma360 ${APP_VERSION ? `v${APP_VERSION} ` : ""}build ${VERSION_CODE} is ready to install`;
const rows = [
  ["Version", APP_VERSION && `${APP_VERSION} (build ${VERSION_CODE})`],
  ["Branch", BRANCH],
  ["Commit", COMMIT && `${COMMIT.slice(0, 7)}${COMMIT_MESSAGE ? ` — ${COMMIT_MESSAGE.split("\n")[0]}` : ""}`],
  ["File", `${APK_NAME}${APK_SIZE_MB ? ` (${APK_SIZE_MB} MB)` : ""}`],
  ["Push notifications", PUSH_ENABLED === "true" ? "Enabled in this build" : "Not enabled in this build (no Firebase config)"],
].filter(([, v]) => v);

const text = [
  "Your Šoma360 Android build is ready.",
  "",
  `Download: ${APK_URL}`,
  "",
  ...rows.map(([k, v]) => `${k}: ${v}`),
  RUN_URL ? `\nBuild log: ${RUN_URL}` : "",
  "",
  "On your phone: open the link, download the APK and tap it to install. If Android blocks it,",
  "allow installs from your browser when asked. Builds are signed with the same key, so each one",
  "installs over the previous.",
].join("\n");

const html = `<!doctype html><html><body style="margin:0;background:#f4f7f9;font-family:Arial,Helvetica,sans-serif;color:#182531">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dfe8ec">
<tr><td style="background:#21779b;color:#fff;padding:20px 24px;font-size:20px;font-weight:700">Šoma360</td></tr>
<tr><td style="padding:24px">
<h2 style="margin:0 0 6px;font-size:20px">Your build is ready</h2>
<p style="margin:0 0 20px;color:#6f7b87;font-size:14px">A new Android build finished successfully and is ready to install.</p>
<p style="margin:0 0 22px"><a href="${esc(APK_URL)}" style="display:inline-block;background:#21779b;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 26px;border-radius:10px;font-size:15px">Download APK</a></p>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;border-top:1px solid #eef3f5">
${rows.map(([k, v]) => `<tr><td style="padding:9px 0;color:#6f7b87;width:38%;border-bottom:1px solid #eef3f5">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid #eef3f5">${esc(v)}</td></tr>`).join("\n")}
</table>
<p style="margin:20px 0 0;color:#6f7b87;font-size:12px;line-height:1.5">Open this email on your phone, download the file and tap it to install. If Android blocks the install, allow it for your browser when prompted. Each build installs over the previous one.${RUN_URL ? ` <a href="${esc(RUN_URL)}" style="color:#21779b">Build log</a>` : ""}</p>
</td></tr></table></td></tr></table></body></html>`;

async function viaBrevo() {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": BREVO_API_KEY, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: MAIL_TO.split(",").map((email) => ({ email: email.trim() })),
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });
  if (!res.ok) throw new Error(`Brevo send failed: ${res.status} ${await res.text().catch(() => "")}`);
}

async function viaSmtp() {
  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  await transporter.sendMail({ from: MAIL_FROM, to: MAIL_TO, subject, text, html });
}

try {
  await (usingBrevo ? viaBrevo() : viaSmtp());
  console.log(`Build email sent to ${MAIL_TO} via ${usingBrevo ? "Brevo" : "SMTP"}`);
} catch (error) {
  console.error("send-build-email failed:", error.message ?? error);
  process.exit(1);
}
