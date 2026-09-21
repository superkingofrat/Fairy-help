import "dotenv/config";
import { createApp } from "./app";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("Missing required environment variable JWT_SECRET");
  process.exit(1);
}

const app = createApp();
const port = process.env.PORT ?? "3000";

app.listen(port, () => {
  console.log(`Fairy API listening on port ${port}`);
});
