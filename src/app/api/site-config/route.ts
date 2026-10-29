import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { plans, siteSettings, templates } from '@/lib/db/schema';
import { asc, eq } from 'drizzle-orm';

/** Public site configuration consumed by the frontend. */
export async function GET() {
  const [settings, planRows, templateRows] = await Promise.all([
    db.select().from(siteSettings),
    db.select().from(plans).where(eq(plans.enabled, true)).orderBy(asc(plans.sortOrder)),
    db.select().from(templates).where(eq(templates.enabled, true)).orderBy(asc(templates.sortOrder)),
  ]);

  return NextResponse.json({
    settings: Object.fromEntries(settings.map((s: { key: string; value: unknown }) => [s.key, s.value])),
    plans: planRows,
    templates: templateRows.map((t: { id: string }) => t.id),
  });
}
