import { Router } from "express";
import {
  SUBMISSION_STATUSES,
  scheduleItemInputSchema,
  submissionInputSchema,
  type SubmissionStatus,
} from "../../../../packages/shared/src/index.js";
import { z } from "zod";
import { nowIso, sqlite } from "../db/client.js";
import { HttpError } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { canViewSubmission, getSubmission } from "../services/submissions.js";
import { currentWeek, getAcademicTerm } from "../services/schedule-settings.js";
import { findSubmissionConflicts } from "../services/submission-conflicts.js";

export const submissionsRouter = Router();
submissionsRouter.use(requireAuth);

const insertItem = sqlite.prepare(`
  INSERT INTO submission_items(
    submission_id, type, name, start_time, end_time, location_id, custom_location,
    participants, remark, sort_order, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function saveItems(submissionId: number, items: ReturnType<typeof submissionInputSchema.parse>["items"]) {
  const stamp = nowIso();
  items.forEach((item, index) => {
    insertItem.run(
      submissionId,
      item.type,
      item.name,
      item.startTime,
      item.endTime ?? null,
      item.locationId ?? null,
      item.customLocation ?? null,
      item.participants,
      item.remark ?? null,
      item.sortOrder ?? index,
      stamp,
      stamp,
    );
  });
}

const conflictCheckSchema = z.object({
  submissionId: z.number().int().positive().optional(),
  items: z.array(scheduleItemInputSchema).min(1).max(100),
});

function conflictsFor(
  items: Parameters<typeof findSubmissionConflicts>[0],
  excludeSubmissionId?: number,
) {
  return findSubmissionConflicts(items, getAcademicTerm(), excludeSubmissionId);
}

function ensureNoLocationConflicts(
  items: Parameters<typeof findSubmissionConflicts>[0],
  excludeSubmissionId?: number,
) {
  const conflicts = conflictsFor(items, excludeSubmissionId);
  if (conflicts.locationConflicts.length) {
    const first = conflicts.locationConflicts[0];
    throw new HttpError(
      409,
      `地点冲突：${first.location}在该时段已有“${first.name}”，不能保存`,
      conflicts,
    );
  }
  return conflicts;
}

submissionsRouter.get("/", (request, response) => {
  const term = getAcademicTerm();
  const page = Math.max(1, Number(request.query.page) || 1);
  const pageSize = Math.min(100, Math.max(5, Number(request.query.pageSize) || 20));
  const status =
    typeof request.query.status === "string" &&
    SUBMISSION_STATUSES.includes(request.query.status as SubmissionStatus)
      ? request.query.status
      : null;
  const week = Number(request.query.week);
  const all = request.query.scope === "all";
  const clauses = ["s.academic_year=?", "s.semester=?"];
  const params: unknown[] = [term.academicYear, term.semester];
  if (!all) {
    clauses.push("s.applicant_user_id=?");
    params.push(request.currentUser!.id);
  }
  if (status) {
    clauses.push("s.status=?");
    params.push(status);
  }
  if (week >= 0 && week <= 20) {
    clauses.push("s.week=?");
    params.push(week);
  }
  const where = clauses.join(" AND ");
  const total = (
    sqlite.prepare(`SELECT COUNT(*) AS count FROM submissions s WHERE ${where}`).get(...params) as {
      count: number;
    }
  ).count;
  const rows = sqlite
    .prepare(
      `SELECT s.id, s.week, s.status, COALESCE(d.name, s.custom_department) AS department,
        u.name AS applicantName, s.submitted_at AS submittedAt, s.updated_at AS updatedAt,
        COUNT(i.id) AS itemCount, MIN(i.start_time) AS firstStartTime
       FROM submissions s
       JOIN users u ON u.id=s.applicant_user_id
       LEFT JOIN departments d ON d.id=s.department_id
       LEFT JOIN submission_items i ON i.submission_id=s.id
       WHERE ${where}
       GROUP BY s.id ORDER BY s.updated_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize);
  response.json({ rows, page, pageSize, total });
});

submissionsRouter.get("/shared-schedule", (request, response) => {
  const requestedWeek = Number(request.query.week);
  const week = Number.isInteger(requestedWeek) && requestedWeek >= 0 && requestedWeek <= 20
    ? requestedWeek
    : currentWeek();
  const term = getAcademicTerm();
  const items = sqlite
    .prepare(
      `SELECT i.id, s.id AS submissionId, i.type, i.name,
        i.start_time AS startTime, i.end_time AS endTime,
        COALESCE(l.name, i.custom_location) AS location,
        i.participants, COALESCE(d.name, s.custom_department) AS department,
        i.remark, s.status, u.name AS applicantName, i.sort_order AS sortOrder
       FROM submissions s
       JOIN submission_items i ON i.submission_id=s.id
       JOIN users u ON u.id=s.applicant_user_id
       LEFT JOIN departments d ON d.id=s.department_id
       LEFT JOIN locations l ON l.id=i.location_id
       WHERE s.academic_year=? AND s.semester=? AND s.week=?
         AND s.status NOT IN ('cancelled', 'archived')
       ORDER BY i.start_time, s.id, i.sort_order, i.id`,
    )
    .all(term.academicYear, term.semester, week);
  response.json({ ...term, week, items });
});

submissionsRouter.post("/conflicts", (request, response) => {
  const input = conflictCheckSchema.parse(request.body);
  response.json(conflictsFor(input.items, input.submissionId));
});

