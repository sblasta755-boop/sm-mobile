#!/usr/bin/env node
// Runs an EAS cloud build, then emails the resulting Application Archive URL.
// Intended to run once per container start (see Dockerfile target "build-notify").

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import nodemailer from "nodemailer";

const execFileAsync = promisify(execFile);

const {
  EAS_BUILD_PROFILE = "preview",
  EXPO_TOKEN,
  SMTP_HOST,
  SMTP_PORT = "587",
  SMTP_SECURE = "false",
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  MAIL_TO,
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

requireEnv("EXPO_TOKEN", EXPO_TOKEN);
requireEnv("SMTP_HOST", SMTP_HOST);
requireEnv("SMTP_USER", SMTP_USER);
requireEnv("SMTP_PASS", SMTP_PASS);
requireEnv("MAIL_FROM", MAIL_FROM);
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

async function sendEmail(build) {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

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

  await transporter.sendMail({
    from: MAIL_FROM,
    to: MAIL_TO,
    subject,
    text,
  });

  console.log(`Notification email sent to ${MAIL_TO}`);
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
