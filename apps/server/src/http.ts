import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const asyncRoute =
  (handler: (request: Request, response: Response, next: NextFunction) => unknown) =>
  (request: Request, response: Response, next: NextFunction) =>
    Promise.resolve(handler(request, response, next)).catch(next);

export function notFound(request: Request, _response: Response, next: NextFunction) {
  next(new HttpError(404, `接口不存在：${request.method} ${request.path}`));
}

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof ZodError) {
    return response.status(422).json({
      message: "提交内容不符合要求",
      errors: error.flatten(),
    });
  }
  if (error instanceof HttpError) {
    return response.status(error.status).json({
      message: error.message,
      details: error.details,
    });
  }
  console.error(error);
  return response.status(500).json({ message: "服务器处理请求时发生错误" });
}
