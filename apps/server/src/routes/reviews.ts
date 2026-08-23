import { Router } from "express";
import { reviewInputSchema, returnInputSchema } from "../../../../packages/shared/src/index.js";
import { nowIso, sqlite } from "../db/client.js";
import { HttpError } from "../http.js";
import { requireAdmin } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { getSubmission } from "../services/submissions.js";
import { getAcademicTerm } from "../services/schedule-settings.js";

export const reviewsRouter = Router();
reviewsRouter.use(requireAdmin);

reviewsRouter.get("/", (request, response) => {
  const term = getAcademicTerm();
  const week = Number(request.query.week);
  const clauses = [
    "s.academic_year=?",
    "s.semester=?",
    "s.status='submitted'",
  ];
  const params: unknown[] = [term.academicYear, term.semester];
  if (week >= 0 && week <= 20) {
    clauses.push("s.week=?");
    params.push(week);
  }
  const rows = sqlite
    .prepare(
      `SELECT s.id, s.week, COALESCE(d.name, s.custom_department) AS department,
       u.name AS applicantName, s.submitted_at AS submittedAt,
       COUNT(i.id) AS itemCount, MIN(i.start_time) AS firstStartTime
       FROM submissions s
       JOIN users u ON u.id=s.applicant_user_id
       LEFT JOIN departments d ON d.id=s.department_id
       LEFT JOIN submission_items i ON i.submission_id=s.id
       WHERE ${clauses.join(" AND ")}
       GROUP BY s.id ORDER BY s.submitted_at`,
    )
    .all(...params);
  response.json({ rows });
});

reviewsRouter.post("/:id/approve", (request, response) => {
  const id = Number(request.params.id);
  const input = reviewInputSchema.parse(request.body);
  const existing = getSubmission(id);
  if (existing.status !== "submitted") throw new HttpError(409, "申请已不在待审核状态");
  const stamp = nowIso();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE submissions SET status='approved', approved_at=?, approved_by=?,
         returned_at=NULL, returned_by=NULL, return_reason=NULL, updated_at=? WHERE id=?`,
      )
      .run(stamp, request.currentUser!.id, stamp, id);
    sqlite
      .prepare(
        `INSERT INTO review_logs(submission_id, action, from_status, to_status, comment, operator_user_id, created_at)
         VALUES (?, 'approve', 'submitted', 'approved', ?, ?, ?)`,
      )
      .run(id, input.comment ?? null, request.currentUser!.id, stamp);
  })();
  audit(request, "review.approve", "submission", id, input);
  response.json(getSubmission(id));
});

reviewsRouter.post("/:id/return", (request, response) => {
  const id = Number(request.params.id);
  const input = returnInputSchema.parse(request.body);
  const existing = getSubmission(id);
  if (existing.status !== "submitted") throw new HttpError(409, "申请已不在待审核状态");
  const stamp = nowIso();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE submissions SET status='returned', returned_at=?, returned_by=?,
         return_reason=?, updated_at=? WHERE id=?`,
      )
      .run(stamp, request.currentUser!.id, input.comment, stamp, id);
    sqlite
      .prepare(
        `INSERT INTO review_logs(submission_id, action, from_status, to_status, comment, operator_user_id, created_at)
         VALUES (?, 'return', 'submitted', 'returned', ?, ?, ?)`,
      )
      .run(id, input.comment, request.currentUser!.id, stamp);
  })();
  audit(request, "review.return", "submission", id, input);
  response.json(getSubmission(id));
});
