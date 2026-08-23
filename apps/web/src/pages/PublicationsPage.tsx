import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Download, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { weekLabel } from "@shared/index";
import { api, mutation } from "../lib/api";
import type { CurrentUser } from "../lib/types";
import { Button, Card, EmptyState, Spinner } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

type PublicationRow = {
  id: number;
  academicYear: string;
  semester: string;
  week: number;
  version: number;
  title: string;
  publishedAt: string;
  hasPdf: number;
  publisherName: string;
};

export function PublicationsPage({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient();
  const isAdmin = user.role === "admin" || user.role === "system_admin";
  const { data, isLoading } = useQuery({
    queryKey: ["publications"],
    queryFn: () => api<{ rows: PublicationRow[] }>("/publications"),
  });
  const remove = useMutation({
    mutationFn: (id: number) => mutation(`/publications/${id}`, "DELETE"),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["publications"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
  });
  if (isLoading) return <Spinner />;
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="PUBLISHED ISSUES"
        title="已发布安排"
        description="每次发布都会生成独立版本，历史版本不会随原申请修改而变化。"
      />
      {!data?.rows.length ? (
        <EmptyState
          icon={CalendarDays}
          title="尚无发布版本"
          description="管理员完成审核和周安排整理后，正式版本会显示在这里。"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((row) => (
            <Card key={row.id} className="overflow-hidden">
              <div className="bg-ink-900 p-5 text-white">
                <p className="text-xs font-bold tracking-[0.15em] text-emerald-300">
                  {row.week === 0 ? "PRE-TERM WEEK" : `WEEK ${String(row.week).padStart(2, "0")}`}
                </p>
                <h2 className="mt-3 font-serif-cn text-2xl font-bold">{row.title}</h2>
                <p className="mt-2 text-base font-semibold text-white/80">{weekLabel(row.week)}</p>
                <p className="mt-2 text-base text-white/60">
                  {row.academicYear}学年度 · 第{row.semester}学期
                </p>
              </div>
              <div className="p-5">
                <div className="flex items-center justify-between text-base">
                  <span className="font-semibold text-brand-700">版本 V{row.version}</span>
                  <span className="text-slate-400">
                    {new Date(row.publishedAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">发布人：{row.publisherName}</p>
                <div className="mt-5 grid gap-2">
                  <a
                    href={`/api/publications/${row.id}/preview`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 text-base font-semibold text-ink-900 hover:border-brand-600"
                  >
                    <ExternalLink className="size-4" /> 预览
                  </a>
                  {Boolean(row.hasPdf) && (
                    <a
                      href={`/api/publications/${row.id}/pdf`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-brand-700 text-base font-semibold text-white hover:bg-brand-800"
                    >
                      <Download className="size-4" /> 电脑版PDF
                    </a>
                  )}
                  {Boolean(row.hasPdf) && (
                    <a
                      href={`/api/publications/${row.id}/mobile-pdf`}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 text-base font-semibold text-white hover:bg-emerald-800"
                    >
                      <Download className="size-4" /> 手机版PDF
                    </a>
                  )}
                </div>
                {isAdmin && (
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    <Link
                      to={`/admin/publications/${row.id}/edit`}
                      className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-slate-300 text-sm font-semibold text-ink-900 hover:border-brand-600"
                    >
                      <Pencil className="size-4" /> 编辑
                    </Link>
                    <Button
                      variant="danger"
                      className="min-h-10 flex-1"
                      loading={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`确定删除${weekLabel(row.week)}的 V${row.version} 发布版本吗？删除后不可恢复。`)) {
                          remove.mutate(row.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" /> 删除
                    </Button>
                  </div>
                )}
                {remove.error && (
                  <p className="mt-3 text-xs text-red-700">
                    {remove.error instanceof Error ? remove.error.message : "删除失败"}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
