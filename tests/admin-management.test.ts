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

  beforeAll(async () => {
    process.env.DATABASE_PATH = databasePath;
    process.env.SESSION_SECRET = "admin-management-test-secret";
    process.env.SEED_ADMIN_PASSWORD = "TestOnly-Admin-2026!";
    process.env.SEED_STAFF_PASSWORD = "TestOnly-Staff-2026!";
    process.env.NODE_ENV = "test";

    await import("../apps/server/src/db/seed.js");
    const [{ createApp }, database, { hashPassword }] = await Promise.all([
      import("../apps/server/src/app.js"),
      import("../apps/server/src/db/client.js"),
      import("../apps/server/src/services/password.js"),
    ]);
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
