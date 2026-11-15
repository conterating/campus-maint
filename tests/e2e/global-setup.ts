import { rmSync } from "node:fs";
import path from "node:path";

// Fresh sign-ins and an empty dev mail outbox for every run.
export default function globalSetup() {
  const root = process.cwd();
  rmSync(path.join(root, "tests/e2e/.auth"), { recursive: true, force: true });
  rmSync(path.join(root, ".mail"), { recursive: true, force: true });
}
