import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FilePlus2 } from "lucide-react";
import { Link } from "react-router-dom";
import { weekLabel, type SubmissionStatus } from "@shared/index";
import { api } from "../lib/api";
import { Card, EmptyState, Spinner } from "../components/ui";
import { StatusBadge } from "../components/StatusBadge";
import { PageHeader } from "../components/PageHeader";

type Row = {
  id: number;
  week: number;
  status: SubmissionStatus;
  department: string;
  applicantName: string;
  itemCount: number;
  firstStartTime: string;
  updatedAt: string;
};

export function SubmissionListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["submissions"],
    queryFn: () => api<{ rows: Row[] }>("/submissions"),
  });
  if (isLoading) return <Spinner />;
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="MY SUBMISSIONS"
        title="我的申请"
        description="草稿可以继续编辑；提交后可在管理员审核前撤回。"
        actions={
          <Link
            to="/submissions/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <FilePlus2 className="size-4" /> 新建填报
          </Link>
        }
      />
      {!data?.rows.length ? (
        <EmptyState
          icon={CalendarDays}
          title="还没有申请"
          description="从新建填报开始，添加本周需要纳入工作安排的会议或活动。"
          action={
            <Link className="font-semibold text-brand-700 hover:underline" to="/submissions/new">
              创建第一份申请
            </Link>
          }
        />
      ) : (
        <div className="grid gap-3">
          {data.rows.map((row) => (
            <Link key={row.id} to={`/submissions/${row.id}`} className="group block">
              <Card className="grid gap-4 p-5 transition duration-150 group-hover:-translate-y-0.5 group-hover:border-brand-600/50 md:grid-cols-[90px_1fr_auto] md:items-center">
                <div>
                  <span className="text-xs font-semibold text-slate-400">周次</span>
                  <div className="mt-1 font-serif-cn text-lg font-bold text-ink-900">
                    {weekLabel(row.week)}
                  </div>
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="font-serif-cn text-lg font-bold text-ink-900">{row.department}</h2>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {row.itemCount} 项会议活动
                    {row.firstStartTime
                      ? ` · ${new Date(row.firstStartTime).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })} 起`
                      : ""}
                  </p>
                </div>
                <div className="text-sm text-slate-400">
                  更新于 {new Date(row.updatedAt).toLocaleDateString("zh-CN")}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
