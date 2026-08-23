import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FilePlus2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { weekLabel, type SubmissionStatus } from "@shared/index";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Card, EmptyState, Select, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { AppConfig } from "../lib/types";

type SharedScheduleItem = {
  id: number;
  submissionId: number;
  type: "meeting" | "activity";
  name: string;
  startTime: string;
  endTime: string | null;
  location: string;
  participants: string;
  department: string;
  remark: string | null;
  status: SubmissionStatus;
  applicantName: string;
  sortOrder: number;
};

type SharedSchedule = {
  academicYear: string;
  semester: string;
  week: number;
  items: SharedScheduleItem[];
};

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function ScheduleItem({ item }: { item: SharedScheduleItem }) {
  return (
    <Link
      to={`/submissions/${item.submissionId}`}
      className="group block rounded-md p-1.5 transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      aria-label={`查看${item.department}填报的${item.name}`}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">
          {item.type === "meeting" ? "会议" : "活动"}
        </span>
        <strong className="min-w-0 flex-1 text-ink-900 group-hover:text-brand-800">{item.name}</strong>
        <StatusBadge status={item.status} />
      </div>
      <dl className="mt-1 grid gap-0.5 leading-5 text-slate-600">
        <div>
          <dt className="inline font-semibold text-slate-500">时间：</dt>
          <dd className="inline">
            {new Date(item.startTime).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {item.endTime
              ? `–${new Date(item.endTime).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-500">地点：</dt>
          <dd className="inline whitespace-pre-wrap">{item.location || "—"}</dd>
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
          <dt className="inline font-semibold text-slate-500">填报人：</dt>
          <dd className="inline">{item.applicantName}</dd>
        </div>
        <div>
          <dt className="inline font-semibold text-slate-500">内容简要：</dt>
          <dd className="inline whitespace-pre-wrap">{item.remark || "—"}</dd>
        </div>
      </dl>
    </Link>
  );
}

export function SharedSubmissionsPage({ config }: { config: AppConfig }) {
  const [week, setWeek] = useState(config.currentWeek);
  const { data, isLoading } = useQuery({
    queryKey: ["shared-submissions", week],
    queryFn: () => api<SharedSchedule>(`/submissions/shared-schedule?week=${week}`),
  });
  const grouped = useMemo(() => {
    const result = new Map<
      string,
      { date: Date; am: SharedScheduleItem[]; pm: SharedScheduleItem[] }
    >();
    for (const item of data?.items ?? []) {
      const date = new Date(item.startTime);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      if (!result.has(key)) result.set(key, { date, am: [], pm: [] });
      result.get(key)![date.getHours() < 12 ? "am" : "pm"].push(item);
    }
    return [...result.values()].sort((left, right) => left.date.getTime() - right.date.getTime());
  }, [data?.items]);

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="CAMPUS SUBMISSIONS"
        title="各部门已填报情况"
        description="按发布预览方式查看本学期各部门的填报内容；点击项目可进入详情，填报员只读，管理员可编辑。"
        actions={
          <Link
            to="/submissions/new"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            <FilePlus2 className="size-4" /> 返回新建填报
          </Link>
        }
      />
      <Card className="mb-5 grid gap-4 p-5 sm:grid-cols-[220px_1fr] sm:items-end">
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          周次
          <Select value={week} onChange={(event) => setWeek(Number(event.target.value))}>
            {Array.from({ length: 21 }, (_, index) => index).map((value) => (
              <option key={value} value={value}>
                {weekLabel(value)}
                {value === config.currentWeek ? "（当前）" : ""}
              </option>
            ))}
          </Select>
        </label>
        <p className="text-sm text-slate-500">
          {isLoading ? "正在载入…" : `共 ${data?.items.length ?? 0} 项会议活动`}
        </p>
      </Card>
      {isLoading ? (
        <Spinner />
      ) : !data?.items.length ? (
        <EmptyState
          icon={CalendarDays}
          title={`${weekLabel(week)}暂无部门填报`}
          description="该周暂时没有可显示的会议或活动填报。"
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-ink-900 bg-white p-5 text-center">
            <p className="font-serif-cn text-xl font-bold text-ink-950">各部门已填报情况</p>
            <p className="mt-1 text-xs text-slate-500">
              {data.academicYear}学年度第{data.semester}学期 · {weekLabel(data.week)}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-xs">
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
                      {weekdayLabels[group.date.getDay()]}
                    </td>
                    {[group.am, group.pm].map((period, periodIndex) => (
                      <td
                        key={periodIndex}
                        className="w-[42%] border-b border-r border-line p-2 align-top last:border-r-0"
                      >
                        <div className="grid gap-2">
                          {period.map((item) => (
                            <ScheduleItem key={item.id} item={item} />
                          ))}
                          {!period.length ? <span className="p-1.5 text-slate-300">—</span> : null}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
