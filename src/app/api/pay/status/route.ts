import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';

export async function GET(request: NextRequest) {
  const user = await resolveUser(getUserIdFromRequest(request));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orderId = request.nextUrl.searchParams.get('orderId') || '';
  if (!orderId) return NextResponse.json({ error: '缺少订单号' }, { status: 400 });

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)))
    .limit(1);

  if (!order) return NextResponse.json({ error: '订单不存在' }, { status: 404 });
  return NextResponse.json({ status: order.status, credits: order.credits });
}
