import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { publicationItemInputSchema, weekLabel } from "../../../../packages/shared/src/index.js";
import { config } from "../config.js";
import { nowIso, sqlite } from "../db/client.js";
import { asyncRoute, HttpError } from "../http.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { enqueuePublicationRemovalNotification } from "../services/email-notifications.js";
import {
  generatePublicationPdf,
  mobilePdfPath,
  publicationHtml,
} from "../services/pdf.js";
import { currentWeek, getAcademicTerm } from "../services/schedule-settings.js";

export const publicationsRouter = Router();
publicationsRouter.use(requireAuth);

publicationsRouter.get("/", (_request, response) => {
  const rows = sqlite
    .prepare(
      `SELECT p.id, p.academic_year AS academicYear, p.semester, p.week, p.version,
       p.title, p.published_at AS publishedAt, p.pdf_path IS NOT NULL AS hasPdf,
       u.name AS publisherName
       FROM weekly_publications p LEFT JOIN users u ON u.id=p.published_by
       WHERE p.status='published' ORDER BY p.published_at DESC`,
    )
    .all();
  response.json({ rows });
});

publicationsRouter.get("/admin/workspace", requireAdmin, (request, response) => {
  const term = getAcademicTerm();
  const requestedWeek = Number(request.query.week);
  const week =
    Number.isInteger(requestedWeek) && requestedWeek >= 0 && requestedWeek <= 20
      ? requestedWeek
      : currentWeek();
  const items = sqlite
    .prepare(
      `SELECT i.id AS sourceItemId, s.id AS sourceSubmissionId, i.type, i.name,
       i.start_time AS startTime, i.end_time AS endTime,
       COALESCE(l.name, i.custom_location) AS location, i.participants,
       COALESCE(d.name, s.custom_department) AS department, i.remark,
       ROW_NUMBER() OVER (ORDER BY i.start_time, s.id, i.sort_order) - 1 AS sortOrder
       FROM submissions s
       JOIN submission_items i ON i.submission_id=s.id
       LEFT JOIN departments d ON d.id=s.department_id
       LEFT JOIN locations l ON l.id=i.location_id
       WHERE s.status='approved' AND s.academic_year=? AND s.semester=? AND s.week=?
       ORDER BY i.start_time, s.id, i.sort_order`,
    )
    .all(term.academicYear, term.semester, week);
  const latest = sqlite
    .prepare(
      `SELECT id, version, published_at AS publishedAt FROM weekly_publications
       WHERE academic_year=? AND semester=? AND week=? AND status='published'
       ORDER BY version DESC LIMIT 1`,
    )
    .get(term.academicYear, term.semester, week);
  response.json({ week, items, latest });
});

publicationsRouter.delete("/admin/workspace/items/:itemId", requireAdmin, (request, response) => {
  const sourceItemId = Number(request.params.itemId);
  const item = sqlite
    .prepare(
      `SELECT i.id AS sourceItemId, i.name AS itemName, i.start_time AS startTime,
       s.id AS submissionId, s.academic_year AS academicYear, s.semester, s.week,
       s.applicant_user_id AS applicantUserId, u.name AS applicantName,
       COALESCE(d.name, s.custom_department, '未设置部门') AS department,
       (SELECT COUNT(*) FROM submission_items sibling WHERE sibling.submission_id=s.id) AS itemCount
       FROM submission_items i
       JOIN submissions s ON s.id=i.submission_id
       JOIN users u ON u.id=s.applicant_user_id
       LEFT JOIN departments d ON d.id=s.department_id
       WHERE i.id=? AND s.status='approved'`,
    )
    .get(sourceItemId) as
    | {
        sourceItemId: number;
        itemName: string;
        startTime: string;
        submissionId: number;
        academicYear: string;
        semester: string;
        week: number;
        applicantUserId: number;
        applicantName: string;
        department: string;
        itemCount: number;
      }
    | undefined;
  if (!item) throw new HttpError(404, "待发布项目不存在");
  const recipients = (
    sqlite
      .prepare("SELECT email FROM user_emails WHERE user_id=? AND verified_at IS NOT NULL ORDER BY id")
      .all(item.applicantUserId) as Array<{ email: string }>
  ).map((row) => row.email);
  sqlite.transaction(() => {
    sqlite
      .prepare(
        `UPDATE publication_items SET source_submission_id=NULL, source_item_id=NULL
         WHERE source_submission_id=?`,
      )
      .run(item.submissionId);
    sqlite.prepare("DELETE FROM email_notifications WHERE submission_id=?").run(item.submissionId);
    sqlite.prepare("DELETE FROM review_logs WHERE submission_id=?").run(item.submissionId);
    sqlite.prepare("DELETE FROM submission_items WHERE submission_id=?").run(item.submissionId);
    sqlite.prepare("DELETE FROM submissions WHERE id=?").run(item.submissionId);
    if (recipients.length) {
      enqueuePublicationRemovalNotification({
        submissionId: item.submissionId,
        sourceItemId: item.sourceItemId,
        recipients,
        applicantName: item.applicantName,
        academicYear: item.academicYear,
        semester: item.semester,
        week: item.week,
        department: item.department,
        itemName: item.itemName,
        startTime: item.startTime,
      });
    }
  })();
  audit(request, "publication.workspace_item.delete", "submission_item", sourceItemId, {
    submissionId: item.submissionId,
    itemName: item.itemName,
    deletedItemCount: item.itemCount,
    emailNotification: recipients.length ? `queued:${recipients.length}` : "skipped_no_email",
  });
  response.json({ ok: true, emailQueued: recipients.length, deletedItemCount: item.itemCount });
});

