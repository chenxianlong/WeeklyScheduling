import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Clock3 } from "lucide-react";
import { Link } from "react-router-dom";
import { weekLabel } from "@shared/index";
import { api } from "../lib/api";
import { Card, EmptyState, Spinner } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

type ReviewRow = {
  id: number;
  week: number;
  department: string;
  applicantName: string;
  submittedAt: string;
  itemCount: number;
  firstStartTime: string;
};

export function ReviewQueuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reviews"],
    queryFn: () => api<{ rows: ReviewRow[] }>("/admin/reviews"),
  });
  if (isLoading) return <Spinner />;
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="REVIEW QUEUE"
        title="审核中心"
        description="申请按提交时间排列；进入详情可核对内容、编辑、通过或退回。"
      />
      {!data?.rows.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="待审核队列已清空"
          description="当前没有等待处理的申请。新的申请提交后会出现在这里。"
        />
      ) : (
        <div className="grid gap-3">
          {data.rows.map((row, index) => (
            <Link key={row.id} to={`/submissions/${row.id}`}>
              <Card className="grid gap-4 p-5 transition hover:border-brand-600/50 md:grid-cols-[56px_100px_1fr_auto] md:items-center">
                <span className="text-sm font-bold text-slate-300">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <span className="text-xs text-slate-400">周次</span>
                  <p className="mt-1 font-bold text-ink-900">{weekLabel(row.week)}</p>
                </div>
                <div>
                  <h2 className="font-serif-cn text-lg font-bold text-ink-900">{row.department}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {row.applicantName} · {row.itemCount} 项会议活动
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Clock3 className="size-4" />
                  {new Date(row.submittedAt).toLocaleString("zh-CN")}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
