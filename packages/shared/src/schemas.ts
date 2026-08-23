import { z } from "zod";
import {
  PUBLICATION_STATUSES,
  SCHEDULE_TYPES,
  SUBMISSION_STATUSES,
  USER_ROLES,
} from "./constants.js";

export const roleSchema = z.enum(USER_ROLES);
export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);
export const publicationStatusSchema = z.enum(PUBLICATION_STATUSES);

export const scheduleItemInputSchema = z.object({
  id: z.number().int().positive().optional(),
  type: z.enum(SCHEDULE_TYPES),
  name: z.string().trim().min(1, "请填写名称").max(80),
  startTime: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "开始时间格式无效"),
  endTime: z
    .string({ error: "请填写结束时间" })
    .trim()
    .min(1, "请填写结束时间")
    .refine((value) => !Number.isNaN(Date.parse(value)), "结束时间格式无效"),
  locationId: z.number().int().positive().nullable().optional(),
  customLocation: z.string().trim().max(191).nullable().optional(),
  participants: z.string().trim().min(1, "请填写参加人员").max(10000),
  remark: z
    .string({ error: "请填写内容简要" })
    .trim()
    .min(1, "请填写内容简要")
    .max(10000),
  sortOrder: z.number().int().min(0).default(0),
}).superRefine((value, context) => {
  if (!value.locationId && !value.customLocation) {
    context.addIssue({
      code: "custom",
      path: ["customLocation"],
      message: "请选择或填写地点",
    });
  }
  if (value.endTime && new Date(value.endTime) < new Date(value.startTime)) {
    context.addIssue({
      code: "custom",
      path: ["endTime"],
      message: "结束时间不能早于开始时间",
    });
  }
});

export const submissionInputSchema = z.object({
  week: z.number().int().min(0).max(20),
  departmentId: z.number().int().positive().nullable().optional(),
  customDepartment: z.string().trim().max(191).nullable().optional(),
  applicantRemark: z.string().trim().max(10000).nullable().optional(),
  items: z.array(scheduleItemInputSchema).min(1, "至少添加一项会议或活动").max(100),
}).superRefine((value, context) => {
  if (!value.departmentId && !value.customDepartment) {
    context.addIssue({
      code: "custom",
      path: ["customDepartment"],
      message: "请选择或填写部门",
    });
  }
});

export const reviewInputSchema = z.object({
  comment: z.string().trim().max(2000).nullable().optional(),
});

export const returnInputSchema = z.object({
  comment: z.string().trim().min(1, "退回时必须填写原因").max(2000),
});

export const publicationItemInputSchema = z.object({
  sourceSubmissionId: z.number().int().positive().nullable().optional(),
  sourceItemId: z.number().int().positive().nullable().optional(),
  type: z.enum(SCHEDULE_TYPES),
  name: z.string().trim().min(1).max(80),
  startTime: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "开始时间格式无效"),
  endTime: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "结束时间格式无效")
    .nullable()
    .optional(),
  location: z.string().trim().min(1).max(191),
  participants: z.string().trim().min(1).max(10000),
  department: z.string().trim().min(1).max(191),
  remark: z.string().trim().max(10000).nullable().optional(),
  sortOrder: z.number().int().min(0),
});

export type Role = z.infer<typeof roleSchema>;
export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;
export type SubmissionInput = z.infer<typeof submissionInputSchema>;
export type ScheduleItemInput = z.infer<typeof scheduleItemInputSchema>;
export type PublicationItemInput = z.infer<typeof publicationItemInputSchema>;
