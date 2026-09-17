import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("administrator management permissions", () => {
  const databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-schedule-admin-test-"));
  const databasePath = path.join(databaseDirectory, "meeting-schedule.sqlite");
  let agent: ReturnType<typeof request.agent>;
  let csrfToken = "";
  let closeDatabase: (() => void) | undefined;
  let sqlite: typeof import("../apps/server/src/db/client.js")["sqlite"];
  let verifyPassword: typeof import("../apps/server/src/services/password.js")["verifyPassword"];

  beforeAll(async () => {
    process.env.DATABASE_PATH = databasePath;
    process.env.SESSION_SECRET = "admin-management-test-secret";
    process.env.SEED_ADMIN_PASSWORD = "TestOnly-Admin-2026!";
    process.env.SEED_STAFF_PASSWORD = "TestOnly-Staff-2026!";
    process.env.EMAIL_ALLOWED_DOMAIN = "example.org";
    process.env.NODE_ENV = "test";

    await import("../apps/server/src/db/seed.js");
    const [{ createApp }, database, passwordService] = await Promise.all([
      import("../apps/server/src/app.js"),
      import("../apps/server/src/db/client.js"),
      import("../apps/server/src/services/password.js"),
    ]);
    const { hashPassword } = passwordService;
    verifyPassword = passwordService.verifyPassword;
    sqlite = database.sqlite;
    closeDatabase = () => sqlite.close();
    const stamp = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO users(username, password_hash, name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, 'admin', 'active', ?, ?)`,
      )
      .run("business-admin", hashPassword("BusinessAdmin@2026"), "业务管理员", stamp, stamp);
    agent = request.agent(createApp());

    const csrf = await agent.get("/api/auth/csrf").expect(200);
    await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ username: "business-admin", password: "BusinessAdmin@2026" })
      .expect(200);
    csrfToken = (await agent.get("/api/auth/csrf").expect(200)).body.csrfToken;
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(databaseDirectory, { recursive: true, force: true });
  });

  it("allows a regular administrator to open all system management data", async () => {
    await agent.get("/api/admin/users").expect(200);
    await agent.get("/api/admin/reference-data").expect(200);
    await agent.get("/api/admin/schedule-settings").expect(200);
  });

  it("prevents a regular administrator from changing a system administrator", async () => {
    const systemAdmin = sqlite
      .prepare("SELECT id, username, name FROM users WHERE role='system_admin' LIMIT 1")
      .get() as { id: number; username: string; name: string };
    await agent
      .patch(`/api/admin/users/${systemAdmin.id}`)
      .set("x-csrf-token", csrfToken)
      .send({
        username: systemAdmin.username,
        name: systemAdmin.name,
        role: "admin",
        status: "active",
        departmentId: null,
      })
      .expect(403);
  });

  it("allows an administrator to create users within their role boundary", async () => {
    const created = await agent
      .post("/api/admin/users")
      .set("x-csrf-token", csrfToken)
      .send({
        username: "new-staff",
        name: "新增填报员",
        email: "new-staff@example.org",
        password: "NewStaff@2026",
        role: "staff",
        status: "active",
        departmentId: 1,
      })
      .expect(201);

    const saved = sqlite
      .prepare("SELECT username, email, password_hash, role, status, department_id FROM users WHERE id=?")
      .get(created.body.id) as {
      username: string;
      email: string;
      password_hash: string;
      role: string;
      status: string;
      department_id: number;
    };
    expect(saved).toMatchObject({
      username: "new-staff",
      email: "new-staff@example.org",
      role: "staff",
      status: "active",
      department_id: 1,
    });
    expect(verifyPassword("NewStaff@2026", saved.password_hash)).toBe(true);

    await agent
      .post("/api/admin/users")
      .set("x-csrf-token", csrfToken)
      .send({
        username: "new-staff",
        name: "重复账号",
        email: "another@example.org",
        password: "NewStaff@2026",
        role: "staff",
        status: "active",
        departmentId: 1,
      })
      .expect(409);

    await agent
      .post("/api/admin/users")
      .set("x-csrf-token", csrfToken)
      .send({
        username: "another-system-admin",
        name: "越权账号",
        email: "system-admin@example.org",
        password: "SystemAdmin@2026",
        role: "system_admin",
        status: "active",
        departmentId: null,
      })
      .expect(403);

    await agent
      .post("/api/admin/users")
      .set("x-csrf-token", csrfToken)
      .send({
        username: "external-email",
        name: "外部邮箱",
        email: "someone@outside.example",
        password: "External@2026",
        role: "staff",
        status: "active",
        departmentId: 1,
      })
      .expect(422);
  });

  it("queues an email notification when a bound user's submission is returned", async () => {
    const stamp = new Date().toISOString();
    const applicant = sqlite
      .prepare("SELECT id FROM users WHERE username='new-staff'")
      .get() as { id: number };
    const submissionId = Number(
      sqlite
        .prepare(
          `INSERT INTO submissions(
           academic_year, semester, week, department_id, applicant_user_id,
           status, submitted_at, created_at, updated_at
           ) VALUES ('2026-2027', '一', 3, 1, ?, 'submitted', ?, ?, ?)`,
        )
        .run(applicant.id, stamp, stamp, stamp).lastInsertRowid,
    );

    await agent
      .post(`/api/admin/reviews/${submissionId}/return`)
      .set("x-csrf-token", csrfToken)
      .send({ comment: "请补充参加人员信息" })
      .expect(200);

    const notification = sqlite
      .prepare(
        `SELECT recipient, subject, text_body AS textBody, status, attempts
         FROM email_notifications WHERE submission_id=?`,
      )
      .get(submissionId) as {
      recipient: string;
      subject: string;
      textBody: string;
      status: string;
      attempts: number;
    };
    expect(notification.recipient).toBe("new-staff@example.org");
    expect(notification.subject).toContain("第3周填报已退回");
    expect(notification.textBody).toContain("请补充参加人员信息");
    expect(notification).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("deletes unused users and reference data but preserves referenced data", async () => {
    const stamp = new Date().toISOString();
    const userId = Number(
      sqlite
        .prepare(
          `INSERT INTO users(username, password_hash, name, role, status, created_at, updated_at)
           VALUES ('unused-user', 'unused-hash', '未使用账号', 'staff', 'active', ?, ?)`,
        )
        .run(stamp, stamp).lastInsertRowid,
    );
    await agent.delete(`/api/admin/users/${userId}`).set("x-csrf-token", csrfToken).expect(200);
    expect(sqlite.prepare("SELECT id FROM users WHERE id=?").get(userId)).toBeUndefined();

    const department = await agent
      .post("/api/admin/departments")
      .set("x-csrf-token", csrfToken)
      .send({ name: "临时测试部门", sortOrder: 999, enabled: true })
      .expect(201);
    await agent
      .delete(`/api/admin/departments/${department.body.id}`)
      .set("x-csrf-token", csrfToken)
      .expect(200);

    const location = await agent
      .post("/api/admin/locations")
      .set("x-csrf-token", csrfToken)
      .send({ name: "临时测试地点", capacity: 20, sortOrder: 999, enabled: true })
      .expect(201);
    await agent
      .delete(`/api/admin/locations/${location.body.id}`)
      .set("x-csrf-token", csrfToken)
      .expect(200);

    await agent.delete("/api/admin/departments/1").set("x-csrf-token", csrfToken).expect(409);
  });

  it("allows an administrator to delete another user's draft", async () => {
    const stamp = new Date().toISOString();
    const applicant = sqlite.prepare("SELECT id FROM users WHERE role='staff' LIMIT 1").get() as {
      id: number;
    };
    const draftId = Number(
      sqlite
        .prepare(
          `INSERT INTO submissions(
            academic_year, semester, week, department_id, applicant_user_id,
            status, created_at, updated_at
          ) VALUES ('2026-2027', '一', 1, 1, ?, 'draft', ?, ?)`,
        )
        .run(applicant.id, stamp, stamp).lastInsertRowid,
    );

    await agent
      .delete(`/api/submissions/${draftId}`)
      .set("x-csrf-token", csrfToken)
      .expect(200);
    expect(sqlite.prepare("SELECT id FROM submissions WHERE id=?").get(draftId)).toBeUndefined();
  });

  it("deletes the current publication without republishing the preceding version", async () => {
    const stamp = new Date().toISOString();
    const insert = sqlite.prepare(
      `INSERT INTO weekly_publications(
       academic_year, semester, week, version, status, title, published_at, created_at, updated_at
       ) VALUES ('2026-2027', '一', 20, ?, ?, '删除测试', ?, ?, ?)`,
    );
    const previousId = Number(insert.run(1, "superseded", stamp, stamp, stamp).lastInsertRowid);
    const currentId = Number(insert.run(2, "published", stamp, stamp, stamp).lastInsertRowid);

    await agent.delete(`/api/publications/${currentId}`).set("x-csrf-token", csrfToken).expect(200);

    expect(sqlite.prepare("SELECT id FROM weekly_publications WHERE id=?").get(currentId)).toBeUndefined();
    expect(
      (sqlite.prepare("SELECT status FROM weekly_publications WHERE id=?").get(previousId) as { status: string })
        .status,
    ).toBe("superseded");
  });
});
