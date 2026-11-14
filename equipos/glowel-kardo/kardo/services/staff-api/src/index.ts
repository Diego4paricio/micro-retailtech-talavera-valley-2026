import { loadStaffApiConfig } from "@kardo/config";
import { buildStaffApi } from "./app.js";

const config = loadStaffApiConfig();
const app = buildStaffApi();

try {
  await app.listen({
    host: config.STAFF_API_HOST,
    port: config.STAFF_API_PORT,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
