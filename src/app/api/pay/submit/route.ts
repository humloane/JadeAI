import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';

/** The buyer says "I paid" — the operator confirms out of band. */
export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(getUserIdFromRequest(request));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const orderId = String(body?.orderId || '');
    if (!orderId) return NextResponse.json({ error: '缺少订单号' }, { status: 400 });

    const [updated] = await db
      .update(orders)
      .set({ status: 'submitted' })
      .where(and(eq(orders.id, orderId), eq(orders.userId, user.id), eq(orders.status, 'pending')))
      .returning();

    if (!updated) return NextResponse.json({ error: '订单不存在或状态已变更' }, { status: 404 });
    return NextResponse.json({ status: updated.status });
  } catch (error) {
    console.error('POST /api/pay/submit error:', error);
    return NextResponse.json({ error: '提交失败' }, { status: 500 });
  }
}
