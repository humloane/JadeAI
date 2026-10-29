'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Loader2, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LanguageSelect } from '@/components/ui/language-select';
import { TEMPLATES } from '@/lib/constants';
import { TemplateThumbnail } from './template-thumbnail';
import { templateLabelsMap } from '@/lib/template-labels';
import { getAIHeaders } from '@/stores/settings-store';

interface GenerateResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

type GenerateState = 'form' | 'generating' | 'success' | 'error';

export function GenerateResumeDialog({ open, onOpenChange, onCreated }: GenerateResumeDialogProps) {
  const t = useTranslations('generateResume');
  const tGlobal = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [jobTitle, setJobTitle] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState<number | ''>('');
  const [skills, setSkills] = useState('');
  const [industry, setIndustry] = useState('');
  const [experience, setExperience] = useState('');
  const [extra, setExtra] = useState({
    period: '',
    education: '',
    daily: '',
    deliver: '',
    tools: '',
    scale: '',
  });
  const [template, setTemplate] = useState('classic');
  const [language, setLanguage] = useState(locale);
  const [state, setState] = useState<GenerateState>('form');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ resumeId: string; title: string } | null>(null);

  const buildExperience = () => {
    const labels: [keyof typeof extra, string][] = [
      ['period', '在职时间'],
      ['education', '最高学历与专业'],
      ['daily', '每天做的事'],
      ['deliver', '做完交给谁'],
      ['tools', '使用的工具'],
      ['scale', '负责范围或规模'],
    ];
    const filled = labels
      .filter(([k]) => extra[k].trim())
      .map(([k, label]) => `${label}：${extra[k].trim()}`);
    return [experience.trim(), ...filled].filter(Boolean).join('\n');
  };

  const handleGenerate = async () => {
    if (!jobTitle.trim()) return;
    setState('generating');
    setError('');

    try {
      const fingerprint = typeof window !== 'undefined' ? localStorage.getItem('jade_fingerprint') : null;
      const res = await fetch('/api/ai/generate-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fingerprint ? { 'x-fingerprint': fingerprint } : {}),
          ...getAIHeaders(),
        },
        body: JSON.stringify({
          jobTitle: jobTitle.trim(),
          yearsOfExperience: yearsOfExperience === '' ? undefined : yearsOfExperience,
          skills: skills.trim()
            ? skills.split(/[\s,，、]+/).map(s => s.trim()).filter(Boolean)
            : undefined,
          industry: industry.trim() || undefined,
          experience: buildExperience() || undefined,
          template,
          language,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      setResult(data);
      setState('success');
      onCreated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to generate resume');
      setState('error');
    }
  };

  const handleOpenResume = () => {
    if (result) {
      onOpenChange(false);
      router.push(`/editor/${result.resumeId}`);
    }
  };

  const handleRetry = () => {
    setState('form');
    setError('');
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setState('form');
      setJobTitle('');
      setYearsOfExperience('');
      setSkills('');
      setIndustry('');
      setExperience('');
      setExtra({ period: '', education: '', daily: '', deliver: '', tools: '', scale: '' });
      setTemplate('classic');
      setLanguage(locale);
      setError('');
      setResult(null);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-4">
          {state === 'form' && (
            <>
              {/* Row 1: Job Title + Years + Industry */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('jobTitle')} *
                  </label>
                  <Input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder={t('jobTitle')}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('yearsOfExperience')}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={yearsOfExperience}
                    onChange={(e) => setYearsOfExperience(e.target.value ? Number(e.target.value) : '')}
                    placeholder="3"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('industry')}
                  </label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder={t('industry')}
                  />
                </div>
              </div>

              {/* Skills */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('skills')}
                </label>
                <Input
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  placeholder={t('skillsPlaceholder')}
                />
              </div>

              {/* Work Experience */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {t('experience')}
                </label>
                <Textarea
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  placeholder={t('experiencePlaceholder')}
                  rows={4}
                  className="resize-none"
                />
              </div>

              {/* Interview prompts: answer a few plain questions instead of writing a resume */}
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    不会写？回答下面几句就够了
                  </p>
                  <span className="text-xs text-zinc-400">可只填一部分</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={extra.period}
                    onChange={(e) => setExtra((p) => ({ ...p, period: e.target.value }))}
                    placeholder="这份工作大概从什么时候到什么时候"
                  />
                  <Input
                    value={extra.education}
                    onChange={(e) => setExtra((p) => ({ ...p, education: e.target.value }))}
                    placeholder="最高学历、学校、专业、毕业年份"
                  />
                  <Input
                    value={extra.tools}
                    onChange={(e) => setExtra((p) => ({ ...p, tools: e.target.value }))}
                    placeholder="用什么工具：Excel、系统后台、纸质表格…"
                  />
                  <Input
                    value={extra.deliver}
                    onChange={(e) => setExtra((p) => ({ ...p, deliver: e.target.value }))}
                    placeholder="做完交给谁，他拿它干什么"
                  />
                  <Input
                    value={extra.scale}
                    onChange={(e) => setExtra((p) => ({ ...p, scale: e.target.value }))}
                    placeholder="负责多大范围，几个人一起干"
                  />
                  <Input
                    value={extra.daily}
                    onChange={(e) => setExtra((p) => ({ ...p, daily: e.target.value }))}
                    placeholder="每天上班第一件事做什么，多久做一次"
                  />
                </div>
              </div>

              {/* Row 2: Language + Template */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('language')}
                  </label>
                  <LanguageSelect value={language} onValueChange={setLanguage} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t('template')}
                  </label>
                  <Select value={template} onValueChange={setTemplate}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {TEMPLATES.map((tpl) => (
                        <SelectItem key={tpl} value={tpl}>
                          <span className="flex items-center gap-2">
                            <TemplateThumbnail template={tpl} className="h-8 w-6 shrink-0 rounded-sm ring-1 ring-zinc-200/50" />
                            {tGlobal(templateLabelsMap[tpl])}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {state === 'generating' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-brand mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('generating')}
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500 mb-3" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('success')}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {t('successDescription')}
              </p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-red-500 mb-3" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">
                {error || t('error')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4 dark:border-zinc-800">
          {state === 'form' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!jobTitle.trim()}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('generate')}
              </Button>
            </>
          )}
          {state === 'success' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleOpenResume}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('openResume')}
              </Button>
            </>
          )}
          {state === 'error' && (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="cursor-pointer"
              >
                {t('close')}
              </Button>
              <Button
                onClick={handleRetry}
                className="cursor-pointer bg-brand hover:bg-brand-hover"
              >
                {t('generate')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
