import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck2,
  Eye,
  FileOutput,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { weekLabel, type PublicationItemInput } from "@shared/index";
import { api, ApiError, mutation } from "../lib/api";
import type { AppConfig } from "../lib/types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { PageHeader } from "../components/PageHeader";

type Workspace = {
  week: number;
  title?: string;
  academicYear?: string;
  semester?: string;
  items: PublicationItemInput[];
  latest?: { id: number; version: number; publishedAt: string } | null;
  version?: number;
};

export function PublicationWorkspacePage({ config }: { config: AppConfig }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editing = Boolean(id);
  const [week, setWeek] = useState(config.currentWeek);
  const [title, setTitle] = useState("一周工作安排");
  const [items, setItems] = useState<PublicationItemInput[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: editing ? ["publication", id] : ["publication-workspace", week],
    queryFn: () =>
      api<Workspace>(editing ? `/publications/${id}` : `/publications/admin/workspace?week=${week}`),
  });
  useEffect(() => {
    if (!data) return;
    setItems(data.items);
    if (editing) {
      setWeek(data.week);
      setTitle(data.title ?? "一周工作安排");
    }
  }, [data, editing]);

  const grouped = useMemo(() => {
    const result = new Map<string, { date: Date; am: PublicationItemInput[]; pm: PublicationItemInput[] }>();
    items.forEach((item) => {
      const date = new Date(item.startTime);
      const key = date.toISOString().slice(0, 10);
      if (!result.has(key)) result.set(key, { date, am: [], pm: [] });
      result.get(key)![date.getHours() < 12 ? "am" : "pm"].push(item);
    });
    return [...result.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [items]);

  const save = useMutation({
    mutationFn: () =>
      mutation<{ id: number; pdfWarning: string | null }>(
        editing ? `/publications/${id}` : "/publications/admin/publish",
        editing ? "PATCH" : "POST",
        {
          ...(!editing && { week }),
          title,
          items: items.map((item, index) => ({ ...item, sortOrder: index })),
        },
      ),
    onSuccess: async (result) => {
      setNotice(result.pdfWarning ?? (editing ? "发布安排已更新，PDF 已重新生成。" : "发布成功，PDF 已生成。"));
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["publications"] });
      await queryClient.invalidateQueries({ queryKey: ["publication-workspace", week] });
      if (editing) {
        await queryClient.invalidateQueries({ queryKey: ["publication", id] });
        navigate("/publications");
      }
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : `${editing ? "保存" : "发布"}失败，请检查内容后重试`),
  });

  const removeWorkspaceItem = useMutation({
    mutationFn: (item: PublicationItemInput) =>
      mutation<{ ok: true; emailQueued: number; deletedItemCount: number }>(
        `/publications/admin/workspace/items/${item.sourceItemId}`,
        "DELETE",
      ),
    onSuccess: async (result, item) => {
      setItems((value) => value.filter((entry) => entry.sourceItemId !== item.sourceItemId));
      setNotice(
        result.emailQueued
          ? `“${item.name}”所属填报及其 ${result.deletedItemCount} 项会议活动已删除，已向填报人的 ${result.emailQueued} 个邮箱发送通知。`
          : `“${item.name}”所属填报及其 ${result.deletedItemCount} 项会议活动已删除；填报人未绑定已验证邮箱。`,
      );
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["publication-workspace", week] });
    },
    onError: (cause) =>
      setError(cause instanceof ApiError ? cause.message : "删除失败，请稍后重试"),
  });

  function updateItem(index: number, patch: Partial<PublicationItemInput>) {
    setItems((value) => value.map((item, itemIndex) => (index === itemIndex ? { ...item, ...patch } : item)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((value) => {
      const next = [...value];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="WEEKLY PUBLICATION"
        title={editing ? "编辑已发布安排" : "周安排发布"}
        description={editing ? "修改已发布版本的全部内容；保存后会同步重新生成 PDF。" : "审核通过的项目进入当前工作区；发布后将冻结为独立版本并生成 PDF。"}
        actions={
          <Button disabled={!items.length} loading={save.isPending} onClick={() => save.mutate()}>
            <FileOutput className="size-4" /> {editing ? "保存修改" : "正式发布"}
          </Button>
        }
      />
      <Card className="mb-5 grid gap-4 p-5 md:grid-cols-[180px_1fr_auto] md:items-end">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          周次
          <Select disabled={editing} value={week} onChange={(event) => setWeek(Number(event.target.value))}>
            {Array.from({ length: 21 }, (_, index) => index).map((value) => (
              <option key={value} value={value}>
                {weekLabel(value)}
                {value === config.currentWeek ? "（当前）" : ""}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          发布标题
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} />
        </label>
        <div className="text-sm text-slate-500">
          {editing ? (
            <span>当前版本 V{data?.version}</span>
          ) : data?.latest ? (
            <span>上一版本 V{data.latest.version}</span>
          ) : (
            <span>本周尚未发布</span>
          )}
        </div>
      </Card>
      {notice && (
        <div className="mb-5 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {!items.length ? (
        <EmptyState
          icon={CalendarCheck2}
          title={`${weekLabel(week)}没有待发布项目`}
          description="申请审核通过后会自动进入对应周次的发布工作区。"
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[1fr_1.05fr]">
          <section className="grid h-fit gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-serif-cn text-lg font-bold text-ink-900">发布内容编辑</h2>
              <span className="text-xs text-slate-400">{items.length} 项</span>
            </div>
            {items.map((item, index) => (
              <Card key={`${item.sourceItemId}-${index}`} className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-700">{String(index + 1).padStart(2, "0")}</span>
                  <div className="flex gap-1">
                    <button
                      className="rounded p-2 text-slate-400 hover:bg-slate-100"
                      onClick={() => move(index, -1)}
                      aria-label={`上移第 ${index + 1} 项`}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      className="rounded p-2 text-slate-400 hover:bg-slate-100"
                      onClick={() => move(index, 1)}
                      aria-label={`下移第 ${index + 1} 项`}
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-700"
                      disabled={removeWorkspaceItem.isPending}
                      onClick={() => {
                        if (!window.confirm(`确定删除“${item.name}”所属的整份填报吗？该填报中的全部会议活动和审核记录将一并删除，且无法恢复。`)) return;
                        if (!editing && item.sourceItemId) {
                          removeWorkspaceItem.mutate(item);
                          return;
                        }
                        setItems((value) => value.filter((_, itemIndex) => itemIndex !== index));
                      }}
                      aria-label={`删除第 ${index + 1} 项`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="类型" required>
                    <Select
                      value={item.type}
                      onChange={(event) =>
                        updateItem(index, {
                          type: event.target.value as PublicationItemInput["type"],
                        })
                      }
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
                    />
                  </Field>
                  <Field label="开始时间" required>
                    <Input
                      type="datetime-local"
                      value={item.startTime.slice(0, 16)}
                      onChange={(event) => updateItem(index, { startTime: event.target.value })}
                    />
                  </Field>
                  <Field label="结束时间">
                    <Input
                      type="datetime-local"
                      value={item.endTime?.slice(0, 16) ?? ""}
                      onChange={(event) =>
                        updateItem(index, { endTime: event.target.value || null })
                      }
                    />
                  </Field>
                  <Field label="地点" required>
                    <Input
                      value={item.location}
                      onChange={(event) => updateItem(index, { location: event.target.value })}
                    />
                  </Field>
                  <Field label="部门" required>
                    <Input
                      value={item.department}
                      onChange={(event) => updateItem(index, { department: event.target.value })}
                    />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="参加人员" required>
                      <Textarea
                        value={item.participants}
                        onChange={(event) =>
                          updateItem(index, { participants: event.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="内容简要">
                      <Textarea
                        value={item.remark ?? ""}
                        onChange={(event) =>
                          updateItem(index, { remark: event.target.value || null })
                        }
                      />
                    </Field>
                  </div>
                </div>
              </Card>
            ))}
          </section>
          <section className="h-fit xl:sticky xl:top-6">
            <div className="mb-3 flex items-center gap-2">
              <Eye className="size-4 text-brand-700" />
              <h2 className="font-serif-cn text-lg font-bold text-ink-900">发布预览</h2>
            </div>
            <Card className="overflow-hidden">
              <div className="border-b border-ink-900 bg-white p-5 text-center">
                <p className="font-serif-cn text-xl font-bold text-ink-950">{title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {data?.academicYear ?? config.academicYear}学年度第{data?.semester ?? config.semester}学期 · {weekLabel(week)}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-ink-900">
                      <th className="border-b border-r border-line p-3">日期</th>
                      <th className="border-b border-r border-line p-3">星期</th>
                      <th className="border-b border-r border-line p-3">上午</th>
                      <th className="border-b border-line p-3">下午</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((group) => (
                      <tr key={group.date.toISOString()}>
                        <td className="w-20 border-b border-r border-line p-3 text-center font-semibold">
                          {group.date.getMonth() + 1}月{group.date.getDate()}日
                        </td>
                        <td className="w-12 border-b border-r border-line p-3 text-center">
                          {["日", "一", "二", "三", "四", "五", "六"][group.date.getDay()]}
                        </td>
                        {[group.am, group.pm].map((period, periodIndex) => (
                          <td key={periodIndex} className="border-b border-r border-line p-3 align-top last:border-r-0">
                            {period.map((item) => (
                              <div key={`${item.sourceItemId}-${item.name}`} className="mb-3 last:mb-0">
                                <div className="flex items-start gap-2">
                                  <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
                                    {item.type === "meeting" ? "会议" : "活动"}
                                  </span>
                                  <strong className="text-ink-900">{item.name}</strong>
                                </div>
                                <dl className="mt-1 grid gap-0.5 leading-5 text-slate-600">
                                  <div>
                                    <dt className="inline font-semibold text-slate-500">时间：</dt>
                                    <dd className="inline">
                                      {new Date(item.startTime).toLocaleTimeString("zh-CN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                      {item.endTime &&
                                        `–${new Date(item.endTime).toLocaleTimeString("zh-CN", {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}`}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="inline font-semibold text-slate-500">地点：</dt>
                                    <dd className="inline whitespace-pre-wrap">{item.location}</dd>
                                  </div>
                                  <div>
                                    <dt className="inline font-semibold text-slate-500">参加人员：</dt>
                                    <dd className="inline whitespace-pre-wrap">{item.participants}</dd>
                                  </div>
                                  <div>
                                    <dt className="inline font-semibold text-slate-500">部门：</dt>
                                    <dd className="inline whitespace-pre-wrap">{item.department}</dd>
                                  </div>
                                  <div>
                                    <dt className="inline font-semibold text-slate-500">内容简要：</dt>
                                    <dd className="inline whitespace-pre-wrap">{item.remark || "—"}</dd>
                                  </div>
                                </dl>
                              </div>
                            ))}
                            {!period.length && <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
