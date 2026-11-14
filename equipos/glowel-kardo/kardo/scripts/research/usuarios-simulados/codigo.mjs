// Usage: node scripts/research/usuarios-simulados/codigo.mjs <email>
// Prints the 6-digit code for the latest signup or recovery token of a test
// account (kardo-dev only), the way `mi-correo` does for the personas: for
// testing by hand in a real Chrome without a real inbox (2026-10-04).
import { createHash, randomInt } from "node:crypto";
import { postgres, readEnv } from "../../video/lib.mjs";
const email = process.argv[2];
if (!/^delivered\+kardo-sim-.+@resend\.dev$/.test(email ?? "")) {
  console.error("Solo cuentas de prueba delivered+kardo-sim-…@resend.dev");
  process.exit(1);
}
const env = readEnv();
const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const [user] = await sql`select id from auth.users where lower(email) = lower(${email})`;
    const [token] = user
      ? await sql`select id, token_type from auth.one_time_tokens
          where user_id = ${user.id} and token_type in ('confirmation_token','recovery_token')
            and created_at > now() - interval '15 minutes'
          order by created_at desc limit 1`
      : [];
    if (token) {
      const code = String(randomInt(100000, 1000000));
      const hash = createHash("sha224").update(email + code).digest("hex");
      await sql.begin(async (tx) => {
        await tx`update auth.one_time_tokens set token_hash = ${hash} where id = ${token.id}`;
        if (token.token_type === "confirmation_token")
          await tx`update auth.users set confirmation_token = ${hash} where id = ${user.id}`;
        else await tx`update auth.users set recovery_token = ${hash} where id = ${user.id}`;
      });
      console.log(code);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  console.error("Sin código todavía");
  process.exit(2);
} finally {
  await sql.end();
}
