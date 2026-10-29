'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, QrCode, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  name: string;
  priceCents: number;
  credits: number;
  days: number | null;
  description: string;
}

interface OrderInfo {
  orderId: string;
  plan: string;
  amountCents: number;
  qrUrl: string;
  note: string;
}

export function UpgradeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [selected, setSelected] = useState('single');
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [status, setStatus] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const headers = useCallback(() => {
    const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
    return {
      'Content-Type': 'application/json',
      ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pay/entitlement', { headers: headers() });
      if (!res.ok) return;
      const data = await res.json();
      setPlans(data.plans || []);
      setCredits(data.credits ?? 0);
    } catch {
      /* ignore */
    }
  }, [headers]);

  useEffect(() => {
    if (open) {
      void load();
      setOrder(null);
      setStatus('');
      setError('');
    }
  }, [open, load]);

  // Poll the order until the operator confirms it.
  useEffect(() => {
    if (!order) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/pay/status?orderId=${order.orderId}`, { headers: headers() });
        if (!res.ok) return;
        const data = await res.json();
        setStatus(data.status);
        if (data.status === 'paid') {
          clearInterval(timer);
          await load();
        }
      } catch {
        /* ignore */
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [order, headers, load]);

  const createOrder = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/pay/order', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ plan: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '下单失败');
      }
      setOrder(await res.json());
      setStatus('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '下单失败');
    } finally {
      setBusy(false);
    }
  };

  const markSubmitted = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pay/submit', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ orderId: order.orderId }),
      });
      if (res.ok) setStatus('submitted');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导出次数</DialogTitle>
          <DialogDescription>
            当前剩余 {credits === null ? '—' : credits} 次。付费后即可导出无水印 PDF / Word。
          </DialogDescription>
        </DialogHeader>

        {!order && (
          <div className="space-y-3">
            <div className="space-y-2">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelected(plan.id)}
                  className={cn(
                    'w-full cursor-pointer rounded-xl border-2 p-3 text-left transition-colors',
                    selected === plan.id
                      ? 'border-brand bg-brand/5'
                      : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{plan.name}</span>
                    <span className="text-lg font-semibold text-brand">
                      ¥{(plan.priceCents / 100).toFixed(plan.priceCents % 100 === 0 ? 0 : 2)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{plan.description}</p>
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button className="w-full" onClick={() => void createOrder()} disabled={busy || plans.length === 0}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              生成收款码
            </Button>
          </div>
        )}

        {order && (
          <div className="space-y-3">
            <div className="rounded-xl border border-zinc-200 p-4 text-center dark:border-zinc-700">
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-300">
                请扫码支付 <span className="font-semibold text-brand">¥{(order.amountCents / 100).toFixed(2)}</span>
              </p>
              {/* Drop your own payment QR at public/pay-qr.png */}
              <img
                src={order.qrUrl}
                alt="收款码"
                className="mx-auto h-48 w-48 rounded-lg border border-zinc-200 object-contain dark:border-zinc-700"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
              <p className="mt-2 flex items-center justify-center gap-1 text-xs text-zinc-400">
                <QrCode className="h-3 w-3" /> 请备注：{order.note}
              </p>
            </div>

            {status === 'paid' ? (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-green-50 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" /> 已到账，可以导出了
              </div>
            ) : (
              <>
                <Button className="w-full" onClick={() => void markSubmitted()} disabled={busy || status === 'submitted'}>
                  {status === 'submitted' ? '已提交，等待确认' : '我已支付'}
                </Button>
                <p className="text-center text-xs text-zinc-400">
                  付款后点「我已支付」，确认到账后额度自动到账（通常几分钟内）。
                </p>
              </>
            )}

            <Button variant="ghost" className="w-full" onClick={() => setOrder(null)}>
              换个套餐
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
