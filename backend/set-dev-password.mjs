import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import pg from "pg";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error("usage: node set-dev-password.mjs <email> <password, 8+ chars>");
  process.exit(1);
}
const salt = randomBytes(8).toString("hex");
const hash = `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const r = await db.query(
  "UPDATE users SET password_hash = $1 WHERE lower(email) = lower($2)",
  [hash, email],
);
console.log(`updated ${r.rowCount} user(s)`);
await db.end();