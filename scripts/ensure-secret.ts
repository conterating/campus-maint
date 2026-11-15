// `npm run setup` helper: if .env has no BETTER_AUTH_SECRET, generate one.
// Never prints the secret.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const file = ".env";
if (!existsSync(file)) {
  console.log("No .env yet. Run `cp .env.example .env` first.");
  process.exit(0);
}
const text = readFileSync(file, "utf8");
const line = text.match(/^BETTER_AUTH_SECRET=(.*)$/m);
if (line && line[1].trim()) {
  console.log("BETTER_AUTH_SECRET is set.");
} else {
  const secret = randomBytes(32).toString("base64");
  const next = line ? text.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`) : `${text.trimEnd()}\nBETTER_AUTH_SECRET=${secret}\n`;
  writeFileSync(file, next);
  console.log("Generated BETTER_AUTH_SECRET in .env.");
}
