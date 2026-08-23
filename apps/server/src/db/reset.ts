import fs from "node:fs";
import { config } from "../config.js";

for (const suffix of ["", "-wal", "-shm"]) {
  const target = `${config.databasePath}${suffix}`;
  if (fs.existsSync(target)) fs.rmSync(target);
}
await import("./migrate.js");
await import("./seed.js");
