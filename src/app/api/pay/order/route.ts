import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { getPlan } from '@/lib/pay/plans';

export async function POST(request: NextRequest) {
  try {
    const user = await resolveUser(getUserIdFromRequest(request));
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const plan = getPlan(String(body?.plan || ''));
    if (!plan) return NextResponse.json({ error: '套餐不存在' }, { status: 400 });

    const [order] = await db
      .insert(orders)
      .values({
        userId: user.id,
        plan: plan.id,
        amountCents: plan.priceCents,
        credits: plan.credits,
        status: 'pending',
        expiresAt: plan.days ? new Date(Date.now() + plan.days * 86400000) : null,
      })
      .returning();

    return NextResponse.json({
      orderId: order.id,
      plan: plan.id,
      amountCents: plan.priceCents,
      qrUrl: '/pay-qr.png',
      note: `订单号 ${order.id.slice(0, 8)}`,
    });
  } catch (error) {
    console.error('POST /api/pay/order error:', error);
    return NextResponse.json({ error: '下单失败' }, { status: 500 });
  }
}
