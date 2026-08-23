import type { Request } from "express";
import { nowIso, sqlite } from "../db/client.js";

const insert = sqlite.prepare(`
  INSERT INTO audit_logs(user_id, action, entity_type, entity_id, detail_json, ip_address, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

export function audit(
  request: Request,
  action: string,
  entityType?: string,
  entityId?: string | number,
  detail?: unknown,
) {
  insert.run(
    request.currentUser?.id ?? null,
    action,
    entityType ?? null,
    entityId == null ? null : String(entityId),
    detail == null ? null : JSON.stringify(detail),
    request.ip,
    nowIso(),
  );
}
