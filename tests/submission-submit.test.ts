import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("submission submit endpoint", () => {
  const databaseDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "meeting-schedule-test-"));
  const databasePath = path.join(databaseDirectory, "meeting-schedule.sqlite");
  let agent: ReturnType<typeof request.agent>;
  let otherDepartmentAgent: ReturnType<typeof request.agent>;
  let closeDatabase: (() => void) | undefined;

  beforeAll(async () => {
    process.env.DATABASE_PATH = databasePath;
    process.env.SESSION_SECRET = "submission-route-test-secret";
    process.env.SEED_ADMIN_PASSWORD = "TestOnly-Admin-2026!";
    process.env.SEED_STAFF_PASSWORD = "TestOnly-Staff-2026!";
    process.env.NODE_ENV = "test";

    await import("../apps/server/src/db/seed.js");
    const [{ createApp }, { sqlite }] = await Promise.all([
      import("../apps/server/src/app.js"),
      import("../apps/server/src/db/client.js"),
    ]);
    closeDatabase = () => sqlite.close();
    agent = request.agent(createApp());
    otherDepartmentAgent = request.agent(createApp());

    const csrf = await agent.get("/api/auth/csrf").expect(200);
    await agent
      .post("/api/auth/login")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ username: "office", password: "TestOnly-Staff-2026!" })
      .expect(200);
    const otherCsrf = await otherDepartmentAgent.get("/api/auth/csrf").expect(200);
    await otherDepartmentAgent
      .post("/api/auth/login")
      .set("x-csrf-token", otherCsrf.body.csrfToken)
      .send({ username: "academic", password: "TestOnly-Staff-2026!" })
      .expect(200);
  });

  afterAll(() => {
    closeDatabase?.();
    fs.rmSync(databaseDirectory, { recursive: true, force: true });
  });

  it("treats submitting an already submitted application as success", async () => {
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const created = await agent
      .post("/api/submissions")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        week: 1,
        departmentId: 1,
        customDepartment: null,
        applicantRemark: "",
        items: [
          {
            type: "meeting",
            name: "重复提交验证会议",
            startTime: "2026-09-07T09:00",
            endTime: "2026-09-07T10:00",
            locationId: 1,
            customLocation: null,
            participants: "测试人员",
            remark: "验证重复提交时的状态处理",
            sortOrder: 0,
          },
        ],
      })
      .expect(201);

    const firstSubmit = await agent
      .post(`/api/submissions/${created.body.id}/submit`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .expect(200);
    const repeatedSubmit = await agent
      .post(`/api/submissions/${created.body.id}/submit`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .expect(200);

    expect(firstSubmit.body.status).toBe("submitted");
    expect(repeatedSubmit.body.status).toBe("submitted");
  });

  it("warns about time overlaps, blocks location overlaps, and shares read-only results", async () => {
    const payload = {
      week: 1,
      departmentId: 1,
      customDepartment: null,
      applicantRemark: "",
      items: [
        {
          type: "meeting",
          name: "冲突检测基准会议",
          startTime: "2026-09-08T09:00",
          endTime: "2026-09-08T10:00",
          locationId: 1,
          customLocation: null,
          participants: "测试人员",
          remark: "用于验证时间和地点冲突检测",
          sortOrder: 0,
        },
      ],
    };
    const csrf = await agent.get("/api/auth/csrf").expect(200);
    const baseline = await agent
      .post("/api/submissions")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send(payload)
      .expect(201);

    const timeOnlyPayload = {
      ...payload,
      departmentId: 2,
      items: [
        {
          ...payload.items[0],
          name: "仅时间重叠会议",
          startTime: "2026-09-08T09:30",
          endTime: "2026-09-08T10:30",
          locationId: 2,
        },
      ],
    };
    const timeConflicts = await agent
      .post("/api/submissions/conflicts")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ items: timeOnlyPayload.items })
      .expect(200);
    expect(timeConflicts.body.timeConflicts).toHaveLength(1);
    expect(timeConflicts.body.locationConflicts).toHaveLength(0);
    await agent
      .post("/api/submissions")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send(timeOnlyPayload)
      .expect(201);

    const locationConflictPayload = {
      ...payload,
      items: [
        {
          ...payload.items[0],
          name: "同地点重叠会议",
          startTime: "2026-09-08T09:15",
          endTime: "2026-09-08T09:45",
        },
      ],
    };
    const locationConflicts = await agent
      .post("/api/submissions/conflicts")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({ items: locationConflictPayload.items })
      .expect(200);
    expect(locationConflicts.body.locationConflicts).toHaveLength(1);
    await agent
      .post("/api/submissions")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send(locationConflictPayload)
      .expect(409);

    const shared = await otherDepartmentAgent
      .get("/api/submissions?scope=all&pageSize=100")
      .expect(200);
    expect(shared.body.rows.some((row: { id: number }) => row.id === baseline.body.id)).toBe(true);
    const sharedSchedule = await otherDepartmentAgent
      .get("/api/submissions/shared-schedule?week=1")
      .expect(200);
    expect(
      sharedSchedule.body.items.some(
        (item: { submissionId: number; name: string; status: string }) =>
          item.submissionId === baseline.body.id &&
          item.name === "冲突检测基准会议" &&
          item.status === "draft",
      ),
    ).toBe(true);
    await otherDepartmentAgent.get(`/api/submissions/${baseline.body.id}`).expect(200);
    const otherCsrf = await otherDepartmentAgent.get("/api/auth/csrf").expect(200);
    await otherDepartmentAgent
      .delete(`/api/submissions/${baseline.body.id}`)
      .set("x-csrf-token", otherCsrf.body.csrfToken)
      .expect(403);
    await otherDepartmentAgent
      .put(`/api/submissions/${baseline.body.id}`)
      .set("x-csrf-token", otherCsrf.body.csrfToken)
      .send(payload)
      .expect(403);

    const disposable = await agent
      .post("/api/submissions")
      .set("x-csrf-token", csrf.body.csrfToken)
      .send({
        ...payload,
        items: [
          {
            ...payload.items[0],
            name: "待删除草稿",
            startTime: "2026-09-09T14:00",
            endTime: "2026-09-09T15:00",
            locationId: 2,
          },
        ],
      })
      .expect(201);
    await agent
      .delete(`/api/submissions/${disposable.body.id}`)
      .set("x-csrf-token", csrf.body.csrfToken)
      .expect(200);
    await agent.get(`/api/submissions/${disposable.body.id}`).expect(404);
  });
});
