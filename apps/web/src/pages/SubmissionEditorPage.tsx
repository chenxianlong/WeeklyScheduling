import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, ChevronLeft, Plus, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { submissionInputSchema, weekLabel } from "@shared/index";
import { api, ApiError, mutation } from "../lib/api";
import type { AppConfig, CurrentUser, Submission, SubmissionItem } from "../lib/types";
import { Button, Card, Field, Input, Select, Spinner, Textarea } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

type Meta = {
  departments: Array<{ id: number; name: string }>;
  locations: Array<{ id: number; name: string; capacity: number | null }>;
};

type SubmissionConflict = {
  inputIndex: number;
  inputName: string;
  existingSubmissionId: number;
  name: string;
  startTime: string;
  endTime: string | null;
  location: string;
  department: string;
  applicantName: string;
};

type ConflictResult = {
  timeConflicts: SubmissionConflict[];
  locationConflicts: SubmissionConflict[];
};

function conflictDescription(conflict: SubmissionConflict) {
  const start = new Date(conflict.startTime).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const end = conflict.endTime
    ? new Date(conflict.endTime).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "未填写结束时间";
  return `${conflict.department}“${conflict.name}”（${start}–${end}，${conflict.location}）`;
}

const blankItem = (): SubmissionItem => ({
  type: "meeting",
  name: "",
  startTime: "",
  endTime: null,
  locationId: null,
  customLocation: "",
  participants: "",
  remark: "",
  sortOrder: 0,
});