const publishSchema = z.object({
  week: z.number().int().min(0).max(20),
  title: z.string().trim().min(1).max(100).default("一周工作安排"),
  items: z.array(publicationItemInputSchema).min(1, "发布内容不能为空").max(500),
});

const publicationUpdateSchema = publishSchema.omit({ week: true });

function insertPublicationItems(publicationId: number, items: z.infer<typeof publicationUpdateSchema>["items"], stamp: string) {
  const insert = sqlite.prepare(
    `INSERT INTO publication_items(
     publication_id, source_submission_id, source_item_id, type, name,
     start_time, end_time, location, participants, department, remark,
     sort_order, snapshot_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  items.forEach((item, index) =>
    insert.run(
      publicationId,
      item.sourceSubmissionId ?? null,
      item.sourceItemId ?? null,
      item.type,
      item.name,
      item.startTime,
      item.endTime ?? null,
      item.location,
      item.participants,
      item.department,
      item.remark ?? null,
      item.sortOrder ?? index,
      JSON.stringify(item),
      stamp,
    ),
  );
}

publicationsRouter.post(
  "/admin/publish",
  requireAdmin,
  asyncRoute(async (request, response) => {
    const term = getAcademicTerm();
    const input = publishSchema.parse(request.body);
    const stamp = nowIso();
    const publicationId = sqlite.transaction(() => {
      const max = sqlite
        .prepare(
          `SELECT COALESCE(MAX(version),0) AS version FROM weekly_publications
           WHERE academic_year=? AND semester=? AND week=?`,
        )
        .get(term.academicYear, term.semester, input.week) as { version: number };
      sqlite
        .prepare(
          `UPDATE weekly_publications SET status='superseded', updated_at=?
           WHERE academic_year=? AND semester=? AND week=? AND status='published'`,
        )
        .run(stamp, term.academicYear, term.semester, input.week);
      const result = sqlite
        .prepare(
          `INSERT INTO weekly_publications(
           academic_year, semester, week, version, status, title,
           published_by, published_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)`,
        )
        .run(
          term.academicYear,
          term.semester,
          input.week,
          max.version + 1,
          input.title,
          request.currentUser!.id,
          stamp,
          stamp,
          stamp,
        );
      const id = Number(result.lastInsertRowid);
      insertPublicationItems(id, input.items, stamp);
      return id;
    })();
    audit(request, "publication.publish", "publication", publicationId, {
      week: input.week,
      itemCount: input.items.length,
    });
    let pdfWarning: string | null = null;
    try {
      await generatePublicationPdf(publicationId);
    } catch (error) {
      console.error("PDF generation failed", error);
      pdfWarning = "发布成功，但 PDF 尚未生成；请安装 Chromium 后重新生成";
    }
    response.status(201).json({ id: publicationId, pdfWarning });
  }),
);

publicationsRouter.get("/:id", requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  const publication = sqlite
    .prepare(
      `SELECT id, academic_year AS academicYear, semester, week, version, status, title,
       published_at AS publishedAt FROM weekly_publications WHERE id=?`,
    )
    .get(id);
  if (!publication) throw new HttpError(404, "发布版本不存在");
  const items = sqlite
    .prepare(
      `SELECT source_submission_id AS sourceSubmissionId, source_item_id AS sourceItemId,
       type, name, start_time AS startTime, end_time AS endTime, location, participants,
       department, remark, sort_order AS sortOrder
       FROM publication_items WHERE publication_id=? ORDER BY sort_order, id`,
    )
    .all(id);
  response.json({ ...publication, items });
});

publicationsRouter.patch(
  "/:id",
  requireAdmin,
  asyncRoute(async (request, response) => {
    const id = Number(request.params.id);
    const input = publicationUpdateSchema.parse(request.body);
    const exists = sqlite.prepare("SELECT id FROM weekly_publications WHERE id=?").get(id);
    if (!exists) throw new HttpError(404, "发布版本不存在");
    const stamp = nowIso();
    sqlite.transaction(() => {
      sqlite.prepare("UPDATE weekly_publications SET title=?, updated_at=? WHERE id=?").run(input.title, stamp, id);
      sqlite.prepare("DELETE FROM publication_items WHERE publication_id=?").run(id);
      insertPublicationItems(id, input.items, stamp);
    })();
    audit(request, "publication.update", "publication", id, { itemCount: input.items.length });
    let pdfWarning: string | null = null;
    try {
      await generatePublicationPdf(id);
    } catch (error) {
      console.error("PDF regeneration failed", error);
      pdfWarning = "内容已保存，但 PDF 重新生成失败，请稍后重试";
    }
    response.json({ id, pdfWarning });
  }),
);

publicationsRouter.delete("/:id", requireAdmin, (request, response) => {
  const id = Number(request.params.id);
  const publication = sqlite
    .prepare(
      `SELECT id, academic_year AS academicYear, semester, week, version, status,
       pdf_path AS pdfPath FROM weekly_publications WHERE id=?`,
    )
    .get(id) as
    | {
        id: number;
        academicYear: string;
        semester: string;
        week: number;
        version: number;
        status: string;
        pdfPath: string | null;
      }
    | undefined;
  if (!publication) throw new HttpError(404, "发布版本不存在");
  sqlite.prepare("DELETE FROM weekly_publications WHERE id=?").run(id);
  if (publication.pdfPath) {
    const mobilePath = mobilePdfPath(publication.pdfPath);
    for (const filePath of [
      publication.pdfPath,
      publication.pdfPath.replace(/\.pdf$/i, ".html"),
      mobilePath,
      mobilePath.replace(/\.pdf$/i, ".html"),
    ]) {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (error) {
        console.error("Publication file cleanup failed", error);
      }
    }
  }
  audit(request, "publication.delete", "publication", id, {
    week: publication.week,
    version: publication.version,
  });
  response.json({ ok: true });
});

publicationsRouter.get("/:id/preview", (request, response) => {
  const id = Number(request.params.id);
  const exists = sqlite.prepare("SELECT id FROM weekly_publications WHERE id=?").get(id);
  if (!exists) throw new HttpError(404, "发布版本不存在");
  response.type("html").send(publicationHtml(id));
});

publicationsRouter.post(
  "/:id/regenerate-pdf",
  requireAdmin,
  asyncRoute(async (request, response) => {
    const id = Number(request.params.id);
    await generatePublicationPdf(id);
    audit(request, "publication.pdf_regenerate", "publication", id);
    response.json({ ok: true });
  }),
);

publicationsRouter.get("/:id/pdf", (request, response) => {
  const publication = sqlite
    .prepare(
      "SELECT week, version, pdf_path AS pdfPath FROM weekly_publications WHERE id=? AND status IN ('published','superseded')",
    )
    .get(Number(request.params.id)) as
    | { week: number; version: number; pdfPath: string | null }
    | undefined;
  if (!publication) throw new HttpError(404, "发布版本不存在");
  if (!publication.pdfPath || !fs.existsSync(publication.pdfPath)) {
    throw new HttpError(409, "该版本的 PDF 尚未生成");
  }
  response.download(
    publication.pdfPath,
    `${config.organizationName}-${weekLabel(publication.week)}工作安排-V${publication.version}-电脑版.pdf`,
  );
});

publicationsRouter.get(
  "/:id/mobile-pdf",
  asyncRoute(async (request, response) => {
    const id = Number(request.params.id);
    const publication = sqlite
      .prepare(
        "SELECT week, version, pdf_path AS pdfPath FROM weekly_publications WHERE id=? AND status IN ('published','superseded')",
      )
      .get(id) as
      | { week: number; version: number; pdfPath: string | null }
      | undefined;
    if (!publication) throw new HttpError(404, "发布版本不存在");
    if (!publication.pdfPath) throw new HttpError(409, "该版本的 PDF 尚未生成");
    let filePath = mobilePdfPath(publication.pdfPath);
    if (!fs.existsSync(filePath)) {
      const generated = await generatePublicationPdf(id);
      filePath = generated.mobilePdfPath;
    }
    response.download(
      filePath,
      `${config.organizationName}-${weekLabel(publication.week)}工作安排-V${publication.version}-手机版.pdf`,
    );
  }),
);
