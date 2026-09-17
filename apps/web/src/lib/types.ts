import type { Role, SubmissionStatus } from "@shared/index";

export type CurrentUser = {
  id: number;
  username: string;
  name: string;
  role: Role;
  avatar: string | null;
  departmentId: number | null;
};

export type AppConfig = {
  academicYear: string;
  semester: string;
  currentWeek: number;
  schoolName: string;
  emailAllowedDomain: string;
  preWeekStartDate: string | null;
  firstWeekStartDate: string | null;
};

export type SubmissionItem = {
  id?: number;
  type: "meeting" | "activity";
  name: string;
  startTime: string;
  endTime?: string | null;
  locationId?: number | null;
  customLocation?: string | null;
  location?: string;
  participants: string;
  remark?: string | null;
  sortOrder: number;
};

export type Submission = {
  id: number;
  academicYear: string;
  semester: string;
  week: number;
  departmentId: number | null;
  customDepartment: string | null;
  department: string;
  applicantUserId: number;
  applicantName: string;
  applicantAvatar: string | null;
  status: SubmissionStatus;
  applicantRemark: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: SubmissionItem[];
  reviews: Array<{
    id: number;
    action: string;
    fromStatus: SubmissionStatus | null;
    toStatus: SubmissionStatus | null;
    comment: string | null;
    createdAt: string;
    operatorName: string;
  }>;
};
