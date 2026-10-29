import { NextResponse } from 'next/server';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { getEntitlement } from '@/lib/pay/entitlement';
import { PLANS } from '@/lib/pay/plans';

export async function GET(request: Request) {
  const user = await resolveUser(getUserIdFromRequest(request));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entitlement = await getEntitlement(user.id);
  return NextResponse.json({ ...entitlement, plans: PLANS });
}
