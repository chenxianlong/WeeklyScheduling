import { sqlite } from "../db/client.js";
import { HttpError } from "../http.js";

type SubmissionRow = Record<string, unknown> & {
  id: number;
  applicantUserId: number;
  status: string;
};

export function getSubmission(id: number) {
  const submission = sqlite
    .prepare(
      `SELECT s.id, s.academic_year AS academicYear, s.semester, s.week,
        s.department_id AS departmentId, s.custom_department AS customDepartment,
        COALESCE(d.name, s.custom_department) AS department,
        s.applicant_user_id AS applicantUserId, u.name AS applicantName, u.avatar AS applicantAvatar,
        s.status, s.applicant_remark AS applicantRemark, s.submitted_at AS submittedAt,
        s.approved_at AS approvedAt, s.returned_at AS returnedAt, s.return_reason AS returnReason,
        s.created_at AS createdAt, s.updated_at AS updatedAt
       FROM submissions s
       JOIN users u ON u.id=s.applicant_user_id
       LEFT JOIN departments d ON d.id=s.department_id
       WHERE s.id=?`,
    )
    .get(id) as SubmissionRow | undefined;
  if (!submission) throw new HttpError(404, "申请不存在");

  const items = sqlite
    .prepare(
      `SELECT i.id, i.type, i.name, i.start_time AS startTime, i.end_time AS endTime,
        i.location_id AS locationId, i.custom_location AS customLocation,
        COALESCE(l.name, i.custom_location) AS location,
        i.participants, i.remark, i.sort_order AS sortOrder
       FROM submission_items i LEFT JOIN locations l ON l.id=i.location_id
       WHERE i.submission_id=? ORDER BY i.sort_order, i.id`,
    )
    .all(id);
  const reviews = sqlite
    .prepare(
      `SELECT r.id, r.action, r.from_status AS fromStatus, r.to_status AS toStatus,
        r.comment, r.created_at AS createdAt, u.name AS operatorName
       FROM review_logs r JOIN users u ON u.id=r.operator_user_id
       WHERE r.submission_id=? ORDER BY r.id DESC`,
    )
    .all(id);
  return { ...submission, items, reviews };
}

export function canViewSubmission(
  user: Express.Request["currentUser"],
  _submission: { applicantUserId?: unknown },
) {
  return Boolean(user);
}
