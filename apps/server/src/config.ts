import "dotenv/config";
import path from "node:path";

const cwd = process.cwd();

function env(name: string, fallback = "") {
  return process.env[name] ?? fallback;
}

function envBoolean(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const config = {
  nodeEnv: env("NODE_ENV", "development"),
  host: env("HOST", "0.0.0.0"),
  port: Number(env("PORT", "3000")),
  appUrl: env("APP_URL", "http://localhost:3000"),
  webDevUrl: env("WEB_DEV_URL", "http://localhost:5173"),
  sessionSecret: env("SESSION_SECRET", "development-only-change-me"),
  organizationName: env("ORGANIZATION_NAME", "示例组织"),
  emailAllowedDomain: env("EMAIL_ALLOWED_DOMAIN", "example.org").trim().toLowerCase(),
  databasePath: path.resolve(cwd, env("DATABASE_PATH", "database/data/meeting-schedule.sqlite")),
  academicYear: env("MEETING_SCHEDULE_ACADEMIC_YEAR", "2026-2027"),
  semester: env("MEETING_SCHEDULE_SEMESTER", "一"),
  firstWeekStartAt: Number(env("MEETING_SCHEDULE_FIRST_WEEK_START_AT", "0")),
  pdfStoragePath: path.resolve(cwd, env("PDF_STORAGE_PATH", "storage/pdf")),
  chromiumPath: env("PLAYWRIGHT_CHROMIUM_PATH") || undefined,
  smtp: {
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT", "465")),
    secure: envBoolean("SMTP_SECURE", true),
    user: env("SMTP_USER"),
    password: env("SMTP_PASSWORD"),
    from: env("SMTP_FROM") || env("SMTP_USER"),
  },
  isProduction: env("NODE_ENV", "development") === "production",
};
