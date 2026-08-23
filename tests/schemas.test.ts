import { describe, expect, it } from "vitest";
import { submissionInputSchema } from "../packages/shared/src/index.js";

const valid = {
  week: 3,
  customDepartment: "测试部门",
  items: [
    {
      type: "meeting",
      name: "工作会议",
      startTime: "2026-09-14T09:00",
      endTime: "2026-09-14T10:00",
      customLocation: "会议室",
      participants: "相关人员",
      remark: "研究本周重点工作安排",
      sortOrder: 0,
    },
  ],
};

describe("submissionInputSchema", () => {
  it("accepts a complete submission", () => {
    expect(submissionInputSchema.parse(valid).week).toBe(3);
  });

  it("requires at least one schedule item", () => {
    expect(() => submissionInputSchema.parse({ ...valid, items: [] })).toThrow();
  });

  it("rejects an invalid week", () => {
    expect(() => submissionInputSchema.parse({ ...valid, week: 21 })).toThrow();
  });

  it("accepts the pre-term week", () => {
    expect(submissionInputSchema.parse({ ...valid, week: 0 }).week).toBe(0);
  });

  it("rejects an end time before start time", () => {
    expect(() =>
      submissionInputSchema.parse({
        ...valid,
        items: [{ ...valid.items[0], endTime: "2026-09-14T08:00" }],
      }),
    ).toThrow();
  });

  it("requires an end time", () => {
    const { endTime: _endTime, ...item } = valid.items[0];
    expect(() => submissionInputSchema.parse({ ...valid, items: [item] })).toThrow(
      "请填写结束时间",
    );
  });

  it("requires a brief description", () => {
    expect(() =>
      submissionInputSchema.parse({
        ...valid,
        items: [{ ...valid.items[0], remark: "   " }],
      }),
    ).toThrow("请填写内容简要");
  });
});
