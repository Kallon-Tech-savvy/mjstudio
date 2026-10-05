import "dotenv/config";
import { scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";

const [email, password] = process.argv.slice(2);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const users = await db.query(
  `SELECT email, password_hash,
          (SELECT count(*)::int FROM studio_members sm WHERE sm.user_id = u.id) AS memberships
     FROM users u ORDER BY email`,
);
console.log(`users in database: ${users.rowCount}`);
for (const r of users.rows) {
  const [scheme, salt = "", digest = ""] = (r.password_hash ?? "").split("$");
  console.log(
    `- ${r.email} | hash: ${scheme || "(none)"} salt=${salt.length} digest=${digest.length}` +
      ` (expected scrypt 16 64) | studio memberships: ${r.memberships}`,
  );
}

if (email && password) {
  const row = users.rows.find((r) => r.email.toLowerCase() === email.toLowerCase());
  if (!row) {
    console.log(`verify: no user with email "${email}"`);
  } else {
    const [scheme, salt, digest] = (row.password_hash ?? "").split("$");
    if (scheme !== "scrypt" || !salt || !digest) {
      console.log("verify: stored hash is not in scrypt$salt$digest format");
    } else {
      const expected = Buffer.from(digest, "hex");
      const actual = scryptSync(password, salt, expected.length);
      console.log(`verify: ${expected.length === actual.length && timingSafeEqual(expected, actual) ? "MATCH" : "NO MATCH"}`);
    }
  }
}
await db.end();
