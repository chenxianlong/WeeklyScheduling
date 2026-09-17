import { Router } from "express";
import { z } from "zod";
import { roleSchema } from "../../../../packages/shared/src/index.js";
import { nowIso, sqlite } from "../db/client.js";
import { HttpError } from "../http.js";
import { requireAdmin } from "../middleware/auth.js";
import { audit } from "../services/audit.js";
import { hashPassword } from "../services/password.js";
import { getScheduleSettings } from "../services/schedule-settings.js";
import { config } from "../config.js";

export const adminRouter = Router();
adminRouter.use(requireAdmin);

adminRouter.get("/audit-logs", (request, response) => {
  const page = Math.max(1, Number(request.query.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(request.query.pageSize) || 30));
  const rows = sqlite
    .prepare(
      `SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId,
       a.detail_json AS detailJson, a.ip_address AS ipAddress, a.created_at AS createdAt,
       u.name AS userName
       FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
       ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    )
    .all(pageSize, (page - 1) * pageSize);
  const total = (sqlite.prepare("SELECT COUNT(*) AS count FROM audit_logs").get() as { count: number })
    .count;
  response.json({ rows, page, pageSize, total });
});

adminRouter.get("/users", (_request, response) => {
  const rows = sqlite
    .prepare(
      `SELECT u.id, u.username, u.name, u.email, u.avatar, u.role, u.status,
       u.department_id AS departmentId, u.last_login_at AS lastLoginAt, d.name AS department
       FROM users u LEFT JOIN departments d ON d.id=u.department_id ORDER BY u.id`,
    )
    .all();
  response.json({ rows });
});

const userFieldsSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "登录账号至少 3 个字符")
    .max(50)
    .regex(/^[a-z0-9._-]+$/, "登录账号只能包含小写字母、数字、点、下划线和连字符"),
  name: z.string().trim().min(1, "请填写姓名").max(50),
  email: z
    .union([z.literal(""), z.string().trim().toLowerCase().email("请输入有效的邮箱地址")])
    .nullable()
    .optional()
    .transform((value) => value || null)
    .refine(
      (value) => !value || value.endsWith(`@${config.emailAllowedDomain}`),
      `仅支持 @${config.emailAllowedDomain} 邮箱`,
    ),
  role: roleSchema,
  status: z.enum(["active", "disabled"]),
  departmentId: z.number().int().positive().nullable().optional(),
});

const userCreateSchema = userFieldsSchema.extend({
  password: z.string().min(8, "密码至少 8 个字符").max(128),
});

const userUpdateSchema = userFieldsSchema.extend({
  password: z.string().min(8, "密码至少 8 个字符").max(128).optional(),
});

adminRouter.post("/users", (request, response) => {
  const input = userCreateSchema.parse(request.body);
  if (request.currentUser!.role === "admin" && input.role === "system_admin") {
    throw new HttpError(403, "管理员不能授予系统管理员角色");
  }
  const duplicate = sqlite
    .prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE")
    .get(input.username);
  if (duplicate) throw new HttpError(409, "该登录账号已被使用");
  if (
    input.email &&
    sqlite.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE").get(input.email)
  ) {
    throw new HttpError(409, "该邮箱已绑定其他账号");
  }
  if (input.departmentId) {
    const department = sqlite
      .prepare("SELECT id FROM departments WHERE id=? AND enabled=1")
      .get(input.departmentId);
    if (!department) throw new HttpError(400, "所选部门不存在或已停用");
  }
  const stamp = nowIso();
  const result = sqlite
    .prepare(
      `INSERT INTO users(
       username, password_hash, name, email, role, status, department_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.username,
      hashPassword(input.password),
      input.name,
      input.email,
      input.role,
      input.status,
      input.departmentId ?? null,
      stamp,
      stamp,
    );
  const id = Number(result.lastInsertRowid);
  audit(request, "user.create", "user", id, {
    username: input.username,
    name: input.name,
    email: input.email,
    role: input.role,
    status: input.status,
    departmentId: input.departmentId ?? null,
  });
  response.status(201).json({ id });
});

adminRouter.patch("/users/:id", (request, response) => {
  const id = Number(request.params.id);
  const input = userUpdateSchema.parse(request.body);
  const target = sqlite.prepare("SELECT id, role FROM users WHERE id=?").get(id) as
    | { id: number; role: "staff" | "admin" | "system_admin" }
    | undefined;
  if (!target) throw new HttpError(404, "用户不存在");
  if (request.currentUser!.role === "admin" && (target.role === "system_admin" || input.role === "system_admin")) {
    throw new HttpError(403, "管理员不能修改系统管理员账号或授予系统管理员角色");
  }
  if (
    id === request.currentUser!.id &&
    (input.role !== request.currentUser!.role || input.status !== "active")
  ) {
    throw new HttpError(409, "不能停用自己或修改自己的管理员角色");
  }
  const duplicate = sqlite
    .prepare("SELECT id FROM users WHERE username=? COLLATE NOCASE AND id<>?")
    .get(input.username, id);
  if (duplicate) throw new HttpError(409, "该登录账号已被使用");
  if (
    input.email &&
    sqlite.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE AND id<>?").get(input.email, id)
  ) {
    throw new HttpError(409, "该邮箱已绑定其他账号");
  }
  const stamp = nowIso();
  const result = input.password
    ? sqlite
        .prepare(
          `UPDATE users SET username=?, name=?, email=?, role=?, status=?, department_id=?,
           password_hash=?, updated_at=? WHERE id=?`,
        )
        .run(
          input.username,
          input.name,
          input.email,
          input.role,
          input.status,
          input.departmentId ?? null,
          hashPassword(input.password),
          stamp,
          id,
        )
    : sqlite
        .prepare(
          `UPDATE users SET username=?, name=?, email=?, role=?, status=?, department_id=?,
           updated_at=? WHERE id=?`,
        )
        .run(
          input.username,
          input.name,
          input.email,
          input.role,
          input.status,
          input.departmentId ?? null,
          stamp,
          id,
        );
  if (!result.changes) throw new HttpError(404, "用户不存在");
  audit(request, "user.update", "user", id, {
    ...input,
    password: input.password ? "[已修改]" : undefined,
  });
  response.json({ ok: true });
});

adminRouter.delete("/users/:id", (request, response) => {
  const id = Number(request.params.id);
  if (id === request.currentUser!.id) throw new HttpError(409, "不能删除当前登录账号");
  const target = sqlite.prepare("SELECT id, role, username FROM users WHERE id=?").get(id) as
    | { id: number; role: "staff" | "admin" | "system_admin"; username: string }
    | undefined;
  if (!target) throw new HttpError(404, "用户不存在");
  if (request.currentUser!.role === "admin" && target.role === "system_admin") {
    throw new HttpError(403, "管理员不能删除系统管理员账号");
  }
  const references = sqlite
    .prepare(
      `SELECT
       (SELECT COUNT(*) FROM submissions WHERE applicant_user_id=? OR approved_by=? OR returned_by=?) +
       (SELECT COUNT(*) FROM review_logs WHERE operator_user_id=?) +
       (SELECT COUNT(*) FROM weekly_publications WHERE published_by=?) +
       (SELECT COUNT(*) FROM audit_logs WHERE user_id=?) +
       (SELECT COUNT(*) FROM app_settings WHERE updated_by=?) AS count`,
    )
    .get(id, id, id, id, id, id, id) as { count: number };
  if (references.count > 0) {
    throw new HttpError(409, "该账号已有业务或审计记录，不能删除；如不再使用，请将账号停用");
  }
  sqlite.prepare("DELETE FROM users WHERE id=?").run(id);
  audit(request, "user.delete", "user", id, { username: target.username });
  response.json({ ok: true });
});

adminRouter.get("/schedule-settings", (_request, response) => {
  response.json(getScheduleSettings());
});

const scheduleSettingSchema = z
  .object({
    academicYear: z
      .string()
      .regex(/^\d{4}-\d{4}$/, "请选择有效的学年"),
    semester: z.enum(["一", "二"], "请选择有效的学期"),
    preWeekStartDate: z.iso.date("请选择有效的开学预备周开始日期"),
    firstWeekStartDate: z.iso.date("请选择有效的第一周开始日期"),
  })
  .superRefine((value, context) => {
    const [startYear, endYear] = value.academicYear.split("-").map(Number);
    if (endYear !== startYear + 1) {
      context.addIssue({
        code: "custom",
        path: ["academicYear"],
        message: "学年格式无效",
      });
    }
    if (value.preWeekStartDate >= value.firstWeekStartDate) {
      context.addIssue({
        code: "custom",
        path: ["firstWeekStartDate"],
        message: "开学预备周开始日期必须早于第一周开始日期",
      });
    }
  });

adminRouter.patch("/schedule-settings", (request, response) => {
  const input = scheduleSettingSchema.parse(request.body);
  const stamp = nowIso();
  const upsert = sqlite.prepare(
    `INSERT INTO app_settings(key, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value=excluded.value,
       updated_by=excluded.updated_by,
       updated_at=excluded.updated_at`,
  );
  sqlite.transaction(() => {
    upsert.run("academic_year", input.academicYear, request.currentUser!.id, stamp);
    upsert.run("semester", input.semester, request.currentUser!.id, stamp);
    upsert.run("pre_week_start_date", input.preWeekStartDate, request.currentUser!.id, stamp);
    upsert.run("first_week_start_date", input.firstWeekStartDate, request.currentUser!.id, stamp);
  })();
  audit(request, "schedule_settings.update", "app_settings", undefined, input);
  response.json(getScheduleSettings());
});

adminRouter.get("/reference-data", (_request, response) => {
  response.json({
    departments: sqlite
      .prepare("SELECT id, name, sort_order AS sortOrder, enabled FROM departments ORDER BY sort_order, id")
      .all(),
    locations: sqlite
      .prepare(
        "SELECT id, name, capacity, sort_order AS sortOrder, enabled FROM locations ORDER BY sort_order, id",
      )
      .all(),
  });
});

const referenceSchema = z.object({
  name: z.string().trim().min(1).max(191),
  capacity: z.number().int().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true),
});

