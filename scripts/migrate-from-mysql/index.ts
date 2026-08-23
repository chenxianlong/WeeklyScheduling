import "dotenv/config";
import mysql from "mysql2/promise";
import { nowIso, sqlite } from "../../apps/server/src/db/client.js";
import "../../apps/server/src/db/migrate.js";
import { hashPassword } from "../../apps/server/src/services/password.js";

const apply = process.argv.includes("--apply");
const migrationDefaultPassword = process.env.MIGRATION_DEFAULT_PASSWORD?.trim();
if (apply && (!migrationDefaultPassword || migrationDefaultPassword.length < 12)) {
  console.error("正式迁移前必须设置至少 12 位的 MIGRATION_DEFAULT_PASSWORD。");
  process.exit(1);
}
const database = process.env.LEGACY_MYSQL_DATABASE;
if (!database) {
  console.error("缺少 LEGACY_MYSQL_DATABASE。请在 .env 中配置旧 MySQL 数据库。");
  process.exit(1);
}

const connection = await mysql.createConnection({
  host: process.env.LEGACY_MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.LEGACY_MYSQL_PORT || 3306),
  database,
  user: process.env.LEGACY_MYSQL_USER || "root",
  password: process.env.LEGACY_MYSQL_PASSWORD || "",
  dateStrings: true,
});

type LegacyUser = { id: number; name: string | null };
type LegacyPermission = { user_id: number; edit: number; delete: number };
type LegacyMeta = {
  id: number;
  week: number;
  department: string;
  remark: string | null;
  creator_user_id: number;
  academic_year: string;
  semester: string;
  created_at: string;
  updated_at: string;
};
type LegacyItem = {
  id: number;
  meeting_meta_id: number;
  type: number;
  name: string;
  time: string;
  address: string;
  people: string;
  remark: string | null;
};

const [users] = await connection.query<mysql.RowDataPacket[]>(
  "SELECT id, name FROM users",
);
const [permissions] = await connection.query<mysql.RowDataPacket[]>(
  "SELECT user_id, edit, `delete` FROM meeting_schedule_permissions",
);
const [metas] = await connection.query<mysql.RowDataPacket[]>(
  `SELECT id, week, department, remark, creator_user_id, academic_year, semester, created_at, updated_at
   FROM meeting_metas ORDER BY id`,
);
const [items] = await connection.query<mysql.RowDataPacket[]>(
  `SELECT id, meeting_meta_id, type, name, time, address, people, remark
   FROM meeting_schedules ORDER BY meeting_meta_id, time, id`,
);
await connection.end();

console.log(
  JSON.stringify(
    {
      mode: apply ? "APPLY" : "DRY_RUN",
      users: users.length,
      permissions: permissions.length,
      submissions: metas.length,
      items: items.length,
    },
    null,
    2,
  ),
);

if (!apply) {
  console.log("这是预检模式，没有写入 SQLite。确认数量后使用 npm run migrate:legacy -- --apply");
  process.exit(0);
}

const permissionMap = new Map(
  (permissions as LegacyPermission[]).map((permission) => [permission.user_id, permission]),
);
const userIdMap = new Map<number, number>();
const departmentMap = new Map(
  (sqlite.prepare("SELECT id, name FROM departments").all() as Array<{ id: number; name: string }>).map(
    (row) => [row.name, row.id],
  ),
);
const locationMap = new Map(
  (sqlite.prepare("SELECT id, name FROM locations").all() as Array<{ id: number; name: string }>).map(
    (row) => [row.name, row.id],
  ),
);
const itemsByMeta = new Map<number, LegacyItem[]>();
for (const item of items as LegacyItem[]) {
  const list = itemsByMeta.get(item.meeting_meta_id) ?? [];
  list.push(item);
  itemsByMeta.set(item.meeting_meta_id, list);
}

const stats = { users: 0, submissions: 0, items: 0, skipped: 0 };
sqlite.transaction(() => {
  for (const user of users as LegacyUser[]) {
    const username = `legacy-${user.id}`;
    const permission = permissionMap.get(user.id);
    const role = permission?.edit || permission?.delete ? "admin" : "staff";
    const stamp = nowIso();
    sqlite
      .prepare(
        `INSERT INTO users(username, password_hash, name, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(username) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at`,
      )
      .run(username, hashPassword(migrationDefaultPassword!), user.name || username, role, stamp, stamp);
    const mapped = sqlite
      .prepare("SELECT id FROM users WHERE username=?")
      .get(username) as { id: number };
    userIdMap.set(user.id, mapped.id);
    stats.users++;
  }

  for (const meta of metas as LegacyMeta[]) {
    const applicant = userIdMap.get(meta.creator_user_id);
    if (!applicant) {
      stats.skipped++;
      continue;
    }
    const existing = sqlite
      .prepare("SELECT id FROM submissions WHERE legacy_id=?")
      .get(meta.id) as { id: number } | undefined;
    if (existing) {
      stats.skipped++;
      continue;
    }
    const departmentId = departmentMap.get(meta.department) ?? null;
    const stamp = meta.updated_at ? new Date(meta.updated_at).toISOString() : nowIso();
    const result = sqlite
      .prepare(
        `INSERT INTO submissions(
         academic_year, semester, week, department_id, custom_department, applicant_user_id,
         status, applicant_remark, approved_at, approved_by, legacy_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        meta.academic_year,
        meta.semester,
        meta.week,
        departmentId,
        departmentId ? null : meta.department,
        applicant,
        meta.remark,
        stamp,
        applicant,
        meta.id,
        new Date(meta.created_at).toISOString(),
        stamp,
      );
    const submissionId = Number(result.lastInsertRowid);
    sqlite
      .prepare(
        `INSERT INTO review_logs(submission_id, action, from_status, to_status, comment, operator_user_id, created_at)
         VALUES (?, 'legacy_import', NULL, 'approved', '从旧系统迁入', ?, ?)`,
      )
      .run(submissionId, applicant, stamp);
    (itemsByMeta.get(meta.id) ?? []).forEach((item, index) => {
      const locationId = locationMap.get(item.address) ?? null;
      const time = new Date(item.time).toISOString();
      sqlite
        .prepare(
          `INSERT INTO submission_items(
           submission_id, type, name, start_time, location_id, custom_location,
           participants, remark, sort_order, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          submissionId,
          item.type ? "activity" : "meeting",
          item.name,
          time,
          locationId,
          locationId ? null : item.address,
          item.people,
          item.remark,
          index,
          stamp,
          stamp,
        );
      stats.items++;
    });
    stats.submissions++;
  }
})();

console.log("迁移完成：", stats);
