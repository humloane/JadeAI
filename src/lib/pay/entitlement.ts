import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

export interface Entitlement {
  credits: number;
  monthlyUntil: Date | null;
}

/** Credits and monthly expiry for a user, ignoring expired orders. */
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, 'paid')))
    .orderBy(asc(orders.createdAt));

  const now = Date.now();
  let credits = 0;
  let monthlyUntil: Date | null = null;

  for (const order of rows) {
    if (order.expiresAt && order.expiresAt.getTime() <= now) continue;
    credits += order.credits;
    if (order.expiresAt && (!monthlyUntil || order.expiresAt > monthlyUntil)) {
      monthlyUntil = order.expiresAt;
    }
  }

  return { credits, monthlyUntil };
}

/** Spend one credit from the oldest usable paid order. Returns false when none left. */
export async function consumeCredit(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, 'paid')))
    .orderBy(asc(orders.createdAt));

  const now = Date.now();
  for (const order of rows) {
    if (order.expiresAt && order.expiresAt.getTime() <= now) continue;
    if (order.credits <= 0) continue;
    await db.update(orders).set({ credits: order.credits - 1 }).where(eq(orders.id, order.id));
    return true;
  }
  return false;
}
