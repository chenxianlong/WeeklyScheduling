import type { ScheduleItemInput, SubmissionStatus } from "../../../../packages/shared/src/index.js";
import { sqlite } from "../db/client.js";

type ConflictCheckItem = Pick<
  ScheduleItemInput,
  "name" | "startTime" | "locationId" | "customLocation"
> & { endTime?: string | null };

type CandidateRow = {
  existingSubmissionId: number;
  existingItemId: number;
  name: string;
  startTime: string;
  endTime: string | null;
  locationId: number | null;
  location: string;
  department: string;
  applicantName: string;
  status: SubmissionStatus;
};

export type SubmissionConflict = CandidateRow & {
  inputIndex: number;
  inputName: string;
  sameLocation: boolean;
};

const locationName = sqlite.prepare("SELECT name FROM locations WHERE id=?");

function normalizedLocation(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase("zh-CN") ?? "";
}

function itemLocation(item: ConflictCheckItem) {
  if (item.locationId) {
    return (locationName.get(item.locationId) as { name: string } | undefined)?.name ?? "";
  }
  return item.customLocation ?? "";
}

function overlaps(
  leftStartValue: string,
  leftEndValue: string | null | undefined,
  rightStartValue: string,
  rightEndValue: string | null | undefined,
) {
  const leftStart = new Date(leftStartValue).getTime();
  const rightStart = new Date(rightStartValue).getTime();
  const leftEnd = leftEndValue ? new Date(leftEndValue).getTime() : leftStart + 60_000;
  const rightEnd = rightEndValue ? new Date(rightEndValue).getTime() : rightStart + 60_000;
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function findSubmissionConflicts(
  items: ConflictCheckItem[],
  term: { academicYear: string; semester: string },
  excludeSubmissionId?: number,
) {
  const conflicts: SubmissionConflict[] = [];
  items.forEach((item, inputIndex) => {
    const clauses = [
      "s.academic_year=?",
      "s.semester=?",
      "s.status NOT IN ('cancelled','archived')",
      "substr(i.start_time,1,10)=?",
    ];
    const params: unknown[] = [
      term.academicYear,
      term.semester,
      item.startTime.slice(0, 10),
    ];
    if (excludeSubmissionId) {
      clauses.push("s.id<>?");
      params.push(excludeSubmissionId);
    }
    const candidates = sqlite
      .prepare(
        `SELECT s.id AS existingSubmissionId, i.id AS existingItemId, i.name,
         i.start_time AS startTime, i.end_time AS endTime, i.location_id AS locationId,
         COALESCE(l.name, i.custom_location) AS location,
         COALESCE(d.name, s.custom_department) AS department,
         u.name AS applicantName, s.status
         FROM submission_items i
         JOIN submissions s ON s.id=i.submission_id
         JOIN users u ON u.id=s.applicant_user_id
         LEFT JOIN departments d ON d.id=s.department_id
         LEFT JOIN locations l ON l.id=i.location_id
         WHERE ${clauses.join(" AND ")}`,
      )
      .all(...params) as CandidateRow[];
    const requestedLocation = normalizedLocation(itemLocation(item));
    candidates.forEach((candidate) => {
      if (!overlaps(item.startTime, item.endTime, candidate.startTime, candidate.endTime)) return;
      conflicts.push({
        ...candidate,
        inputIndex,
        inputName: item.name,
        sameLocation:
          Boolean(requestedLocation) && requestedLocation === normalizedLocation(candidate.location),
      });
    });
  });
  return {
    timeConflicts: conflicts,
    locationConflicts: conflicts.filter((conflict) => conflict.sameLocation),
  };
}
