import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditAction } from "./domain";

type Db = PrismaClient | Prisma.TransactionClient;

/** Fields never copied into audit snapshots. */
const SECRET_KEYS = new Set(["password", "gtId", "token", "secret", "backupCodes"]);

function snapshot(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v, (k, val) => (SECRET_KEYS.has(k) ? "[redacted]" : val));
}

/** Record an account, permission, or impersonation change. */
export async function writeAudit(
  db: Db,
  entry: { actorId: string; action: AuditAction; targetType: string; targetId: string; before?: unknown; after?: unknown; at?: Date },
) {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: snapshot(entry.before),
      after: snapshot(entry.after),
      createdAt: entry.at ?? new Date(),
    },
  });
}
