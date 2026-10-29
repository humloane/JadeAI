import { NextResponse } from 'next/server';

/** Tells the client whether the operator manages AI credentials centrally. */
export async function GET() {
  return NextResponse.json({
    managed: Boolean(process.env.AI_API_KEY),
    model: process.env.AI_API_KEY ? process.env.AI_MODEL || '' : '',
  });
}
