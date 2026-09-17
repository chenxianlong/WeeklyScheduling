import nodemailer from "nodemailer";
import { config } from "../config.js";
import { nowIso, sqlite } from "../db/client.js";

type ReturnNotification = {
  submissionId: number;
  reviewLogId: number;
  recipients: string[];
  applicantName: string;
  academicYear: string;
  semester: string;
  week: number;
  department: string;
  reason: string;
};

type QueuedEmail = {
  id: number;
  recipient: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attempts: number;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function enqueueReturnNotification(input: ReturnNotification) {
  const subject = `【周工作安排】第${input.week}周填报已退回修改`;
  const detailUrl = `${config.appUrl.replace(/\/$/, "")}/submissions/${input.submissionId}`;
  const term = `${input.academicYear}学年度第${input.semester}学期`;
  const textBody = `${input.applicantName}，您好：\n\n您提交的${term}第${input.week}周工作安排（${input.department}）已被管理员退回。\n\n退回原因：${input.reason}\n\n请登录系统查看并修改后重新提交：${detailUrl}\n\n${config.organizationName}周工作安排系统`;
  const htmlBody = `
    <div style="font-family:'Microsoft YaHei',Arial,sans-serif;color:#1e293b;line-height:1.8;max-width:640px;margin:auto">
      <h2 style="color:#8a1c22">周工作安排填报退回通知</h2>
      <p>${escapeHtml(input.applicantName)}，您好：</p>
      <p>您提交的 <strong>${escapeHtml(term)}第${input.week}周工作安排</strong>（${escapeHtml(input.department)}）已被管理员退回。</p>
      <div style="background:#fff7ed;border-left:4px solid #c2410c;padding:12px 16px;margin:20px 0">
        <strong>退回原因：</strong><br>${escapeHtml(input.reason).replaceAll("\n", "<br>")}
      </div>
      <p><a href="${escapeHtml(detailUrl)}" style="display:inline-block;background:#8a1c22;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px">查看并修改填报</a></p>
      <p style="margin-top:28px;color:#64748b;font-size:13px">此邮件由${escapeHtml(config.organizationName)}周工作安排系统自动发送，请勿直接回复。</p>
    </div>`;
  for (const recipient of input.recipients) {
    queueEmail({
      submissionId: input.submissionId,
      dedupeKey: `return:${input.reviewLogId}:${recipient}`,
      recipient,
      subject,
      textBody,
      htmlBody,
    });
  }
}

function queueEmail(input: {
  submissionId?: number;
  dedupeKey: string;
  recipient: string;
  subject: string;
  textBody: string;
  htmlBody: string;
}) {
  const stamp = nowIso();
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO email_notifications(
       submission_id, review_log_id, dedupe_key, recipient, subject, text_body, html_body,
       status, attempts, next_attempt_at, created_at, updated_at
       ) VALUES (?, NULL, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)`,
    )
    .run(
      input.submissionId ?? null,
      input.dedupeKey,
      input.recipient,
      input.subject,
      input.textBody,
      input.htmlBody,
      stamp,
      stamp,
      stamp,
    );
}

export function enqueueEmailVerification(input: {
  emailId: number;
  recipient: string;
  name: string;
  code: string;
}) {
  const subject = "【周工作安排】验证您的学校邮箱";
  const textBody = `${input.name}，您好：\n\n您的邮箱验证码是：${input.code}\n\n验证码 15 分钟内有效。如非本人操作，请忽略本邮件。\n\n${schoolName}周工作安排系统`;
  const htmlBody = `<div style="font-family:'Microsoft YaHei',Arial,sans-serif;color:#1e293b;line-height:1.8;max-width:640px;margin:auto"><h2 style="color:#8a1c22">验证学校邮箱</h2><p>${escapeHtml(input.name)}，您好：</p><p>您的邮箱验证码是：</p><p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#8a1c22">${input.code}</p><p>验证码 15 分钟内有效。如非本人操作，请忽略本邮件。</p><p style="color:#64748b;font-size:13px">${schoolName}周工作安排系统</p></div>`;
  queueEmail({
    dedupeKey: `verify:${input.emailId}:${Date.now()}`,
    recipient: input.recipient,
    subject,
    textBody,
    htmlBody,
  });
}

const smtpConfigured = Boolean(
  config.smtp.host && config.smtp.port && config.smtp.user && config.smtp.password && config.smtp.from,
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    })
  : null;

let processing = false;

export async function processEmailQueue() {
  if (!transporter || processing) return;
  processing = true;
  try {
    const stamp = nowIso();
    const rows = sqlite
      .prepare(
        `SELECT id, recipient, subject, text_body AS textBody, html_body AS htmlBody, attempts
         FROM email_notifications
         WHERE status IN ('pending','failed') AND attempts < 5 AND next_attempt_at <= ?
         ORDER BY id LIMIT 10`,
      )
      .all(stamp) as QueuedEmail[];
    for (const row of rows) {
      sqlite
        .prepare("UPDATE email_notifications SET status='sending', updated_at=? WHERE id=?")
        .run(nowIso(), row.id);
      try {
        await transporter.sendMail({
          from: config.smtp.from,
          to: row.recipient,
          subject: row.subject,
          text: row.textBody,
          html: row.htmlBody,
        });
        const sentAt = nowIso();
        sqlite
          .prepare(
            `UPDATE email_notifications SET status='sent', attempts=attempts+1,
             last_error=NULL, sent_at=?, updated_at=? WHERE id=?`,
          )
          .run(sentAt, sentAt, row.id);
      } catch (error) {
        const attempts = row.attempts + 1;
        const nextAttemptAt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
        const message = error instanceof Error ? error.message : String(error);
        sqlite
          .prepare(
            `UPDATE email_notifications SET status='failed', attempts=?, last_error=?,
             next_attempt_at=?, updated_at=? WHERE id=?`,
          )
          .run(attempts, message.slice(0, 1000), nextAttemptAt, nowIso(), row.id);
        console.error(`Email notification ${row.id} failed:`, message);
      }
    }
  } finally {
    processing = false;
  }
}

export function startEmailWorker() {
  if (!transporter) {
    console.warn("Email notifications are queued but SMTP is not configured.");
    return;
  }
  sqlite.prepare("UPDATE email_notifications SET status='pending' WHERE status='sending'").run();
  void processEmailQueue();
  const timer = setInterval(() => void processEmailQueue(), 30_000);
  timer.unref();
}