export function SubmissionEditorPage({
  config,
  user,
}: {
  config: AppConfig;
  user: CurrentUser;
}) {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [week, setWeek] = useState(config.currentWeek);
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [customDepartment, setCustomDepartment] = useState("");
  const [applicantRemark, setApplicantRemark] = useState("");
  const [items, setItems] = useState<SubmissionItem[]>([blankItem()]);
  const [error, setError] = useState("");
  const departmentInitialized = useRef(editing);
  const { data: meta } = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/meta") });
  const { data: existing, isLoading } = useQuery({
    queryKey: ["submission", id],
    queryFn: () => api<Submission>(`/submissions/${id}`),
    enabled: editing,
  });

  useEffect(() => {
    if (!existing) return;
    setWeek(existing.week);
    setDepartmentId(existing.departmentId);
    setCustomDepartment(existing.customDepartment ?? "");
    setApplicantRemark(existing.applicantRemark ?? "");
    setItems(existing.items);
    departmentInitialized.current = true;
  }, [existing]);

  useEffect(() => {
    if (editing || departmentInitialized.current || !meta) return;
    const boundDepartment = meta.departments.find(
      (department) => department.id === user.departmentId,
    );
    setDepartmentId(boundDepartment?.id ?? meta.departments[0]?.id ?? null);
    setCustomDepartment("");
    departmentInitialized.current = true;
  }, [editing, meta, user.departmentId]);

  const save = useMutation({
    mutationFn: async (submitAfterSave: boolean) => {
      setError("");
      const payload = {
        week,
        departmentId,
        customDepartment: departmentId ? null : customDepartment,
        applicantRemark,
        items: items.map((item, index) => ({
          ...item,
          locationId: item.locationId || null,
          customLocation: item.locationId ? null : item.customLocation,
          endTime: item.endTime ?? "",
          remark: item.remark ?? "",
          sortOrder: index,
        })),
      };
      const validation = submissionInputSchema.safeParse(payload);
      if (!validation.success) {
        throw new ApiError(
          validation.error.issues[0]?.message ?? "请检查填报内容",
          422,
          validation.error.flatten(),
        );
      }
      const conflicts = await mutation<ConflictResult>("/submissions/conflicts", "POST", {
        submissionId: editing ? Number(id) : undefined,
        items: validation.data.items,
      });
      if (conflicts.locationConflicts.length) {
        throw new ApiError(
          `地点冲突，不能保存：${conflictDescription(conflicts.locationConflicts[0])}`,
          409,
          conflicts,
        );
      }
      if (conflicts.timeConflicts.length) {
        const descriptions = conflicts.timeConflicts
          .slice(0, 5)
          .map((conflict) => `• ${conflictDescription(conflict)}`)
          .join("\n");
        const remaining = Math.max(0, conflicts.timeConflicts.length - 5);
        const confirmed = window.confirm(
          `检测到时间重叠：\n${descriptions}${remaining ? `\n另有 ${remaining} 项冲突` : ""}\n\n参会人员可能不同，是否仍继续保存？`,
        );
        if (!confirmed) return null;
      }
      const saved = editing
        ? await mutation<Submission>(`/submissions/${id}`, "PUT", validation.data)
        : await mutation<Submission>("/submissions", "POST", validation.data);
      if (submitAfterSave) {
        if (saved.status === "submitted") return saved;
        if (saved.status !== "draft" && saved.status !== "returned") return saved;
        return mutation<Submission>(`/submissions/${saved.id}/submit`, "POST");
      }
      return saved;
    },
    onSuccess: async (saved) => {
      if (!saved) return;
      await queryClient.invalidateQueries({ queryKey: ["submissions"] });
      await queryClient.invalidateQueries({ queryKey: ["shared-submissions"] });
      navigate(`/submissions/${saved.id}`);
    },
    onError: (cause) => {
      setError(cause instanceof ApiError ? cause.message : "保存失败，请稍后再试");
    },
  });

  function updateItem(index: number, patch: Partial<SubmissionItem>) {
    setItems((value) => value.map((item, itemIndex) => (index === itemIndex ? { ...item, ...patch } : item)));
  }

  if ((editing && isLoading) || !meta) return <Spinner />;
  const canSubmitAfterSave =
    !editing || existing?.status === "draft" || existing?.status === "returned";

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={editing ? "EDIT SUBMISSION" : "NEW SUBMISSION"}
        title={editing ? "编辑申请" : "新建会议活动填报"}
        description={`${config.academicYear}学年度第${config.semester}学期；保存为草稿后可继续修改。`}
        actions={
          <>
            <Link
              to="/submissions/shared"
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:border-brand-600"
            >
              <CalendarRange className="size-4" /> 查看其他部门已填报情况
            </Link>
            <Link
              to={editing ? `/submissions/${id}` : "/submissions"}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-600 hover:bg-white"
            >
              <ChevronLeft className="size-4" /> 返回
            </Link>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit p-5">
          <h2 className="font-serif-cn text-lg font-bold text-ink-900">填报信息</h2>
          <div className="mt-5 grid gap-5">
            <Field label="周次" required>
              <Select value={week} onChange={(event) => setWeek(Number(event.target.value))}>
                {Array.from({ length: 21 }, (_, index) => index).map((value) => (
                  <option key={value} value={value}>
                    {weekLabel(value)}
                    {value === config.currentWeek ? "（当前）" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="部门" required>
              <Select
                value={departmentId ?? ""}
                onChange={(event) => {
                  const selectedId = event.target.value ? Number(event.target.value) : null;
                  setDepartmentId(selectedId);
                  if (selectedId) setCustomDepartment("");
                }}
              >
                {meta.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
                <option value="">自定义部门</option>
              </Select>
            </Field>
            {!departmentId && (
              <Field label="自定义部门" required>
                <Input
                  value={customDepartment}
                  onChange={(event) => setCustomDepartment(event.target.value)}
                  placeholder="请输入部门名称"
                />
              </Field>
            )}
            <Field label="填报说明">
              <Textarea
                value={applicantRemark}
                onChange={(event) => setApplicantRemark(event.target.value)}
                placeholder="可填写需要审核人员注意的说明"
              />
            </Field>
          </div>
        </Card>
        <div className="grid gap-4">
          {items.map((item, index) => (
            <Card key={index} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line bg-slate-50/70 px-5 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-8 place-items-center rounded-md bg-ink-900 text-xs font-bold text-white">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <h2 className="font-serif-cn font-bold text-ink-900">会议活动</h2>
                </div>
                <button
                  className="rounded-md p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                  disabled={items.length === 1}
                  onClick={() => setItems((value) => value.filter((_, itemIndex) => itemIndex !== index))}
                  aria-label={`删除第 ${index + 1} 项`}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="grid gap-5 p-5 md:grid-cols-2">
                <Field label="类型" required>
                  <Select
                    value={item.type}
                    onChange={(event) => updateItem(index, { type: event.target.value as "meeting" | "activity" })}
                  >
                    <option value="meeting">会议</option>
                    <option value="activity">活动</option>
                  </Select>
                </Field>
                <Field label="名称" required>
                  <Input
                    value={item.name}
                    maxLength={80}
                    onChange={(event) => updateItem(index, { name: event.target.value })}
                    placeholder="会议或活动名称"
                  />
                </Field>
                <Field label="开始时间" required>
                  <Input
                    type="datetime-local"
                    value={item.startTime.slice(0, 16)}
                    onChange={(event) => updateItem(index, { startTime: event.target.value })}
                  />
                </Field>
                <Field label="结束时间" required>
                  <Input
                    type="datetime-local"
                    required
                    value={item.endTime?.slice(0, 16) ?? ""}
                    onChange={(event) => updateItem(index, { endTime: event.target.value || null })}
                  />
                </Field>
                <Field label="地点" required>
                  <Select
                    value={item.locationId ?? ""}
                    onChange={(event) =>
                      updateItem(index, { locationId: event.target.value ? Number(event.target.value) : null })
                    }
                  >
                    <option value="">自定义地点</option>
                    {meta.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                        {location.capacity ? `（${location.capacity}人）` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!item.locationId && (
                  <Field label="自定义地点" required>
                    <Input
                      value={item.customLocation ?? ""}
                      onChange={(event) => updateItem(index, { customLocation: event.target.value })}
                      placeholder="请输入地点"
                    />
                  </Field>
                )}
                <div className="md:col-span-2">
                  <Field label="参加人员" required>
                    <Textarea
                      value={item.participants}
                      onChange={(event) => updateItem(index, { participants: event.target.value })}
                      placeholder="例如：校领导，各二级单位负责人"
                    />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="内容简要" required>
                    <Textarea
                      required
                      value={item.remark ?? ""}
                      onChange={(event) => updateItem(index, { remark: event.target.value })}
                      placeholder="请填写会议或活动的内容简要"
                    />
                  </Field>
                </div>
              </div>
            </Card>
          ))}
          <button
            className="flex min-h-14 items-center justify-center gap-2 rounded-[10px] border border-dashed border-slate-300 bg-white/55 text-sm font-semibold text-slate-600 transition hover:border-brand-600 hover:bg-brand-100/35 hover:text-brand-700"
            onClick={() => setItems((value) => [...value, blankItem()])}
          >
            <Plus className="size-4" /> 添加一项会议活动
          </button>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          <div className="sticky bottom-3 flex flex-col justify-end gap-3 rounded-[10px] border border-line bg-white/92 p-3 shadow-soft backdrop-blur sm:flex-row">
            <Button
              variant={canSubmitAfterSave ? "secondary" : "primary"}
              loading={save.isPending}
              onClick={() => save.mutate(false)}
            >
              <Save className="size-4" /> {canSubmitAfterSave ? "保存草稿" : "保存修改"}
            </Button>
            {canSubmitAfterSave && (
              <Button loading={save.isPending} onClick={() => save.mutate(true)}>
                <Send className="size-4" /> 保存并提交审核
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
