import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function authorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = request.headers.get('x-admin-token') || '';
  return given === expected;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: '无权访问' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const orderId = String(body?.orderId || '');
  const action = String(body?.action || 'confirm');

  if (!orderId) return NextResponse.json({ error: '缺少订单号' }, { status: 400 });

  if (action === 'cancel') {
    const [updated] = await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, orderId))
      .returning();
    if (!updated) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
    return NextResponse.json({ status: updated.status });
  }

  const [updated] = await db
    .update(orders)
    .set({ status: 'paid', paidAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  if (!updated) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
  return NextResponse.json({ status: updated.status, credits: updated.credits });
}
