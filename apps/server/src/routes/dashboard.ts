import { Router } from "express";
import { sqlite } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";
import { currentWeek, getAcademicTerm } from "../services/schedule-settings.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", (request, response) => {
  const term = getAcademicTerm();
  const own = sqlite
    .prepare(
      `SELECT status, COUNT(*) AS count FROM submissions
       WHERE applicant_user_id=? AND academic_year=? AND semester=? GROUP BY status`,
    )
    .all(request.currentUser!.id, term.academicYear, term.semester);
  const review = ["admin", "system_admin"].includes(request.currentUser!.role)
    ? (sqlite
        .prepare(
          `SELECT COUNT(*) AS count FROM submissions
           WHERE status='submitted' AND academic_year=? AND semester=?`,
        )
        .get(term.academicYear, term.semester) as { count: number }).count
    : 0;
  const latestPublication = sqlite
    .prepare(
      `SELECT id, week, version, published_at AS publishedAt
       FROM weekly_publications
       WHERE status='published' AND academic_year=? AND semester=?
       ORDER BY published_at DESC LIMIT 1`,
    )
    .get(term.academicYear, term.semester);
  response.json({
    currentWeek: currentWeek(),
    own,
    pendingReview: review,
    latestPublication,
  });
});
