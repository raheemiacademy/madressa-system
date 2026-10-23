import type { DbOrTx } from '@/db';
import { auditLog } from '@/db/schema';

export type AuditActor = { identityId: number | null; name: string };
export type AuditEntry = { action: string; page: string; entity?: string; entityId?: string | number; details?: Record<string, unknown> };

/** Call with the same transaction as the change, so the change and its audit row commit together. */
export async function audit(db: DbOrTx, actor: AuditActor, e: AuditEntry) {
  await db.insert(auditLog).values({
    actorIdentityId: actor.identityId, actorName: actor.name, action: e.action, page: e.page,
    entity: e.entity ?? null, entityId: e.entityId === undefined ? null : String(e.entityId), details: e.details ?? null
  });
}