for (const [route, table] of [
  ["departments", "departments"],
  ["locations", "locations"],
] as const) {
  adminRouter.post(`/${route}`, (request, response) => {
    const input = referenceSchema.parse(request.body);
    const stamp = nowIso();
    const result =
      table === "locations"
        ? sqlite
            .prepare(
              "INSERT INTO locations(name, capacity, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(input.name, input.capacity ?? null, input.sortOrder, input.enabled ? 1 : 0, stamp, stamp)
        : sqlite
            .prepare(
              "INSERT INTO departments(name, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
            .run(input.name, input.sortOrder, input.enabled ? 1 : 0, stamp, stamp);
    audit(request, `${table}.create`, table, Number(result.lastInsertRowid), input);
    response.status(201).json({ id: Number(result.lastInsertRowid) });
  });

  adminRouter.patch(`/${route}/:id`, (request, response) => {
    const id = Number(request.params.id);
    const input = referenceSchema.parse(request.body);
    const result =
      table === "locations"
        ? sqlite
            .prepare(
              "UPDATE locations SET name=?, capacity=?, sort_order=?, enabled=?, updated_at=? WHERE id=?",
            )
            .run(input.name, input.capacity ?? null, input.sortOrder, input.enabled ? 1 : 0, nowIso(), id)
        : sqlite
            .prepare(
              "UPDATE departments SET name=?, sort_order=?, enabled=?, updated_at=? WHERE id=?",
            )
            .run(input.name, input.sortOrder, input.enabled ? 1 : 0, nowIso(), id);
    if (!result.changes) throw new HttpError(404, "基础数据不存在");
    audit(request, `${table}.update`, table, id, input);
    response.json({ ok: true });
  });

  adminRouter.delete(`/${route}/:id`, (request, response) => {
    const id = Number(request.params.id);
    const item = sqlite.prepare(`SELECT id, name FROM ${table} WHERE id=?`).get(id) as
      | { id: number; name: string }
      | undefined;
    if (!item) throw new HttpError(404, "基础数据不存在");
    const references =
      table === "departments"
        ? (sqlite
            .prepare(
              `SELECT (SELECT COUNT(*) FROM users WHERE department_id=?) +
               (SELECT COUNT(*) FROM submissions WHERE department_id=?) AS count`,
            )
            .get(id, id) as { count: number })
        : (sqlite
            .prepare("SELECT COUNT(*) AS count FROM submission_items WHERE location_id=?")
            .get(id) as { count: number });
    if (references.count > 0) {
      throw new HttpError(409, `该${table === "departments" ? "部门" : "地点"}已有业务记录，不能删除；如不再使用，请将其停用`);
    }
    sqlite.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
    audit(request, `${table}.delete`, table, id, { name: item.name });
    response.json({ ok: true });
  });
}
