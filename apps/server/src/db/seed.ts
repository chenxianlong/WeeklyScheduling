import { nowIso, sqlite } from "./client.js";
import { hashPassword } from "../services/password.js";
import "./migrate.js";

const adminPassword = process.env.SEED_ADMIN_PASSWORD?.trim();
const staffPassword = process.env.SEED_STAFF_PASSWORD?.trim();

if (!adminPassword || adminPassword.length < 12) {
  throw new Error("SEED_ADMIN_PASSWORD must be set to at least 12 characters.");
}
if (!staffPassword || staffPassword.length < 12) {
  throw new Error("SEED_STAFF_PASSWORD must be set to at least 12 characters.");
}

const departmentAccounts = [
  ["行政办公室", "office", "行政办公室填报员"],
  ["教务部门", "academic", "教务部门填报员"],
  ["信息中心", "it-center", "信息中心填报员"],
  ["学生事务中心", "student-affairs", "学生事务中心填报员"],
] as const;

const locations: Array<[string, number | null]> = [
  ["第一会议室", 20],
  ["第二会议室", 60],
  ["报告厅", 300],
  ["多功能厅", 500],
  ["线上会议", null],
];

const stamp = nowIso();
const upsertDepartment = sqlite.prepare(
  `INSERT INTO departments(name, sort_order, enabled, created_at, updated_at)
   VALUES (?, ?, 1, ?, ?)
   ON CONFLICT(name) DO UPDATE SET
     sort_order=excluded.sort_order,
     enabled=1,
     updated_at=excluded.updated_at`,
);
const upsertLocation = sqlite.prepare(
  `INSERT INTO locations(name, capacity, sort_order, enabled, created_at, updated_at)
   VALUES (?, ?, ?, 1, ?, ?)
   ON CONFLICT(name) DO UPDATE SET
     capacity=excluded.capacity,
     sort_order=excluded.sort_order,
     enabled=1,
     updated_at=excluded.updated_at`,
);
const insertUser = sqlite.prepare(`
  INSERT OR IGNORE INTO users(
    username, password_hash, name, department_id, role, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
`);

sqlite.transaction(() => {
  departmentAccounts.forEach(([name], index) => upsertDepartment.run(name, index, stamp, stamp));
  locations.forEach(([name, capacity], index) =>
    upsertLocation.run(name, capacity, index, stamp, stamp),
  );
  insertUser.run(
    "admin",
    hashPassword(adminPassword),
    "系统管理员",
    null,
    "system_admin",
    stamp,
    stamp,
  );
  departmentAccounts.forEach(([department, username, name]) => {
    const row = sqlite.prepare("SELECT id FROM departments WHERE name=?").get(department) as {
      id: number;
    };
    insertUser.run(username, hashPassword(staffPassword), name, row.id, "staff", stamp, stamp);
  });
})();

console.log("Seed data ready.");
