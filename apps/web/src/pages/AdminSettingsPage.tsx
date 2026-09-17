import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarRange, History, MapPin, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { roleLabels, type Role } from "@shared/index";
import { api, mutation } from "../lib/api";
import type { CurrentUser } from "../lib/types";
import { Button, Card, Field, Input, Select, Spinner } from "../components/ui";
import { PageHeader } from "../components/PageHeader";

type UserRow = {
  id: number;
  username: string;
  name: string;
  emails: string | null;
  role: Role;
  status: "active" | "disabled";
  departmentId: number | null;
  department: string | null;
  lastLoginAt: string | null;
};
type UserEdit = Pick<
  UserRow,
  "id" | "username" | "name" | "role" | "status" | "departmentId"
> & { password: string };
type UserCreate = Omit<UserEdit, "id">;
type ReferenceItem = {
  id: number;
  name: string;
  capacity?: number | null;
  sortOrder: number;
  enabled: number;
};
type ReferenceEdit = ReferenceItem & { enabled: number };
type AuditRow = {
  id: number;
  action: string;
  entityType: string | null;
  entityId: string | null;
  userName: string | null;
  ipAddress: string | null;
  createdAt: string;
};
type ScheduleSettings = {
  academicYear: string;
  semester: "一" | "二";
  preWeekStartDate: string | null;
  firstWeekStartDate: string | null;
};

function academicTermOptions(now = new Date()) {
  const firstYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 5 }, (_, offset) => {
    const startYear = firstYear + offset;
    const academicYear = `${startYear}-${startYear + 1}`;
    return (["一", "二"] as const).map((semester) => ({
      value: `${academicYear}|${semester}`,
      academicYear,
      semester,
      label: `${academicYear}学年度第${semester}学期`,
    }));
  }).flat();
}

const tabs = [
  { id: "users", label: "用户账号", icon: Users },
  { id: "schedule", label: "学期周次", icon: CalendarRange },
  { id: "departments", label: "部门", icon: Building2 },
  { id: "locations", label: "地点", icon: MapPin },
  { id: "audit", label: "审计日志", icon: History },
] as const;