submissionsRouter.post("/", (request, response) => {
  const term = getAcademicTerm();
  const input = submissionInputSchema.parse(request.body);
  ensureNoLocationConflicts(input.items);
  const stamp = nowIso();
  const id = sqlite.transaction(() => {
    const result = sqlite
      .prepare(
        `INSERT INTO submissions(
          academic_year, semester, week, department_id, custom_department,
          applicant_user_id, status, applicant_remark, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
      )
      .run(
        term.academicYear,
        term.semester,
        input.week,
        input.departmentId ?? null,
        input.customDepartment ?? null,
        request.currentUser!.id,
        input.applicantRemark ?? null,
        stamp,
        stamp,
      );
    const submissionId = Number(result.lastInsertRowid);
    saveItems(submissionId, input.items);
    return submissionId;
  })();
  audit(request, "submission.create", "submission", id);
  response.status(201).json(getSubmission(id));
});

submissionsRouter.get("/:id", (request, response) => {
  const submission = getSubmission(Number(request.params.id));
  if (!canViewSubmission(request.currentUser, submission)) throw new HttpError(403, "无查看权限");
  response.json(submission);
});

submissionsRouter.put("/:id", (request, response) => {
  const id = Number(request.params.id);
  const existing = getSubmission(id);
  const isAdmin = ["admin", "system_admin"].includes(request.currentUser!.role);
  const isOwner = existing.applicantUserId === request.currentUser!.id;
  if (!isAdmin && (!isOwner || !["draft", "returned"].includes(String(existing.status)))) {
    throw new HttpError(403, "当前状态下不能编辑此申请");
  }
  const input = submissionInputSchema.parse(request.body);
  ensureNoLocationConflicts(input.items, id);
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE submissions SET week=?, department_id=?, custom_department=?,
         applicant_remark=?, updated_at=? WHERE id=?`,
      )
      .run(
        input.week,
        input.departmentId ?? null,
        input.customDepartment ?? null,
        input.applicantRemark ?? null,
        nowIso(),
        id,
      );
    sqlite.prepare("DELETE FROM submission_items WHERE submission_id=?").run(id);
    saveItems(id, input.items);
  })();
  audit(request, "submission.update", "submission", id);
  response.json(getSubmission(id));
});

submissionsRouter.delete("/:id", (request, response) => {
  const id = Number(request.params.id);
  const existing = getSubmission(id);
  const isAdmin = ["admin", "system_admin"].includes(request.currentUser!.role);
  if (
    !isAdmin &&
    (existing.applicantUserId !== request.currentUser!.id ||
      !["draft", "returned", "cancelled"].includes(String(existing.status)))
  ) {
    throw new HttpError(403, "当前状态下不能删除此申请");
  }
  const deleted = sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE publication_items SET source_submission_id=NULL, source_item_id=NULL
         WHERE source_submission_id=?`,
      )
      .run(id);
    sqlite.prepare("DELETE FROM email_notifications WHERE submission_id=?").run(id);
    sqlite.prepare("DELETE FROM review_logs WHERE submission_id=?").run(id);
    sqlite.prepare("DELETE FROM submission_items WHERE submission_id=?").run(id);
    return sqlite.prepare("DELETE FROM submissions WHERE id=?").run(id).changes;
  })();
  if (!deleted) throw new HttpError(404, "申请不存在或已被删除");
  audit(request, "submission.delete", "submission", id);
  response.json({ ok: true });
});

submissionsRouter.post("/:id/submit", (request, response) => {
  const id = Number(request.params.id);
  const existing = getSubmission(id);
  if (existing.applicantUserId !== request.currentUser!.id) {
    throw new HttpError(403, "只能提交自己的申请");
  }
  if (existing.status === "submitted") {
    response.json(existing);
    return;
  }
  if (!["draft", "returned"].includes(String(existing.status))) {
    throw new HttpError(409, "当前状态不能提交");
  }
  ensureNoLocationConflicts(
    existing.items as Parameters<typeof findSubmissionConflicts>[0],
    id,
  );
  const stamp = nowIso();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE submissions SET status='submitted', submitted_at=?, return_reason=NULL, updated_at=? WHERE id=?`,
      )
      .run(stamp, stamp, id);
    sqlite
      .prepare(
        `INSERT INTO review_logs(submission_id, action, from_status, to_status, operator_user_id, created_at)
         VALUES (?, 'submit', ?, 'submitted', ?, ?)`,
      )
      .run(id, existing.status, request.currentUser!.id, stamp);
  })();
  audit(request, "submission.submit", "submission", id);
  response.json(getSubmission(id));
});

submissionsRouter.post("/:id/withdraw", (request, response) => {
  const id = Number(request.params.id);
  const existing = getSubmission(id);
  if (existing.applicantUserId !== request.currentUser!.id || existing.status !== "submitted") {
    throw new HttpError(409, "只有本人待审核的申请可以撤回");
  }
  const stamp = nowIso();
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE submissions SET status='draft', updated_at=? WHERE id=?").run(stamp, id);
    sqlite
      .prepare(
        `INSERT INTO review_logs(submission_id, action, from_status, to_status, operator_user_id, created_at)
         VALUES (?, 'withdraw', 'submitted', 'draft', ?, ?)`,
      )
      .run(id, request.currentUser!.id, stamp);
  })();
  audit(request, "submission.withdraw", "submission", id);
  response.json(getSubmission(id));
});
