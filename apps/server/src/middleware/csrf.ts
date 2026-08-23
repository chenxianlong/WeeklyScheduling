import type { NextFunction, Request, Response } from "express";
import { nanoid } from "nanoid";
import { HttpError } from "../http.js";

export function ensureCsrf(request: Request) {
  request.session.csrfToken ??= nanoid(32);
  return request.session.csrfToken;
}

export function csrfProtection(request: Request, _response: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next();
  const provided = request.header("x-csrf-token");
  if (!request.session.csrfToken || provided !== request.session.csrfToken) {
    return next(new HttpError(403, "安全令牌已失效，请刷新页面后重试"));
  }
  next();
}
