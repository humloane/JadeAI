'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, Wand2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useResumeStore } from '@/stores/resume-store';
import { getAIHeaders } from '@/stores/settings-store';

interface Finding {
  dimension: string;
  severity: 'hard' | 'soft';
  path: string;
  excerpt: string;
  problem: string;
  suggestion: string;
  autoFix: boolean;
}

interface Dimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  comment: string;
}

interface ScoreResult {
  total: number;
  dimensions: Dimension[];
  findings: Finding[];
  stats: { bullets: number; withNumbers: number; weakOpeners: number; aiPhrases: number; missingFields: string[] };
}

const BAR_COLORS: Record<string, string> = {
  completeness: '#2c6aa3',
  expression: '#c2410c',
  match: '#7c3aed',
  credibility: '#0f766e',
  authenticity: '#b45309',
};

/** Set a value at a path like `items[0].highlights[1]` inside a content object. */
function setAtPath(target: any, path: string, value: string): boolean {
  const parts = path.match(/[^.[\]]+/g);
  if (!parts || parts.length === 0) return false;
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (cursor?.[key] == null) return false;
    cursor = cursor[key];
  }
  const last = parts[parts.length - 1];
  cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
  return true;
}

export function ScoreDialog({ resumeId, open, onOpenChange }: { resumeId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { sections, updateSection } = useResumeStore();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const res = await fetch('/api/ai/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
        },
        body: JSON.stringify({ resumeId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '评分失败');
      }
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : '评分失败');
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const applyFix = async (finding: Finding) => {
    const [sectionType, ...rest] = finding.path.split('.');
    const section = sections.find((s) => s.type === sectionType);
    if (!section) {
      toast.error('找不到对应区块');
      return;
    }

    setFixing(finding.path);
    try {
      const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const res = await fetch('/api/ai/fix-line', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
        body: JSON.stringify({
          text: finding.excerpt,
          problem: finding.problem,
          suggestion: finding.suggestion,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '改写失败');
      }
      const data = await res.json();
      if (data.needsInput) {
        toast.info(data.question || '这条信息太少，先补一句具体情况', { duration: 8000 });
        return;
      }
      const text = data.text as string;

      const nextContent = JSON.parse(JSON.stringify(section.content));
      const ok = rest.length
        ? setAtPath(nextContent, rest.join('.'), text)
        : (() => {
            nextContent.text = text;
            return true;
          })();
      if (!ok) throw new Error('无法定位要修改的位置');

      updateSection(section.id, nextContent);
      toast.success('已替换，可撤销');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '改写失败');
    } finally {
      setFixing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            简历评分
          </DialogTitle>
          <DialogDescription>按完整性、表达、匹配度、可信度、真实度打分，每条扣分都给出改法。</DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10 text-sm text-zinc-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在评分…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/40">{error}</div>
        )}

        {result && !loading && (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <span className="text-4xl font-semibold" style={{ color: result.total >= 80 ? '#15803d' : result.total >= 60 ? '#b45309' : '#b91c1c' }}>
                {result.total}
              </span>
              <span className="pb-1 text-sm text-zinc-500">/ 100</span>
              <span className="pb-1 text-xs text-zinc-400">
                {result.stats.bullets} 条要点 · {result.stats.withNumbers} 条含数字
              </span>
            </div>

            <div className="space-y-2">
              {result.dimensions.map((dim) => (
                <div key={dim.key}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{dim.label}</span>
                    <span className="text-zinc-500">
                      {dim.key === 'match' && dim.comment.includes('未提供') ? '未提供 JD' : `${dim.score} · ${dim.comment}`}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${dim.score}%`, background: BAR_COLORS[dim.key] || '#71717a' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 dark:border-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                扣分点 {result.findings.length} 条
              </p>
              <div className="space-y-2">
                {result.findings.map((f, i) => (
                  <div key={`${f.path}-${i}`} className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                    <div className="flex items-start gap-2">
                      {f.severity === 'hard' ? (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-800 dark:text-zinc-200">{f.problem}</p>
                        {f.excerpt && <p className="mt-0.5 truncate text-xs text-zinc-400">「{f.excerpt}」</p>}
                        <p className="mt-1 text-xs text-zinc-500">→ {f.suggestion}</p>
                      </div>
                      {f.autoFix && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 gap-1"
                          disabled={fixing === f.path}
                          onClick={() => void applyFix(f)}
                        >
                          {fixing === f.path ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                          AI 改
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void load()} disabled={loading}>
                重新评分
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
