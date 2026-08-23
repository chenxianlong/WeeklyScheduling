import type { NextFunction, Request, Response } from "express";
import type { Role } from "../../../../packages/shared/src/index.js";
import { sqlite } from "../db/client.js";
import { HttpError } from "../http.js";

const findUser = sqlite.prepare(`
  SELECT id, username, name, role, avatar, department_id AS departmentId
  FROM users WHERE id = ? AND status = 'active'
`);

export function attachUser(request: Request, _response: Response, next: NextFunction) {
  if (request.session.userId) {
    const user = findUser.get(request.session.userId) as Request["currentUser"] | undefined;
    if (user) request.currentUser = user;
    else request.session.userId = undefined;
  }
  next();
}

export function requireAuth(request: Request, _response: Response, next: NextFunction) {
  if (!request.currentUser) return next(new HttpError(401, "请先登录"));
  next();
}

export function requireRole(...roles: Role[]) {
  return (request: Request, _response: Response, next: NextFunction) => {
    if (!request.currentUser) return next(new HttpError(401, "请先登录"));
    if (!roles.includes(request.currentUser.role)) {
      return next(new HttpError(403, "无操作权限"));
    }
    next();
  };
}

export const requireAdmin = requireRole("admin", "system_admin");
