import { Router } from "express";
import { sqlite } from "../db/client.js";
import { requireAuth } from "../middleware/auth.js";

export const metaRouter = Router();
metaRouter.use(requireAuth);

metaRouter.get("/", (_request, response) => {
  const departments = sqlite
    .prepare("SELECT id, name FROM departments WHERE enabled=1 ORDER BY sort_order, id")
    .all();
  const locations = sqlite
    .prepare(
      "SELECT id, name, capacity FROM locations WHERE enabled=1 ORDER BY sort_order, id",
    )
    .all();
  response.json({ departments, locations });
});
