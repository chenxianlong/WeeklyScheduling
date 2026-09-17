import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { nowIso, sqlite } from "../db/client.js";
import { HttpError } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { enqueueEmailVerification } from "../services/email-notifications.js";

export const accountRouter = Router();
accountRouter.use(requireAuth);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("请输入有效的学校邮箱")
  .refine(
    (value) => value.endsWith(`@${config.emailAllowedDomain}`),
    `仅支持 @${config.emailAllowedDomain} 学校邮箱`,
  );

function codeHash(emailId: number, code: string) {
  return createHash("sha256")
    .update(`${emailId}:${code}:${config.sessionSecret}`)
    .digest("hex");
}

accountRouter.get("/emails", (request, response) => {
  const rows = sqlite
    .prepare(
      `SELECT id, email, verified_at AS verifiedAt, verification_expires_at AS verificationExpiresAt,
       created_at AS createdAt FROM user_emails WHERE user_id=? ORDER BY id`,
    )
    .all(request.currentUser!.id);
  response.json({ rows, allowedDomain: config.emailAllowedDomain, maxEmails: 5 });
});

accountRouter.post("/emails", (request, response) => {
  const email = emailSchema.parse(request.body.email);
  const userId = request.currentUser!.id;
  const count = sqlite
    .prepare("SELECT COUNT(*) AS count FROM user_emails WHERE user_id=?")
    .get(userId) as { count: number };
  const existing = sqlite
    .prepare(
      `SELECT id, user_id AS userId, verified_at AS verifiedAt, updated_at AS updatedAt
       FROM user_emails WHERE email=? COLLATE NOCASE`,
    )
    .get(email) as
    | { id: number; userId: number; verifiedAt: string | null; updatedAt: string }
    | undefined;
  if (existing && existing.userId !== userId) throw new HttpError(409, "该邮箱已绑定其他账号");
  if (existing?.verifiedAt) throw new HttpError(409, "该邮箱已经完成绑定");
  if (!existing && count.count >= 5) throw new HttpError(409, "每个账号最多绑定 5 个邮箱");
  if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 60_000) {
    throw new HttpError(429, "验证码发送过于频繁，请稍后再试");
  }

  const stamp = nowIso();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  let emailId = existing?.id;
  sqlite.transaction(() => {
    if (emailId) {
      sqlite
        .prepare(
          `UPDATE user_emails SET verification_token_hash=?, verification_expires_at=?,
           updated_at=? WHERE id=?`,
        )
        .run(codeHash(emailId, code), expiresAt, stamp, emailId);
    } else {
      const result = sqlite
        .prepare(
          `INSERT INTO user_emails(user_id, email, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(userId, email, stamp, stamp);
      emailId = Number(result.lastInsertRowid);
      sqlite
        .prepare(
          `UPDATE user_emails SET verification_token_hash=?, verification_expires_at=? WHERE id=?`,
        )
        .run(codeHash(emailId, code), expiresAt, emailId);
    }
    enqueueEmailVerification({
      emailId: emailId!,
      recipient: email,
      name: request.currentUser!.name,
      code,
    });
  })();
  audit(request, "account.email.request", "user_email", emailId!, { email });
  response.status(202).json({ id: emailId, email, expiresAt });
});

accountRouter.post("/emails/:id/verify", (request, response) => {
  const id = Number(request.params.id);
  const code = z.string().regex(/^\d{6}$/, "请输入 6 位验证码").parse(request.body.code);
  const row = sqlite
    .prepare(
      `SELECT id, email, verification_token_hash AS tokenHash,
       verification_expires_at AS expiresAt, verified_at AS verifiedAt
       FROM user_emails WHERE id=? AND user_id=?`,
    )
    .get(id, request.currentUser!.id) as
    | { id: number; email: string; tokenHash: string | null; expiresAt: string | null; verifiedAt: string | null }
    | undefined;
  if (!row) throw new HttpError(404, "邮箱记录不存在");
  if (row.verifiedAt) return response.json({ ok: true });
  if (!row.tokenHash || !row.expiresAt || row.expiresAt < nowIso()) {
    throw new HttpError(410, "验证码已过期，请重新发送");
  }
  const expected = Buffer.from(row.tokenHash, "hex");
  const actual = Buffer.from(codeHash(id, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new HttpError(422, "验证码不正确");
  }
  const stamp = nowIso();
  sqlite
    .prepare(
      `UPDATE user_emails SET verified_at=?, verification_token_hash=NULL,
       verification_expires_at=NULL, updated_at=? WHERE id=?`,
    )
    .run(stamp, stamp, id);
  audit(request, "account.email.verify", "user_email", id, { email: row.email });
  response.json({ ok: true });
});

accountRouter.delete("/emails/:id", (request, response) => {
  const id = Number(request.params.id);
  const row = sqlite
    .prepare("SELECT email FROM user_emails WHERE id=? AND user_id=?")
    .get(id, request.currentUser!.id) as { email: string } | undefined;
  if (!row) throw new HttpError(404, "邮箱记录不存在");
  sqlite.prepare("DELETE FROM user_emails WHERE id=?").run(id);
  audit(request, "account.email.delete", "user_email", id, { email: row.email });
  response.json({ ok: true });
});
