import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { orders, users } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

function authorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = request.headers.get('x-admin-token') || request.nextUrl.searchParams.get('token') || '';
  return given === expected;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: '无权访问' }, { status: 401 });
  }

  const rows = await db
    .select({
      id: orders.id,
      plan: orders.plan,
      amountCents: orders.amountCents,
      credits: orders.credits,
      status: orders.status,
      note: orders.note,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(orders)
    .leftJoin(users, eq(orders.userId, users.id))
    .orderBy(desc(orders.createdAt))
    .limit(200);

  return NextResponse.json({ orders: rows });
}
