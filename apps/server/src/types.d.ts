import type { Role } from "../../../packages/shared/src/index.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
    csrfToken?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: {
        id: number;
        username: string;
        name: string;
        role: Role;
        avatar: string | null;
        departmentId: number | null;
      };
    }
  }
}

export {};
