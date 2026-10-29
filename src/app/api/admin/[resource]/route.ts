import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, siteSettings, templates, users, orders } from '@/lib/db/schema';
import { eq, asc, desc } from 'drizzle-orm';

const TABLES = { plans, templates, site_settings: siteSettings, users, orders } as const;
type Resource = keyof typeof TABLES;

function authorized(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const given = request.headers.get('x-admin-token') || request.nextUrl.searchParams.get('token') || '';
  return given === expected;
}

function table(resource: string) {
  return (TABLES as Record<string, unknown>)[resource] as (typeof TABLES)[Resource] | undefined;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: '无权访问' }, { status: 401 });
  const { resource } = await params;
  const key = resource === 'settings' ? 'site_settings' : resource;
  const t = table(key) as any;
  if (!t) return NextResponse.json({ error: '未知资源' }, { status: 404 });

  const rows = key === 'orders'
    ? await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(500)
    : key === 'users'
      ? await db.select({ id: users.id, email: users.email, name: users.name, authType: users.authType, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(500)
      : key === 'plans'
        ? await db.select().from(plans).orderBy(asc(plans.sortOrder))
        : key === 'templates'
          ? await db.select().from(templates).orderBy(asc(templates.sortOrder))
          : await db.select().from(siteSettings).orderBy(asc(siteSettings.key));

  return NextResponse.json({ rows });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: '无权访问' }, { status: 401 });
  const { resource } = await params;
  const body = await request.json().catch(() => ({}));

  if (resource === 'settings') {
    const entries = Object.entries(body?.settings || {});
    for (const [key, value] of entries) {
      await db
        .insert(siteSettings)
        .values({ key, value: value as any, updatedAt: new Date() })
        .onConflictDoUpdate({ target: siteSettings.key, set: { value: value as any, updatedAt: new Date() } });
    }
    return NextResponse.json({ ok: true, updated: entries.length });
  }

  if (resource === 'plans') {
    const id = String(body?.id || '');
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    await db.update(plans).set({
      name: body.name, priceCents: body.priceCents, credits: body.credits,
      days: body.days ?? null, description: body.description ?? null,
      enabled: Boolean(body.enabled), sortOrder: Number(body.sortOrder ?? 0),
    }).where(eq(plans.id, id));
    return NextResponse.json({ ok: true });
  }

  if (resource === 'templates') {
    const id = String(body?.id || '');
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    await db.update(templates).set({
      name: body.name, enabled: Boolean(body.enabled), sortOrder: Number(body.sortOrder ?? 0),
    }).where(eq(templates.id, id));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '该资源不支持修改' }, { status: 400 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: '无权访问' }, { status: 401 });
  const { resource } = await params;
  const body = await request.json().catch(() => ({}));

  if (resource === 'plans') {
    const id = String(body?.id || '').trim();
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    await db.insert(plans).values({
      id, name: String(body.name || id), priceCents: Number(body.priceCents || 0),
      credits: Number(body.credits || 0), days: body.days ?? null,
      description: body.description ?? null, enabled: body.enabled !== false,
      sortOrder: Number(body.sortOrder ?? 0),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: '该资源不支持新增' }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ resource: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: '无权访问' }, { status: 401 });
  const { resource } = await params;
  const id = request.nextUrl.searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

  if (resource === 'plans') {
    await db.delete(plans).where(eq(plans.id, id));
    return NextResponse.json({ ok: true });
  }
  if (resource === 'templates') {
    await db.delete(templates).where(eq(templates.id, id));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: '该资源不支持删除' }, { status: 400 });
}
