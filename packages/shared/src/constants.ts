export const USER_ROLES = ["staff", "admin", "system_admin"] as const;
export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "returned",
  "approved",
  "cancelled",
  "archived",
] as const;
export const PUBLICATION_STATUSES = ["editing", "published", "superseded"] as const;
export const SCHEDULE_TYPES = ["meeting", "activity"] as const;

export const roleLabels = {
  staff: "工作人员",
  admin: "管理员",
  system_admin: "系统管理员",
} as const;

export const submissionStatusLabels = {
  draft: "草稿",
  submitted: "待审核",
  returned: "已退回",
  approved: "已通过",
  cancelled: "已撤回",
  archived: "已归档",
} as const;

export const submissionStatusTone = {
  draft: "neutral",
  submitted: "warning",
  returned: "danger",
  approved: "success",
  cancelled: "neutral",
  archived: "neutral",
} as const;

export function weekLabel(week: number) {
  return week === 0 ? "开学预备周" : `第 ${week} 周`;
}
