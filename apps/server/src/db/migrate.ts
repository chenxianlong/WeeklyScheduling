import { sqlite } from "./client.js";

const migrations = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    avatar TEXT,
    department_id INTEGER,
    role TEXT NOT NULL DEFAULT 'staff' CHECK(role IN ('staff','admin','system_admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
    last_login_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    capacity INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL,
    semester TEXT NOT NULL,
    week INTEGER NOT NULL CHECK(week BETWEEN 0 AND 20),
    department_id INTEGER REFERENCES departments(id),
    custom_department TEXT,
    applicant_user_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','returned','approved','cancelled','archived')),
    applicant_remark TEXT,
    submitted_at TEXT,
    approved_at TEXT,
    approved_by INTEGER REFERENCES users(id),
    returned_at TEXT,
    returned_by INTEGER REFERENCES users(id),
    return_reason TEXT,
    legacy_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS submissions_term_week_idx ON submissions(academic_year, semester, week);
  CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions(status);
  CREATE INDEX IF NOT EXISTS submissions_applicant_idx ON submissions(applicant_user_id);
  CREATE TABLE IF NOT EXISTS submission_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('meeting','activity')),
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    location_id INTEGER REFERENCES locations(id),
    custom_location TEXT,
    participants TEXT NOT NULL,
    remark TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS submission_items_submission_idx ON submission_items(submission_id, sort_order);
  CREATE TABLE IF NOT EXISTS review_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    comment TEXT,
    operator_user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS weekly_publications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    academic_year TEXT NOT NULL,
    semester TEXT NOT NULL,
    week INTEGER NOT NULL CHECK(week BETWEEN 0 AND 20),
    version INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'editing' CHECK(status IN ('editing','published','superseded')),
    title TEXT NOT NULL,
    published_by INTEGER REFERENCES users(id),
    published_at TEXT,
    pdf_path TEXT,
    pdf_sha256 TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(academic_year, semester, week, version)
  );
  CREATE INDEX IF NOT EXISTS publications_term_week_idx ON weekly_publications(academic_year, semester, week, version);
  CREATE TABLE IF NOT EXISTS publication_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id INTEGER NOT NULL REFERENCES weekly_publications(id) ON DELETE CASCADE,
    source_submission_id INTEGER,
    source_item_id INTEGER,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    location TEXT NOT NULL,
    participants TEXT NOT NULL,
    department TEXT NOT NULL,
    remark TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS publication_items_publication_idx ON publication_items(publication_id, sort_order);
  CREATE TABLE IF NOT EXISTS publication_item_exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_submission_id INTEGER NOT NULL,
    source_item_id INTEGER NOT NULL UNIQUE,
    item_name TEXT NOT NULL,
    excluded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS publication_item_exclusions_submission_idx
    ON publication_item_exclusions(source_submission_id, source_item_id);
  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    detail_json TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);
  CREATE TABLE IF NOT EXISTS email_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
    review_log_id INTEGER UNIQUE REFERENCES review_logs(id) ON DELETE SET NULL,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    text_body TEXT NOT NULL,
    html_body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT NOT NULL,
    sent_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_notifications_queue_idx
    ON email_notifications(status, next_attempt_at);
  CREATE TABLE IF NOT EXISTS user_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    verification_token_hash TEXT,
    verification_expires_at TEXT,
    verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS user_emails_user_idx ON user_emails(user_id, id);
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_by INTEGER REFERENCES users(id),
    updated_at TEXT NOT NULL
  );
  `,
];

sqlite.transaction(() => {
  for (const migration of migrations) sqlite.exec(migration);
  const userColumns = sqlite.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  if (!userColumns.some((column) => column.name === "email")) {
    sqlite.exec("ALTER TABLE users ADD COLUMN email TEXT");
  }
  const notificationColumns = sqlite
    .prepare("PRAGMA table_info(email_notifications)")
    .all() as Array<{ name: string }>;
  if (!notificationColumns.some((column) => column.name === "dedupe_key")) {
    sqlite.exec("ALTER TABLE email_notifications ADD COLUMN dedupe_key TEXT");
  }
  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
     ON users(email COLLATE NOCASE) WHERE email IS NOT NULL`,
  );
  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS email_notifications_dedupe_unique
     ON email_notifications(dedupe_key) WHERE dedupe_key IS NOT NULL`,
  );
  sqlite.exec(
    `INSERT OR IGNORE INTO user_emails(user_id, email, verified_at, created_at, updated_at)
     SELECT id, email, updated_at, created_at, updated_at FROM users WHERE email IS NOT NULL`,
  );
})();

console.log(`Database migrated: ${sqlite.name}`);
