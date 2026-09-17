import { Router } from "express";
import { z } from "zod";
import { nowIso, sqlite } from "../db/client.js";
import { asyncRoute, HttpError } from "../http.js";
import { ensureCsrf } from "../middleware/csrf.js";
import { audit } from "../services/audit.js";
import { verifyPassword } from "../services/password.js";
import { currentWeek, getScheduleSettings } from "../services/schedule-settings.js";
import { config } from "../config.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入登录账号").max(50),
  password: z.string().min(1, "请输入密码").max(128),
});

authRouter.get("/csrf", (request, response) => {
  response.json({ csrfToken: ensureCsrf(request) });
});

authRouter.get("/me", (request, response) => {
  const settings = getScheduleSettings();
  response.json({
    user: request.currentUser ?? null,
    config: {
      currentWeek: currentWeek(),
      schoolName: config.organizationName,
      emailAllowedDomain: config.emailAllowedDomain,
      ...settings,
    },
  });
});

authRouter.post(
  "/login",
  asyncRoute(async (request, response) => {
    const input = loginSchema.parse(request.body);
    const user = sqlite
      .prepare(
        `SELECT id, username, password_hash AS passwordHash, name, role, status, avatar,
         department_id AS departmentId
         FROM users WHERE username = ? COLLATE NOCASE`,
      )
      .get(input.username) as
      | {
          id: number;
          username: string;
          passwordHash: string;
          name: string;
          role: "staff" | "admin" | "system_admin";
          status: "active" | "disabled";
          avatar: string | null;
          departmentId: number | null;
        }
      | undefined;

    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      throw new HttpError(401, "账号或密码不正确");
    }
    if (user.status !== "active") throw new HttpError(403, "该账号已被停用，请联系管理员");

    await new Promise<void>((resolve, reject) => {
      request.session.regenerate((error) => (error ? reject(error) : resolve()));
    });
    request.session.userId = user.id;
    ensureCsrf(request);
    const stamp = nowIso();
    sqlite.prepare("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?").run(stamp, stamp, user.id);
    request.currentUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      departmentId: user.departmentId,
    };
    audit(request, "auth.login", "user", user.id);
    response.json({ user: request.currentUser });
  }),
);

authRouter.post("/logout", (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie("meeting.sid");
    response.json({ ok: true });
  });
});
