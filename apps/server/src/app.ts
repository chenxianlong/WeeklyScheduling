import express from "express";
import session from "express-session";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import "./db/migrate.js";
import { attachUser } from "./middleware/auth.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFound } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { metaRouter } from "./routes/meta.js";
import { publicationsRouter } from "./routes/publications.js";
import { reviewsRouter } from "./routes/reviews.js";
import { submissionsRouter } from "./routes/submissions.js";
import { BetterSqliteSessionStore } from "./services/session-store.js";
import { adminRouter } from "./routes/admin.js";
import { accountRouter } from "./routes/account.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: config.isProduction
        ? { directives: { upgradeInsecureRequests: null } }
        : false,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(
    session({
      store: new BetterSqliteSessionStore(),
      name: "meeting.sid",
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: config.isProduction && config.appUrl.startsWith("https://"),
        maxAge: 8 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(
    "/api/auth",
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use(attachUser);
  app.use("/api", csrfProtection);
  app.use("/api/auth", authRouter);
  app.use("/api/account", accountRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/meta", metaRouter);
  app.use("/api/submissions", submissionsRouter);
  app.use("/api/admin/reviews", reviewsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/publications", publicationsRouter);

  if (config.isProduction) {
    const webDist = path.resolve(process.cwd(), "apps/web/dist");
    if (fs.existsSync(webDist)) {
      app.use(express.static(webDist, { index: false }));
      app.get("*path", (_request, response) =>
        response.sendFile(path.join(webDist, "index.html")),
      );
    }
  }
  app.use("/api", notFound);
  app.use(errorHandler);
  return app;
}
