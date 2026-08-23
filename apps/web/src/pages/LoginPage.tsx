import { Building2, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { AppConfig } from "../lib/types";
import { mutation } from "../lib/api";
import { Button, Input } from "../components/ui";

export function LoginPage({
  config,
  onLoggedIn,
}: {
  config: AppConfig;
  onLoggedIn: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await mutation("/auth/login", "POST", { username, password });
      onLoggedIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-ink-950 text-white">
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:40px_40px]" />
      <div className="absolute -right-24 -top-24 size-[420px] rounded-full bg-brand-700/25 blur-3xl" />
      <main className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.1fr_.9fr]">
        <section>
          <div className="mb-10 flex items-center gap-4">
            <img
              src="/brand/logo.svg"
              alt="WeeklyScheduling 标志"
              className="size-20 rounded-[10px] object-contain shadow-2xl"
            />
            <div>
              <p className="font-serif-cn text-2xl font-bold tracking-wide">{config.schoolName}</p>
              <p className="mt-1 text-sm tracking-[0.12em] text-white/50">
                WEEKLY SCHEDULING
              </p>
            </div>
          </div>
          <p className="mb-4 text-xs font-bold tracking-[0.2em] text-emerald-300 uppercase">
            Weekly Operations
          </p>
          <h1 className="max-w-2xl font-serif-cn text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            一周工作安排
            <br />
            <span className="text-white/45">从填报到发布，清晰可循。</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-white/62">
            面向组织内部工作人员的会议活动填报、审核、周安排编辑、版本发布与 PDF 归档平台。
          </p>
          <div className="mt-10 flex flex-wrap gap-5 text-sm text-white/58">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-300" /> 独立账号安全认证
            </span>
            <span className="inline-flex items-center gap-2">
              <Building2 className="size-4 text-emerald-300" /> 部门专属填报账号
            </span>
          </div>
        </section>
        <section className="rounded-[10px] border border-white/12 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <p className="text-sm font-semibold text-emerald-300">身份验证</p>
          <h2 className="mt-2 font-serif-cn text-2xl font-bold">登录工作台</h2>
          <p className="mt-3 text-sm leading-6 text-white/55">
            请使用管理员分配的部门账号和密码登录。
          </p>
          <form className="mt-7 grid gap-4" onSubmit={login}>
            <label className="grid gap-2 text-sm font-semibold text-white/75">
              登录账号
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="border-white/15 bg-white/95 pl-10"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoFocus
                  placeholder="请输入登录账号"
                />
              </div>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-white/75">
              密码
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="border-white/15 bg-white/95 pl-10"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                />
              </div>
            </label>
            {error && (
              <p className="rounded-md border border-red-300/25 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {error}
              </p>
            )}
            <Button
              type="submit"
              className="mt-2 min-h-12 bg-white text-ink-950 hover:bg-emerald-50"
              loading={loading}
              disabled={!username.trim() || !password}
            >
              登录系统
            </Button>
          </form>
          <p className="mt-6 text-xs leading-5 text-white/35">
            当前学期：{config.academicYear}学年度第{config.semester}学期
          </p>
        </section>
      </main>
    </div>
  );
}
