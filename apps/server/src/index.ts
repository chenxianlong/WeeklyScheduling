import { config } from "./config.js";
import { createApp } from "./app.js";

const app = createApp();
app.listen(config.port, config.host, () => {
  console.log(`Meeting Schedule API listening on ${config.appUrl}`);
});

export { app };
