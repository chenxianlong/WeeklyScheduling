import {
  CalendarDays,
  ClipboardCheck,
  FileClock,
  FilePlus2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Mail,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import type { AppConfig, CurrentUser } from "../lib/types";
import { mutation } from "../lib/api";
import { cn } from "./ui";

const baseNavigation = [
  { to: "/", label: "工作台", icon: LayoutDashboard, end: true },
  { to: "/submissions", label: "我的申请", icon: FileClock },
  { to: "/submissions/new", label: "新建填报", icon: FilePlus2 },
  { to: "/account/emails", label: "我的通知邮箱", icon: Mail },
];

export function AppShell({
  user,
  config,
  onLogout,
}: {
  user: CurrentUser;
  config: AppConfig;
  onLogout: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const isAdmin = user.role === "admin" || user.role === "system_admin";
  const navigation = [
    ...baseNavigation,
    ...(isAdmin
      ? [
          { to: "/submissions/shared", label: "查看其他部门已填报", icon: ListChecks },
          { to: "/admin/reviews", label: "审核中心", icon: ClipboardCheck },
          { to: "/admin/publication", label: "周安排发布", icon: CalendarDays },
          { to: "/publications", label: "已发布安排", icon: CalendarDays },
          { to: "/admin/settings", label: "系统管理", icon: Settings },
        ]
      : [{ to: "/publications", label: "已发布安排", icon: CalendarDays }]),
  ];

  async function logout() {
    await mutation("/auth/logout", "POST");
    onLogout();
    navigate("/");
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-ink-950 text-white">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <img
          src="/brand/logo.svg"
          alt="WeeklyScheduling 标志"
          className="size-12 shrink-0 rounded-md object-contain"
        />
        <div>
          <div className="font-serif-cn text-base font-bold tracking-wide">{config.schoolName}</div>
          <div className="mt-0.5 text-xs text-white/55">一周工作安排系统</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 p-3" aria-label="主导航">
        {navigation.map(({ to, label, icon: Icon, ...item }) => (
          <NavLink
            key={to}
            to={to}
            end={"end" in item ? item.end : false}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-white/68 transition hover:bg-white/8 hover:text-white",
                isActive && "bg-white/12 text-white shadow-inner",
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-brand-700 text-sm font-bold">
            {user.name.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="text-xs text-white/50">
              {user.role === "staff" ? "工作人员" : user.role === "admin" ? "管理员" : "系统管理员"}
            </div>
          </div>
          <button
            className="rounded-md p-2 text-white/55 transition hover:bg-white/10 hover:text-white"
            onClick={logout}
            title="退出登录"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <p className="text-xs leading-5 text-white/45">
          {config.academicYear}学年度 · 第{config.semester}学期
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-slate-950/45"
            onClick={() => setMobileOpen(false)}
            aria-label="关闭导航"
          />
          <aside className="relative h-full w-[min(86vw,320px)] shadow-2xl">
            {sidebar}
            <button
              className="absolute right-3 top-3 rounded-md p-2 text-white/70"
              onClick={() => setMobileOpen(false)}
              aria-label="关闭导航"
            >
              <X className="size-5" />
            </button>
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-paper/92 px-4 backdrop-blur lg:hidden">
          <button
            className="rounded-md p-2 text-ink-900"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航"
          >
            <Menu className="size-5" />
          </button>
          <span className="font-serif-cn text-sm font-bold text-ink-900">{config.schoolName}</span>
          <span className="w-9" />
        </div>
        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
