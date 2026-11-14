import { loadCustomerApiConfig } from "@kardo/config";
import { buildCustomerApi } from "./app.js";

const config = loadCustomerApiConfig();
const app = buildCustomerApi();

try {
  await app.listen({
    host: config.CUSTOMER_API_HOST,
    port: config.CUSTOMER_API_PORT,
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
