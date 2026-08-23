import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Edit3,
  MapPin,
  RotateCcw,
  Send,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import type { CurrentUser, Submission } from "../lib/types";
import { weekLabel } from "@shared/index";
import { api, mutation } from "../lib/api";
import { Button, Card, Spinner, Textarea } from "../components/ui";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";

const reviewActionLabels: Record<string, string> = {
  submit: "提交审核",
  withdraw: "撤回申请",
  approve: "审核通过",
  return: "退回修改",
};

export function SubmissionDetailPage({ user }: { user: CurrentUser }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const isAdmin = user.role === "admin" || user.role === "system_admin";
  const { data, isLoading } = useQuery({
    queryKey: ["submission", id],
    queryFn: () => api<Submission>(`/submissions/${id}`),
  });
  const action = useMutation({
    mutationFn: ({ name, body }: { name: string; body?: unknown }) =>
      mutation<Submission>(
        name === "approve" || name === "return"
          ? `/admin/reviews/${id}/${name}`
          : `/submissions/${id}/${name}`,
        "POST",
        body,
      ),
    onSuccess: async () => {
      setComment("");
      await queryClient.invalidateQueries({ queryKey: ["submission", id] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["reviews"] });
      await queryClient.invalidateQueries({ queryKey: ["shared-submissions"] });
    },
  });
  const remove = useMutation({
    mutationFn: () => mutation(`/submissions/${id}`, "DELETE"),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["submissions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["shared-submissions"] }),
      ]);
      navigate(isAdmin ? "/submissions/shared" : "/submissions");
    },
  });
  if (isLoading || !data) return <Spinner />;
  const canEdit =
    isAdmin ||
    (data.applicantUserId === user.id && (data.status === "draft" || data.status === "returned"));
  const canDelete =
    isAdmin ||
    (data.applicantUserId === user.id &&
      ["draft", "returned", "cancelled"].includes(data.status));
  const backTo =
    data.applicantUserId !== user.id
      ? "/submissions/shared"
      : isAdmin
        ? "/admin/reviews"
        : "/submissions";

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={`APPLICATION #${data.id}`}
        title={`${data.department} · ${weekLabel(data.week)}`}
        description={`${data.applicantName} 填报 · ${new Date(data.createdAt).toLocaleString("zh-CN")}`}
        actions={
          <>
            <Link
              to={backTo}
              className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-600 hover:bg-white"
            >
              <ArrowLeft className="size-4" /> 返回
            </Link>
            {canEdit && (
              <Link
                to={`/submissions/${data.id}/edit`}
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-ink-900 hover:border-brand-600"
              >
                <Edit3 className="size-4" /> 编辑
              </Link>
            )}
            {canDelete && (
              <Button
                variant="danger"
                loading={remove.isPending}
                onClick={() => {
                  const target = data.status === "draft" ? "草稿" : "申请";
                  if (window.confirm(`确定删除${target} #${data.id} 吗？删除后不可恢复。`)) remove.mutate();
                }}
              >
                <Trash2 className="size-4" /> {data.status === "draft" ? "删除草稿" : "删除"}
              </Button>
            )}
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <div className="grid gap-4">
          {data.returnReason && (
            <div className="rounded-[10px] border border-red-200 bg-red-50 p-4">
              <p className="font-semibold text-red-900">退回原因</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-red-800">{data.returnReason}</p>
            </div>
          )}
          {data.items.map((item, index) => (
            <Card key={item.id ?? index} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-line bg-slate-50/65 px-5 py-4">
                <span className="text-xs font-bold tracking-wider text-brand-700">
                  {item.type === "meeting" ? "会议" : "活动"} {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="font-serif-cn text-lg font-bold text-ink-900">{item.name}</h2>
              </div>
              <dl className="grid gap-5 p-5 md:grid-cols-2">
                <div className="flex gap-3">
                  <Clock3 className="mt-0.5 size-5 shrink-0 text-brand-700" />
                  <div>
                    <dt className="text-xs font-semibold text-slate-400">时间</dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-700">
                      {new Date(item.startTime).toLocaleString("zh-CN")}
                      {item.endTime ? ` — ${new Date(item.endTime).toLocaleString("zh-CN")}` : ""}
                    </dd>
                  </div>
                </div>
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-brand-700" />
                  <div>
                    <dt className="text-xs font-semibold text-slate-400">地点</dt>
                    <dd className="mt-1 text-sm leading-6 text-slate-700">{item.location}</dd>
                  </div>
                </div>
                <div className="flex gap-3 md:col-span-2">
                  <Users className="mt-0.5 size-5 shrink-0 text-brand-700" />
                  <div>
                    <dt className="text-xs font-semibold text-slate-400">参加人员</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {item.participants}
                    </dd>
                  </div>
                </div>
                {item.remark && (
                  <div className="md:col-span-2">
                    <dt className="text-xs font-semibold text-slate-400">内容简要</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {item.remark}
                    </dd>
                  </div>
                )}
              </dl>
            </Card>
          ))}
        </div>
        <aside className="grid h-fit gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif-cn text-lg font-bold text-ink-900">申请状态</h2>
              <StatusBadge status={data.status} />
            </div>
            <div className="mt-5 grid gap-3">
              {data.status === "draft" && data.applicantUserId === user.id && (
                <Button onClick={() => action.mutate({ name: "submit" })} loading={action.isPending}>
                  <Send className="size-4" /> 提交审核
                </Button>
              )}
              {data.status === "submitted" && data.applicantUserId === user.id && (
                <Button
                  variant="secondary"
                  onClick={() => action.mutate({ name: "withdraw" })}
                  loading={action.isPending}
                >
                  <Undo2 className="size-4" /> 撤回申请
                </Button>
              )}
              {isAdmin && data.status === "submitted" && (
                <>
                  <Textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder="审核意见；退回时必填"
                  />
                  <Button
                    onClick={() => action.mutate({ name: "approve", body: { comment } })}
                    loading={action.isPending}
                  >
                    <Check className="size-4" /> 审核通过
                  </Button>
                  <Button
                    variant="danger"
                    disabled={!comment.trim()}
                    onClick={() => action.mutate({ name: "return", body: { comment } })}
                    loading={action.isPending}
                  >
                    <RotateCcw className="size-4" /> 退回修改
                  </Button>
                </>
              )}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-serif-cn text-lg font-bold text-ink-900">处理记录</h2>
            {!data.reviews.length ? (
              <p className="mt-4 text-sm text-slate-500">尚无状态变更记录。</p>
            ) : (
              <ol className="mt-5 space-y-5 border-l border-line pl-5">
                {data.reviews.map((review) => (
                  <li key={review.id} className="relative">
                    <span className="absolute -left-[25px] top-1 size-2.5 rounded-full bg-brand-700 ring-4 ring-white" />
                    <p className="text-sm font-semibold text-ink-900">
                      {reviewActionLabels[review.action] ?? review.action}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {review.operatorName} · {new Date(review.createdAt).toLocaleString("zh-CN")}
                    </p>
                    {review.comment && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                        {review.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
