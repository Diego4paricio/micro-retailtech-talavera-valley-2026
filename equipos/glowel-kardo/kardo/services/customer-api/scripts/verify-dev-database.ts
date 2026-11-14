import { loadCustomerApiConfig } from "@kardo/config";
import { createDatabaseClient } from "../src/db.js";
import { createPostgresCustomerWorkspaceRepository } from "../src/repositories/workspaces.js";

const config = loadCustomerApiConfig();
if (!config.SUPABASE_DATABASE_URL) {
  throw new Error(
    "SUPABASE_DATABASE_URL is required for the development database check.",
  );
}

const sql = createDatabaseClient(config.SUPABASE_DATABASE_URL);
const repository = createPostgresCustomerWorkspaceRepository(sql);
try {
  const workspaces = await repository.listForCustomer({
    subject: "00000000-0000-0000-0000-000000000000",
    email: "sentinel@kardo.test",
  });
  if (workspaces.length !== 0) {
    throw new Error(
      "The sentinel subject must not own a development workspace.",
    );
  }
  console.log("Customer API database role and workspace query verified.");
} finally {
  await sql.end();
}
