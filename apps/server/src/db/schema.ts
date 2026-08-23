import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatar: text("avatar"),
  departmentId: integer("department_id"),
  role: text("role").notNull().default("staff"),
  status: text("status").notNull().default("active"),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const departments = sqliteTable("departments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const locations = sqliteTable("locations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  capacity: integer("capacity"),
  sortOrder: integer("sort_order").notNull().default(0),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const submissions = sqliteTable("submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  academicYear: text("academic_year").notNull(),
  semester: text("semester").notNull(),
  week: integer("week").notNull(),
  departmentId: integer("department_id"),
  customDepartment: text("custom_department"),
  applicantUserId: integer("applicant_user_id").notNull(),
  status: text("status").notNull().default("draft"),
  applicantRemark: text("applicant_remark"),
  submittedAt: text("submitted_at"),
  approvedAt: text("approved_at"),
  approvedBy: integer("approved_by"),
  returnedAt: text("returned_at"),
  returnedBy: integer("returned_by"),
  returnReason: text("return_reason"),
  legacyId: integer("legacy_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const submissionItems = sqliteTable("submission_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  submissionId: integer("submission_id").notNull(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time"),
  locationId: integer("location_id"),
  customLocation: text("custom_location"),
  participants: text("participants").notNull(),
  remark: text("remark"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const weeklyPublications = sqliteTable(
  "weekly_publications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    academicYear: text("academic_year").notNull(),
    semester: text("semester").notNull(),
    week: integer("week").notNull(),
    version: integer("version").notNull(),
    status: text("status").notNull().default("editing"),
    title: text("title").notNull(),
    publishedBy: integer("published_by"),
    publishedAt: text("published_at"),
    pdfPath: text("pdf_path"),
    pdfSha256: text("pdf_sha256"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("publication_version_unique").on(
      table.academicYear,
      table.semester,
      table.week,
      table.version,
    ),
  ],
);