export function AdminSettingsPage({ currentUser }: { currentUser: CurrentUser }) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("users");
  const [newName, setNewName] = useState("");
  const [newCapacity, setNewCapacity] = useState("");
  const [creatingUser, setCreatingUser] = useState<UserCreate | null>(null);
  const [editingUser, setEditingUser] = useState<UserEdit | null>(null);
  const [editingReference, setEditingReference] = useState<ReferenceEdit | null>(null);
  const [academicYear, setAcademicYear] = useState("");
  const [semester, setSemester] = useState<"一" | "二">("一");
  const [preWeekStartDate, setPreWeekStartDate] = useState("");
  const [firstWeekStartDate, setFirstWeekStartDate] = useState("");
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<{ rows: UserRow[] }>("/admin/users"),
  });
  const references = useQuery({
    queryKey: ["reference-data"],
    queryFn: () =>
      api<{ departments: ReferenceItem[]; locations: ReferenceItem[] }>("/admin/reference-data"),
  });
  const audit = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api<{ rows: AuditRow[] }>("/admin/audit-logs"),
  });
  const scheduleSettings = useQuery({
    queryKey: ["schedule-settings"],
    queryFn: () => api<ScheduleSettings>("/admin/schedule-settings"),
  });
  useEffect(() => {
    if (!scheduleSettings.data) return;
    setAcademicYear(scheduleSettings.data.academicYear);
    setSemester(scheduleSettings.data.semester);
    setPreWeekStartDate(scheduleSettings.data.preWeekStartDate ?? "");
    setFirstWeekStartDate(scheduleSettings.data.firstWeekStartDate ?? "");
  }, [scheduleSettings.data]);
  const createUser = useMutation({
    mutationFn: (input: UserCreate) => mutation<{ id: number }>("/admin/users", "POST", input),
    onSuccess: async () => {
      setCreatingUser(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const updateUser = useMutation({
    mutationFn: ({ id, ...input }: UserEdit) =>
      mutation(`/admin/users/${id}`, "PATCH", {
        ...input,
        password: input.password || undefined,
      }),
    onSuccess: async () => {
      setEditingUser(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
      ]);
    },
  });
  const deleteUser = useMutation({
    mutationFn: (id: number) => mutation(`/admin/users/${id}`, "DELETE"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    },
  });
  const createReference = useMutation({
    mutationFn: () =>
      mutation(`/admin/${tab}`, "POST", {
        name: newName,
        capacity: tab === "locations" && newCapacity ? Number(newCapacity) : null,
        sortOrder: 100,
        enabled: true,
      }),
    onSuccess: async () => {
      setNewName("");
      setNewCapacity("");
      await queryClient.invalidateQueries({ queryKey: ["reference-data"] });
    },
  });
  const updateReference = useMutation({
    mutationFn: ({ route, item }: { route: "departments" | "locations"; item: ReferenceEdit }) =>
      mutation(`/admin/${route}/${item.id}`, "PATCH", {
        name: item.name,
        capacity: route === "locations" ? item.capacity ?? null : null,
        sortOrder: item.sortOrder,
        enabled: Boolean(item.enabled),
      }),
    onSuccess: async () => {
      setEditingReference(null);
      await queryClient.invalidateQueries({ queryKey: ["reference-data"] });
    },
  });
  const deleteReference = useMutation({
    mutationFn: ({ route, id }: { route: "departments" | "locations"; id: number }) =>
      mutation(`/admin/${route}/${id}`, "DELETE"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reference-data"] });
    },
  });
  const updateScheduleSettings = useMutation({
    mutationFn: () =>
      mutation<ScheduleSettings>("/admin/schedule-settings", "PATCH", {
        academicYear,
        semester,
        preWeekStartDate,
        firstWeekStartDate,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schedule-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["session"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["submissions"] }),
        queryClient.invalidateQueries({ queryKey: ["reviews"] }),
        queryClient.invalidateQueries({ queryKey: ["publication-workspace"] }),
      ]);
    },
  });

  if (users.isLoading || references.isLoading || audit.isLoading || scheduleSettings.isLoading) {
    return <Spinner />;
  }
  const referenceRows =
    tab === "departments" ? references.data?.departments : references.data?.locations;
  const selectedTerm = `${academicYear}|${semester}`;
  const generatedTermOptions = academicTermOptions();
  const termOptions = generatedTermOptions.some((option) => option.value === selectedTerm)
    ? generatedTermOptions
    : [
        {
          value: selectedTerm,
          academicYear,
          semester,
          label: `${academicYear}学年度第${semester}学期`,
        },
        ...generatedTermOptions,
      ];

  return (
    <div className="page-enter">
      <PageHeader
        eyebrow="SYSTEM ADMINISTRATION"
        title="系统管理"
        description="管理登录账号、人员权限、可选部门和地点，并查看关键操作记录。"
      />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-[10px] border border-line bg-white p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${
              tab === id ? "bg-ink-900 text-white" : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === "users" && (
        <div className="grid gap-5">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingUser(null);
                setCreatingUser({
                  username: "",
                  name: "",
                  password: "",
                  departmentId: null,
                  role: "staff",
                  status: "active",
                });
              }}
            >
              <Plus className="size-4" /> 新增用户
            </Button>
          </div>
          {creatingUser && (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-serif-cn text-lg font-bold text-ink-900">新增登录账号</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    设置用户的初始密码、所属部门和角色权限，创建后立即生效。
                  </p>
                </div>
                <button
                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setCreatingUser(null)}
                  aria-label="关闭新增"
                >
                  <X className="size-4" />
                </button>
              </div>
              <form
                className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  createUser.mutate(creatingUser);
                }}
              >
                <Field label="登录账号" required hint="仅可使用小写字母、数字、点、下划线和连字符">
                  <Input
                    value={creatingUser.username}
                    onChange={(event) =>
                      setCreatingUser({ ...creatingUser, username: event.target.value.toLowerCase() })
                    }
                    autoComplete="off"
                    placeholder="例如：zhangsan"
                  />
                </Field>
                <Field label="显示名称" required>
                  <Input
                    value={creatingUser.name}
                    onChange={(event) =>
                      setCreatingUser({ ...creatingUser, name: event.target.value })
                    }
                    placeholder="例如：张三"
                  />
                </Field>
                <Field label="初始密码" required hint="至少 8 位，建议包含字母、数字和符号">
                  <Input
                    type="password"
                    value={creatingUser.password}
                    onChange={(event) =>
                      setCreatingUser({ ...creatingUser, password: event.target.value })
                    }
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="所属部门">
                  <Select
                    value={creatingUser.departmentId ?? ""}
                    onChange={(event) =>
                      setCreatingUser({
                        ...creatingUser,
                        departmentId: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  >
                    <option value="">不绑定部门</option>
                    {references.data?.departments
                      .filter((department) => department.enabled)
                      .map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="角色权限" hint="工作人员可填报；管理员可审核、发布和管理系统。">
                  <Select
                    value={creatingUser.role}
                    onChange={(event) =>
                      setCreatingUser({ ...creatingUser, role: event.target.value as Role })
                    }
                  >
                    {Object.entries(roleLabels)
                      .filter(
                        ([value]) => currentUser.role === "system_admin" || value !== "system_admin",
                      )
                      .map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="账号状态">
                  <Select
                    value={creatingUser.status}
                    onChange={(event) =>
                      setCreatingUser({
                        ...creatingUser,
                        status: event.target.value as "active" | "disabled",
                      })
                    }
                  >
                    <option value="active">启用</option>
                    <option value="disabled">停用</option>
                  </Select>
                </Field>
                {createUser.error && (
                  <p className="text-sm text-red-700 md:col-span-2 xl:col-span-3">
                    {createUser.error instanceof Error ? createUser.error.message : "创建用户失败"}
                  </p>
                )}
                <div className="flex gap-3 md:col-span-2 xl:col-span-3">
                  <Button
                    type="submit"
                    loading={createUser.isPending}
                    disabled={
                      !creatingUser.username.trim() ||
                      !creatingUser.name.trim() ||
                      creatingUser.password.length < 8
                    }
                  >
                    创建用户
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setCreatingUser(null)}>
                    取消
                  </Button>
                </div>
              </form>
            </Card>
          )}
          {editingUser && (
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-serif-cn text-lg font-bold text-ink-900">编辑登录账号</h2>
                  <p className="mt-1 text-sm text-slate-500">修改后立即生效；密码留空则保持不变。</p>
                </div>
                <button
                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setEditingUser(null)}
                  aria-label="关闭编辑"
                >
                  <X className="size-4" />
                </button>
              </div>
              <form
                className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  updateUser.mutate(editingUser);
                }}
              >
                <Field label="登录账号" required>
                  <Input
                    value={editingUser.username}
                    onChange={(event) =>
                      setEditingUser({ ...editingUser, username: event.target.value.toLowerCase() })
                    }
                    autoComplete="off"
                  />
                </Field>
                <Field label="显示名称" required>
                  <Input
                    value={editingUser.name}
                    onChange={(event) =>
                      setEditingUser({ ...editingUser, name: event.target.value })
                    }
                  />
                </Field>
                <Field label="重置密码" hint="至少 8 位；不修改请留空">
                  <Input
                    type="password"
                    value={editingUser.password}
                    onChange={(event) =>
                      setEditingUser({ ...editingUser, password: event.target.value })
                    }
                    autoComplete="new-password"
                    placeholder="留空则保持原密码"
                  />
                </Field>
                <Field label="所属部门">
                  <Select
                    value={editingUser.departmentId ?? ""}
                    onChange={(event) =>
                      setEditingUser({
                        ...editingUser,
                        departmentId: event.target.value ? Number(event.target.value) : null,
                      })
                    }
                  >
                    <option value="">不绑定部门</option>
                    {references.data?.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="角色">
                  <Select
                    value={editingUser.role}
                    onChange={(event) =>
                      setEditingUser({ ...editingUser, role: event.target.value as Role })
                    }
                  >
                    {Object.entries(roleLabels)
                      .filter(([value]) => currentUser.role === "system_admin" || value !== "system_admin")
                      .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="状态">
                  <Select
                    value={editingUser.status}
                    onChange={(event) =>
                      setEditingUser({
                        ...editingUser,
                        status: event.target.value as "active" | "disabled",
                      })
                    }
                  >
                    <option value="active">启用</option>
                    <option value="disabled">停用</option>
                  </Select>
                </Field>
                {updateUser.error && (
                  <p className="text-sm text-red-700 md:col-span-2 xl:col-span-3">
                    {updateUser.error instanceof Error ? updateUser.error.message : "保存失败"}
                  </p>
                )}
                <div className="flex gap-3 md:col-span-2 xl:col-span-3">
                  <Button
                    type="submit"
                    loading={updateUser.isPending}
                    disabled={
                      !editingUser.username.trim() ||
                      !editingUser.name.trim() ||
                      (!!editingUser.password && editingUser.password.length < 8)
                    }
                  >
                    保存账号设置
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => setEditingUser(null)}>
                    取消
                  </Button>
                </div>
              </form>
            </Card>
          )}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-5 py-3">姓名</th>
                    <th className="px-5 py-3">登录账号</th>
                    <th className="px-5 py-3">已验证邮箱</th>
                    <th className="px-5 py-3">所属部门</th>
                    <th className="px-5 py-3">角色</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">最后登录</th>
                    <th className="px-5 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.data?.rows.map((user) => (
                    <tr key={user.id}>
                      <td className="px-5 py-4 font-semibold text-ink-900">{user.name}</td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-600">{user.username}</td>
                      <td className="px-5 py-4 text-slate-600">
                        {user.emails ?? <span className="text-amber-700">未绑定</span>}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{user.department ?? "—"}</td>
                      <td className="px-5 py-4 text-slate-600">{roleLabels[user.role]}</td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            user.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {user.status === "active" ? "启用" : "停用"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString("zh-CN")
                          : "尚未登录"}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            className="min-h-9 px-3"
                            disabled={currentUser.role === "admin" && user.role === "system_admin"}
                            onClick={() => {
                              setCreatingUser(null);
                              setEditingUser({
                                id: user.id,
                                username: user.username,
                                name: user.name,
                                role: user.role,
                                status: user.status,
                                departmentId: user.departmentId,
                                password: "",
                              });
                            }}
                          >
                            <Pencil className="size-4" /> 编辑
                          </Button>
                          <Button
                            variant="ghost"
                            className="min-h-9 px-3 text-red-700 hover:bg-red-50"
                            disabled={
                              user.id === currentUser.id ||
                              (currentUser.role === "admin" && user.role === "system_admin")
                            }
                            loading={deleteUser.isPending}
                            onClick={() => {
                              if (window.confirm(`确定删除账号“${user.name}（${user.username}）”吗？删除后不可恢复。`)) {
                                deleteUser.mutate(user.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" /> 删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {deleteUser.error && (
            <p className="text-sm text-red-700">
              {deleteUser.error instanceof Error ? deleteUser.error.message : "删除账号失败"}
            </p>
          )}
        </div>
      )}
      {tab === "schedule" && (
        <Card className="max-w-3xl p-5 sm:p-6">
          <h2 className="font-serif-cn text-lg font-bold text-ink-900">学期周次设置</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            选择当前使用的学年学期，并设置开学预备周和第一周日期；第一周开始后系统每 7 天自动递增一个周次。
          </p>
          <form
            className="mt-6 grid gap-5 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateScheduleSettings.mutate();
            }}
          >
            <div className="sm:col-span-2">
              <Field label="学年学期" required>
                <Select
                  value={selectedTerm}
                  onChange={(event) => {
                    const [nextAcademicYear, nextSemester] = event.target.value.split("|");
                    setAcademicYear(nextAcademicYear);
                    setSemester(nextSemester as "一" | "二");
                  }}
                >
                  {termOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="开学预备周开始日期" required>
              <Input
                type="date"
                value={preWeekStartDate}
                onChange={(event) => setPreWeekStartDate(event.target.value)}
              />
            </Field>
            <Field label="第一周开始日期" required>
              <Input
                type="date"
                value={firstWeekStartDate}
                min={preWeekStartDate || undefined}
                onChange={(event) => setFirstWeekStartDate(event.target.value)}
              />
            </Field>
            {updateScheduleSettings.error && (
              <p className="text-sm text-red-700 sm:col-span-2">
                {updateScheduleSettings.error instanceof Error
                  ? updateScheduleSettings.error.message
                  : "保存失败"}
              </p>
            )}
            {updateScheduleSettings.isSuccess && (
              <p className="text-sm text-emerald-700 sm:col-span-2">周次设置已保存并立即生效。</p>
            )}
            <div className="sm:col-span-2">
              <Button
                type="submit"
                loading={updateScheduleSettings.isPending}
                disabled={
                  !academicYear ||
                  !preWeekStartDate ||
                  !firstWeekStartDate ||
                  preWeekStartDate >= firstWeekStartDate
                }
              >
                保存周次设置
              </Button>
            </div>
          </form>
        </Card>
      )}
      {(tab === "departments" || tab === "locations") && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <div className="divide-y divide-line">
              {referenceRows?.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  {editingReference?.id === item.id ? (
                    <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_140px_120px_auto] sm:items-end">
                      <Field label="名称">
                        <Input
                          value={editingReference.name}
                          onChange={(event) => setEditingReference({ ...editingReference, name: event.target.value })}
                        />
                      </Field>
                      {tab === "locations" && (
                        <Field label="容纳人数">
                          <Input
                            type="number"
                            min={1}
                            value={editingReference.capacity ?? ""}
                            onChange={(event) =>
                              setEditingReference({
                                ...editingReference,
                                capacity: event.target.value ? Number(event.target.value) : null,
                              })
                            }
                          />
                        </Field>
                      )}
                      <Field label="状态">
                        <Select
                          value={editingReference.enabled}
                          onChange={(event) =>
                            setEditingReference({ ...editingReference, enabled: Number(event.target.value) })
                          }
                        >
                          <option value={1}>启用</option>
                          <option value={0}>停用</option>
                        </Select>
                      </Field>
                      <div className="flex gap-2">
                        <Button
                          loading={updateReference.isPending}
                          disabled={!editingReference.name.trim()}
                          onClick={() =>
                            updateReference.mutate({
                              route: tab,
                              item: editingReference,
                            })
                          }
                        >
                          保存
                        </Button>
                        <Button variant="secondary" onClick={() => setEditingReference(null)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink-900">{item.name}</p>
                        {tab === "locations" && item.capacity && (
                          <p className="mt-1 text-xs text-slate-400">容纳 {item.capacity} 人</p>
                        )}
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          item.enabled ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {item.enabled ? "启用" : "停用"}
                      </span>
                      <Button
                        variant="ghost"
                        className="min-h-9 px-3"
                        onClick={() => setEditingReference({ ...item, enabled: Number(item.enabled) })}
                      >
                        <Pencil className="size-4" /> 编辑
                      </Button>
                      <Button
                        variant="ghost"
                        className="min-h-9 px-3 text-red-700 hover:bg-red-50"
                        loading={deleteReference.isPending}
                        onClick={() => {
                          if (window.confirm(`确定删除${tab === "departments" ? "部门" : "地点"}“${item.name}”吗？删除后不可恢复。`)) {
                            deleteReference.mutate({ route: tab, id: item.id });
                          }
                        }}
                      >
                        <Trash2 className="size-4" /> 删除
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {(updateReference.error || deleteReference.error) && (
              <p className="border-t border-line px-5 py-3 text-sm text-red-700">
                {updateReference.error instanceof Error
                  ? updateReference.error.message
                  : deleteReference.error instanceof Error
                    ? deleteReference.error.message
                    : "操作失败"}
              </p>
            )}
          </Card>
          <Card className="h-fit p-5">
            <h2 className="font-serif-cn text-lg font-bold text-ink-900">
              新增{tab === "departments" ? "部门" : "地点"}
            </h2>
            <div className="mt-5 grid gap-3">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder={tab === "departments" ? "部门名称" : "地点名称"}
              />
              {tab === "locations" && (
                <Input
                  type="number"
                  min={1}
                  value={newCapacity}
                  onChange={(event) => setNewCapacity(event.target.value)}
                  placeholder="容纳人数（可选）"
                />
              )}
              <Button
                disabled={!newName.trim()}
                loading={createReference.isPending}
                onClick={() => createReference.mutate()}
              >
                <Plus className="size-4" /> 添加
              </Button>
            </div>
          </Card>
        </div>
      )}
      {tab === "audit" && (
        <Card className="overflow-hidden">
          {!audit.data?.rows.length ? (
            <p className="p-8 text-center text-sm text-slate-500">尚无审计记录。</p>
          ) : (
            <div className="divide-y divide-line">
              {audit.data.rows.map((row) => (
                <div key={row.id} className="grid gap-2 px-5 py-4 md:grid-cols-[180px_1fr_180px]">
                  <p className="font-mono text-xs font-semibold text-brand-700">{row.action}</p>
                  <p className="text-sm text-slate-600">
                    {row.userName ?? "系统"} · {row.entityType ?? "—"} {row.entityId ?? ""}
                  </p>
                  <p className="text-xs text-slate-400 md:text-right">
                    {new Date(row.createdAt).toLocaleString("zh-CN")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
