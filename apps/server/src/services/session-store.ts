import session from "express-session";
import { sqlite } from "../db/client.js";

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    expired INTEGER NOT NULL,
    sess TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expired_idx ON sessions(expired);
  DELETE FROM sessions WHERE expired < unixepoch('now') * 1000;
`);

export class BetterSqliteSessionStore extends session.Store {
  get(sid: string, callback: (error?: unknown, session?: session.SessionData | null) => void) {
    try {
      const row = sqlite
        .prepare("SELECT sess FROM sessions WHERE sid=? AND expired>=?")
        .get(sid, Date.now()) as { sess: string } | undefined;
      callback(undefined, row ? (JSON.parse(row.sess) as session.SessionData) : null);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, value: session.SessionData, callback?: (error?: unknown) => void) {
    try {
      const expired =
        value.cookie.expires?.getTime() ?? Date.now() + Number(value.cookie.maxAge ?? 28_800_000);
      sqlite
        .prepare(
          `INSERT INTO sessions(sid, expired, sess) VALUES (?, ?, ?)
           ON CONFLICT(sid) DO UPDATE SET expired=excluded.expired, sess=excluded.sess`,
        )
        .run(sid, expired, JSON.stringify(value));
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (error?: unknown) => void) {
    try {
      sqlite.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, value: session.SessionData, callback?: (error?: unknown) => void) {
    try {
      const expired =
        value.cookie.expires?.getTime() ?? Date.now() + Number(value.cookie.maxAge ?? 28_800_000);
      sqlite.prepare("UPDATE sessions SET expired=? WHERE sid=?").run(expired, sid);
      callback?.();
    } catch (error) {
      callback?.(error);
    }
  }
}
