import { config } from "./config.js";
import { createApp } from "./app.js";
import { startEmailWorker } from "./services/email-notifications.js";

const app = createApp();
app.listen(config.port, config.host, () => {
  console.log(`Meeting Schedule API listening on ${config.appUrl}`);
  startEmailWorker();
});

export { app };
