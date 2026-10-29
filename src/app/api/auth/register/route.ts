import { NextRequest, NextResponse } from 'next/server';
import { userRepository } from '@/lib/db/repositories/user.repository';
import { hashPassword } from '@/lib/auth/password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const name = String(body?.name || '').trim() || undefined;

    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
    }

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      return NextResponse.json({ error: '该邮箱已注册' }, { status: 409 });
    }

    const user = await userRepository.create({
      email,
      name,
      authType: 'local',
      passwordHash: hashPassword(password),
    });
    if (!user) {
      return NextResponse.json({ error: '注册失败' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, userId: user.id });
  } catch {
    return NextResponse.json({ error: '注册失败' }, { status: 500 });
  }
}
