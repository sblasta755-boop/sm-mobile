#!/usr/bin/env node
// Runs an EAS cloud build, then emails the resulting Application Archive URL.
// Intended to run once per container start (see Dockerfile target "build-notify")
// or once per CI run (see .github/workflows/build-apk.yml).
//
// Sends via Brevo's HTTP API or plain SMTP depending on EMAIL_PROVIDER -
// mirrors the backend's own app/services/email.py send_email() switch
// (EMAIL_PROVIDER=brevo vs the smtp default) so this script honours the
// same provider choice as the rest of the app instead of being
// hardwired to SMTP only. Brevo needs no extra dependency: Node 22
// (this script's own runtime, per the Dockerfile/CI's node-version) has
// fetch() built in.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const {
  EAS_BUILD_PROFILE = "preview",
  EXPO_TOKEN,
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
} = process.env;

const usingBrevo = EMAIL_PROVIDER.trim().toLowerCase() === "brevo";

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

requireEnv("EXPO_TOKEN", EXPO_TOKEN);
if (usingBrevo) {
  requireEnv("BREVO_API_KEY", BREVO_API_KEY);
  requireEnv("BREVO_FROM_EMAIL", BREVO_FROM_EMAIL);
} else {
  requireEnv("SMTP_HOST", SMTP_HOST);
  requireEnv("SMTP_USER", SMTP_USER);
  requireEnv("SMTP_PASS", SMTP_PASS);
  requireEnv("MAIL_FROM", MAIL_FROM);
}
requireEnv("MAIL_TO", MAIL_TO);

async function runBuild() {
  console.log(`Starting EAS cloud build (profile: ${EAS_BUILD_PROFILE})...`);
  const { stdout } = await execFileAsync(
    "eas",
    [
      "build",
      "--platform",
      "android",
      "--profile",
      EAS_BUILD_PROFILE,
      "--non-interactive",
      "--json",
    ],
    { maxBuffer: 1024 * 1024 * 20 }
  );

  const results = JSON.parse(stdout);
  const build = Array.isArray(results) ? results[0] : results;

  if (!build) {
    throw new Error("eas build did not return any build result");
  }
  if (String(build.status).toUpperCase() !== "FINISHED") {
    throw new Error(`Build did not finish successfully (status: ${build.status})`);
  }

  const archiveUrl = build.artifacts?.buildUrl;
  if (!archiveUrl) {
    throw new Error("Build finished but no artifacts.buildUrl was present in the result");
  }

  return {
    archiveUrl,
    buildId: build.id,
    profile: build.buildProfile ?? EAS_BUILD_PROFILE,
    platform: build.platform,
    appVersion: build.appVersion,
    logsUrl: build.artifacts?.logsUrl ?? null,
  };
}

function buildMessage(build) {
  const subject = `APK ready: ${build.profile} build (${build.appVersion ?? "unknown version"})`;
  const text = [
    `Your ${build.profile} Android build has finished.`,
    "",
    `Download: ${build.archiveUrl}`,
    `Build ID: ${build.buildId}`,
    build.logsUrl ? `Logs: ${build.logsUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, text };
}

async function sendViaBrevo(build) {
  const { subject, text } = buildMessage(build);
  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: MAIL_TO }],
      subject,
      textContent: text,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Brevo send failed: ${response.status} ${body}`);
  }
}

async function sendViaSmtp(build) {
  // Loaded only on this path - the Brevo path has no need for it, same
  // as the backend's own provider switch not touching its SMTP code
  // path when EMAIL_PROVIDER=brevo.
  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  const { subject, text } = buildMessage(build);
  await transporter.sendMail({ from: MAIL_FROM, to: MAIL_TO, subject, text });
}

async function sendEmail(build) {
  if (usingBrevo) {
    await sendViaBrevo(build);
  } else {
    await sendViaSmtp(build);
  }
  console.log(`Notification email sent to ${MAIL_TO} via ${usingBrevo ? "Brevo" : "SMTP"}`);
}

try {
  const build = await runBuild();
  console.log(`Build finished: ${build.archiveUrl}`);
  await sendEmail(build);
  process.exit(0);
} catch (err) {
  console.error("build-and-notify failed:", err.message ?? err);
  process.exit(1);
}
