import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { Button, Card, Field, Input, Spinner } from "../components/ui";
import { api, mutation } from "../lib/api";

type EmailRow = {
  id: number;
  email: string;
  verifiedAt: string | null;
  verificationExpiresAt: string | null;
  createdAt: string;
};

export function AccountEmailsPage() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [codes, setCodes] = useState<Record<number, string>>({});
  const emails = useQuery({
    queryKey: ["account-emails"],
    queryFn: () =>
      api<{ rows: EmailRow[]; allowedDomain: string; maxEmails: number }>("/account/emails"),
  });
  const requestVerification = useMutation({
    mutationFn: (address: string) => mutation("/account/emails", "POST", { email: address }),
    onSuccess: async () => {
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["account-emails"] });
    },
  });
  const verify = useMutation({
    mutationFn: ({ id, code }: { id: number; code: string }) =>
      mutation(`/account/emails/${id}/verify`, "POST", { code }),
    onSuccess: async (_data, variables) => {
      setCodes((current) => ({ ...current, [variables.id]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["account-emails"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => mutation(`/account/emails/${id}`, "DELETE"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["account-emails"] });
    },
  });

  if (emails.isLoading || !emails.data) return <Spinner />;
  const error = requestVerification.error ?? verify.error ?? remove.error;

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="ACCOUNT SECURITY"
        title="我的通知邮箱"
        description="绑定并验证学校邮箱；填报被管理员退回时，所有已验证邮箱都会收到通知。"
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-serif-cn text-lg font-bold text-ink-900">已添加邮箱</h2>
          </div>
          {!emails.data.rows.length ? (
            <div className="px-5 py-12 text-center text-sm text-slate-500">尚未绑定学校邮箱</div>
          ) : (
            <div className="divide-y divide-line">
              {emails.data.rows.map((row) => (
                <div key={row.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-2 font-semibold text-ink-900">
                        <Mail className="size-4 text-brand-700" /> {row.email}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.verifiedAt ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="size-3.5" /> 已验证，可接收退回通知
                          </span>
                        ) : (
                          "等待验证，请输入邮件中的 6 位验证码"
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="min-h-9 px-3 text-red-700 hover:bg-red-50"
                      loading={remove.isPending}
                      onClick={() => {
                        if (window.confirm(`确定解除邮箱“${row.email}”的绑定吗？`)) {
                          remove.mutate(row.id);
                        }
                      }}
                    >
                      <Trash2 className="size-4" /> 解绑
                    </Button>
                  </div>
                  {!row.verifiedAt && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Input
                        className="max-w-48"
                        inputMode="numeric"
                        maxLength={6}
                        value={codes[row.id] ?? ""}
                        onChange={(event) =>
                          setCodes((current) => ({
                            ...current,
                            [row.id]: event.target.value.replace(/\D/g, "").slice(0, 6),
                          }))
                        }
                        placeholder="6 位验证码"
                      />
                      <Button
                        loading={verify.isPending}
                        disabled={(codes[row.id] ?? "").length !== 6}
                        onClick={() => verify.mutate({ id: row.id, code: codes[row.id] ?? "" })}
                      >
                        <ShieldCheck className="size-4" /> 完成验证
                      </Button>
                      <Button
                        variant="secondary"
                        loading={requestVerification.isPending}
                        onClick={() => requestVerification.mutate(row.email)}
                      >
                        重新发送
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="h-fit p-5">
          <h2 className="font-serif-cn text-lg font-bold text-ink-900">添加学校邮箱</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            每个账号最多绑定 {emails.data.maxEmails} 个邮箱，仅支持 @{emails.data.allowedDomain}。
          </p>
          <form
            className="mt-5 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              requestVerification.mutate(email);
            }}
          >
            <Field label="学校邮箱" required>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value.toLowerCase())}
                placeholder={`name@${emails.data.allowedDomain}`}
                autoComplete="email"
              />
            </Field>
            <Button
              type="submit"
              loading={requestVerification.isPending}
              disabled={!email.endsWith(`@${emails.data.allowedDomain}`)}
            >
              发送验证码
            </Button>
          </form>
          {error && (
            <p className="mt-4 text-sm text-red-700">
              {error instanceof Error ? error.message : "操作失败，请稍后重试"}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
