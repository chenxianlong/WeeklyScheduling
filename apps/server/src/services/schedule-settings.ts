import { config } from "../config.js";
import { sqlite } from "../db/client.js";

export type ScheduleSettings = {
  academicYear: string;
  semester: "一" | "二";
  preWeekStartDate: string | null;
  firstWeekStartDate: string | null;
};

function configuredValue(key: string) {
  const row = sqlite.prepare("SELECT value FROM app_settings WHERE key=?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function envFirstWeekDate() {
  if (!config.firstWeekStartAt) return null;
  const timestamp =
    config.firstWeekStartAt < 10_000_000_000
      ? config.firstWeekStartAt * 1000
      : config.firstWeekStartAt;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function getScheduleSettings(): ScheduleSettings {
  const semester = configuredValue("semester");
  const firstWeekStartDate = configuredValue("first_week_start_date") ?? envFirstWeekDate();
  return {
    academicYear: configuredValue("academic_year") ?? config.academicYear,
    semester: semester === "二" ? "二" : config.semester === "二" ? "二" : "一",
    preWeekStartDate: configuredValue("pre_week_start_date"),
    firstWeekStartDate,
  };
}

export function getAcademicTerm() {
  const { academicYear, semester } = getScheduleSettings();
  return { academicYear, semester };
}

function localDateTimestamp(value: string) {
  return new Date(`${value}T00:00:00+08:00`).getTime();
}

export function currentWeek(now = Date.now()) {
  const { firstWeekStartDate } = getScheduleSettings();
  if (!firstWeekStartDate) return 1;
  const firstWeekStart = localDateTimestamp(firstWeekStartDate);
  if (now < firstWeekStart) return 0;
  return Math.min(20, Math.floor((now - firstWeekStart) / 604_800_000) + 1);
}
