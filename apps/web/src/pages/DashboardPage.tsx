import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarCheck2,
  ClipboardCheck,
  FileEdit,
  FilePlus2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { weekLabel, type SubmissionStatus } from "@shared/index";
import { api } from "../lib/api";
import { Card, Spinner } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

type Dashboard = {
  currentWeek: number;
  own: Array<{ status: SubmissionStatus; count: number }>;
  pendingReview: number;
  latestPublication: { id: number; week: number; version: number; publishedAt: string } | null;
};

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/dashboard"),
  });
  if (isLoading || !data) return <Spinner />;
  const counts = Object.fromEntries(data.own.map((item) => [item.status, item.count]));
  const cards = [
    { label: "草稿", value: counts.draft ?? 0, icon: FileEdit, tone: "text-slate-600 bg-slate-100" },
    {
      label: "待审核",
      value: counts.submitted ?? 0,
      icon: ClipboardCheck,
      tone: "text-amber-700 bg-amber-100",
    },
    {
      label: "已通过",
      value: counts.approved ?? 0,
      icon: CalendarCheck2,
      tone: "text-emerald-700 bg-emerald-100",
    },
  ];
  return (
    <div className="page-enter">
      <PageHeader
        eyebrow={`${data.currentWeek.toString().padStart(2, "0")} / CURRENT WEEK`}
        title={`${weekLabel(data.currentWeek)}工作台`}
        description="集中处理本周会议活动填报，并跟踪每一项申请的审核与发布状态。"
        actions={
          <Link
            to="/submissions/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            <FilePlus2 className="size-4" />
            新建填报
          </Link>
        }
      />
      <section className="grid gap-4 md:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="mt-3 text-4xl font-bold tracking-tight text-ink-950">{value}</p>
              </div>
              <div className={`grid size-10 place-items-center rounded-md ${tone}`}>
                <Icon className="size-5" />
              </div>
            </div>
          </Card>
        ))}
      </section>
      <section className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif-cn text-lg font-bold text-ink-900">当前工作提示</h2>
          </div>
          <div className="grid gap-3 p-5">
            <Link
              to="/submissions"
              className="group flex items-center justify-between rounded-md border border-line px-4 py-4 transition hover:border-brand-600 hover:bg-brand-100/35"
            >
              <div>
                <p className="font-semibold text-ink-900">检查我的申请</p>
                <p className="mt-1 text-sm text-slate-500">查看草稿、退回原因和审核进度</p>
              </div>
              <ArrowRight className="size-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-brand-700" />
            </Link>
            {data.pendingReview > 0 && (
              <Link
                to="/admin/reviews"
                className="group flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-4 transition hover:border-amber-400"
              >
                <div>
                  <p className="font-semibold text-amber-900">有 {data.pendingReview} 项申请待审核</p>
                  <p className="mt-1 text-sm text-amber-700">按提交时间进入审核队列</p>
                </div>
                <ArrowRight className="size-5 text-amber-600 transition group-hover:translate-x-1" />
              </Link>
            )}
          </div>
        </Card>
        <Card className="bg-ink-900 p-5 text-white">
          <p className="text-xs font-bold tracking-[0.15em] text-emerald-300 uppercase">Latest issue</p>
          {data.latestPublication ? (
            <>
              <p className="mt-4 font-serif-cn text-2xl font-bold">
                {weekLabel(data.latestPublication.week)}
              </p>
              <p className="mt-2 text-sm text-white/55">
                发布版本 V{data.latestPublication.version}
              </p>
              <a
                className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300"
                href={`/api/publications/${data.latestPublication.id}/preview`}
                target="_blank"
                rel="noreferrer"
              >
                查看已发布安排 <ArrowRight className="size-4" />
              </a>
            </>
          ) : (
            <p className="mt-5 text-sm leading-6 text-white/50">当前尚无已发布的周工作安排。</p>
          )}
        </Card>
      </section>
    </div>
  );
}
