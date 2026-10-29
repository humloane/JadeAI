import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';

const SYSTEM = `You rewrite ONE resume line. Output only the rewritten line, no quotes, no explanation.

Hard rules:
1. Keep every fact: names, companies, tools, numbers, dates stay exactly as given.
2. Never invent a number, percentage, team size or amount. If the original has none, describe scope, frequency or object instead.
3. Do not upgrade responsibility: 负责 must not become 主导/牵头; 参与/协助 must not become 负责.
4. Keep a real verb. Do not turn the line into a noun phrase.
5. No AI-flavoured words (赋能/抓手/闭环/打通/落地/复盘/沉淀/组合拳).
6. Never add frequency or time words the original does not contain: 每周/每天/每月/每年/定期/持续/常态化.
7. Only change the verb and the sentence structure. Never introduce nouns, channels, metrics or objects the original does not contain.
8. Write in the same language as the original. One line, under 60 Chinese characters or 30 English words.`;



/** Chinese character bigrams in `after` that do not appear in `before`. */
function inventedBigrams(before: string, after: string): string[] {
  const source = before.replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '');
  const out: string[] = [];
  const target = after.replace(/[^\u4e00-\u9fa5a-z0-9]/gi, '');
  for (let i = 0; i < target.length - 1; i += 1) {
    const gram = target.slice(i, i + 2);
    if (!/^[\u4e00-\u9fa5]{2}$/.test(gram)) continue;
    if (!source.includes(gram) && !out.includes(gram)) out.push(gram);
  }
  return out;
}

/** A line too vague to rewrite without inventing facts. */
function needsMoreDetail(text: string): boolean {
  const hasNumber = /\d/.test(text);
  const hasScope = /(个|名|人|次|天|周|月|年|小时|区域|门店|客户|部门|渠道)/.test(text);
  return !hasNumber && !hasScope && text.length < 30;
}

const ADDED_FREQUENCY = ['每周', '每天', '每日', '每月', '每年', '定期', '持续', '常态化', '固定频率'];

/** Frequency words the rewrite invented (not present in the original). */
function inventedFrequency(before: string, after: string): string[] {
  return ADDED_FREQUENCY.filter((w) => after.includes(w) && !before.includes(w));
}

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const text = String(body?.text || '').trim();
    const problem = String(body?.problem || '').trim();
    const suggestion = String(body?.suggestion || '').trim();

    if (!text) {
      return NextResponse.json({ error: '缺少原文' }, { status: 400 });
    }

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const result = await generateText({
      model,
      maxOutputTokens: 512,
      system: SYSTEM,
      prompt: `Original line:\n${text}\n\nProblem: ${problem || '表达不够具体'}\nFix direction: ${suggestion || '让这条更具体、更像本人做的事'}\n\nRewrite it.`,
    });

    const clean = (raw: string) =>
      raw
        .trim()
        .replace(/^```[a-z]*\n?/i, '')
        .replace(/```$/, '')
        .replace(/^["'「]|["'」]$/g, '')
        .trim();

    let rewritten = clean(result.text);
    if (!rewritten) {
      return NextResponse.json({ error: '改写结果为空' }, { status: 502 });
    }

    // Too vague to rewrite honestly: ask for the missing fact instead of inventing it.
    if (needsMoreDetail(text) && inventedBigrams(text, rewritten).length > 4) {
      return NextResponse.json({
        text,
        needsInput: true,
        question: '这条里具体做了什么？比如通过什么方式、覆盖多少人、多久做一次？',
      });
    }

    // Retry once if the model invented a frequency the candidate never stated.
    if (inventedFrequency(text, rewritten).length > 0) {
      const retry = await generateText({
        model,
        maxOutputTokens: 512,
        system: SYSTEM,
        prompt: `Original line:\n${text}\n\nProblem: ${problem || '表达不够具体'}\nFix direction: ${suggestion || '让这条更具体'}\n\nRewrite it again. Do NOT add any frequency or time word (每周/每天/每月/定期/持续) unless the original already has one.`,
      });
      const second = clean(retry.text);
      if (second && inventedFrequency(text, second).length === 0) {
        rewritten = second;
      } else {
        return NextResponse.json({ text, unchanged: true, reason: '不改写就会编造频率' });
      }
    }

    return NextResponse.json({ text: rewritten });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: '请先在设置里配置 AI' }, { status: 400 });
    }
    console.error('POST /api/ai/fix-line error:', error);
    return NextResponse.json({ error: '改写失败' }, { status: 500 });
  }
}
