'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mode = 'login' | 'register';

export function PasswordLoginForm({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('请填写邮箱和密码');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, password, name: name.trim() || undefined }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || '注册失败');
        }
      }

      const result = await signIn('password', {
        email: cleanEmail,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError(mode === 'register' ? '注册成功，但自动登录失败，请手动登录' : '邮箱或密码不正确');
        setLoading(false);
        return;
      }

      window.location.href = result?.url || callbackUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请重试');
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={submit} className="space-y-3">
        {mode === 'register' && (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="称呼（可不填）"
            autoComplete="name"
            className="h-11 rounded-xl"
          />
        )}
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱"
          autoComplete="email"
          required
          className="h-11 rounded-xl"
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'register' ? '设置密码（至少 6 位）' : '密码'}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          required
          className="h-11 rounded-xl"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {mode === 'register' ? '注册并登录' : '登录'}
        </Button>
      </form>

      <div className="mt-3 text-center text-sm text-zinc-500">
        {mode === 'login' ? (
          <button
            type="button"
            className="cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={() => {
              setMode('register');
              setError('');
            }}
          >
            还没有账号？<span className="font-medium text-brand">免费注册</span>
          </button>
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200"
            onClick={() => {
              setMode('login');
              setError('');
            }}
          >
            已有账号？<span className="font-medium text-brand">去登录</span>
          </button>
        )}
      </div>

      {googleEnabled && (
        <Button
          type="button"
          variant="outline"
          onClick={() => signIn('google', { callbackUrl })}
          className="mt-4 h-11 w-full cursor-pointer rounded-xl"
        >
          使用 Google 登录
        </Button>
      )}
    </div>
  );
}
