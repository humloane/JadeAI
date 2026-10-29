/**
 * Resume scoring engine.
 *
 * Five dimensions, every deduction carries a concrete fix and a flag telling the
 * UI whether the line can be rewritten by AI:
 *   completeness  有没有该有的东西
 *   expression    写得像不像人话（弱开头、空话、超长句）
 *   match         和 JD 的关键词覆盖（需要 JD）
 *   credibility   经不经得起追问（有没有范围、频率、对象、数字）
 *   authenticity  有没有 AI 味（套话、形容词堆砌、假大空）
 *
 * Deterministic on purpose: fast, free, testable, and the same input always
 * scores the same. The AI rewrite is a separate, explicit action.
 */

export type DimensionKey = 'completeness' | 'expression' | 'match' | 'credibility' | 'authenticity';

export interface ScoreFinding {
  dimension: DimensionKey;
  severity: 'hard' | 'soft';
  path: string;
  excerpt: string;
  problem: string;
  suggestion: string;
  autoFix: boolean;
}

export interface ScoreDimension {
  key: DimensionKey;
  label: string;
  score: number;
  weight: number;
  comment: string;
}

export interface ScoreResult {
  total: number;
  dimensions: ScoreDimension[];
  findings: ScoreFinding[];
  stats: {
    bullets: number;
    withNumbers: number;
    weakOpeners: number;
    aiPhrases: number;
    missingFields: string[];
  };
}

export interface ScoreInputSection {
  type: string;
  title?: string;
  content: any;
}

const WEAK_OPENERS = [
  '负责', '协助', '参与', '配合', '跟进', '支持', '帮助', '从事',
  '承担', '执行', '对接', '维护', '处理', '完成',
  'responsible for', 'helped with', 'assisted in', 'participated in', 'worked on',
];

const AI_PHRASES = [
  '赋能', '抓手', '闭环', '打通', '落地', '复盘', '沉淀', '组合拳',
  '拉通', '对齐', '发力', '助力', '深耕', '布局', '全方位', '多维度',
  '有效提升', '显著提升', '全面提升', '极大提升',
  'spearheaded', 'leveraged', 'orchestrated', 'synergy', 'cutting-edge',
];

const VAGUE_WORDS = ['大幅', '显著', '明显', '良好', '优秀', '出色', '丰富', '较强', '极大'];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  completeness: '完整性',
  expression: '表达',
  match: '匹配度',
  credibility: '可信度',
  authenticity: '真实度',
};

const WEIGHTS: Record<DimensionKey, number> = {
  completeness: 0.2,
  expression: 0.25,
  match: 0.15,
  credibility: 0.2,
  authenticity: 0.2,
};

function excerpt(text: string, limit = 40): string {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit - 1)}…`;
}

/** Collect every writing unit (summary + work/project bullets) with its path. */
function collectUnits(sections: ScoreInputSection[]): Array<{ path: string; text: string; isBullet: boolean }> {
  const units: Array<{ path: string; text: string; isBullet: boolean }> = [];
  sections.forEach((section) => {
    const content = section.content || {};
    if (section.type === 'summary' && typeof content.text === 'string' && content.text.trim()) {
      units.push({ path: 'summary', text: content.text, isBullet: false });
    }
    if (section.type === 'work_experience' || section.type === 'projects') {
      (content.items || []).forEach((item: any, i: number) => {
        (item.highlights || []).forEach((text: string, j: number) => {
          if (typeof text === 'string' && text.trim()) {
            units.push({
              path: `${section.type}.items[${i}].highlights[${j}]`,
              text,
              isBullet: true,
            });
          }
        });
        if (typeof item.description === 'string' && item.description.trim()) {
          units.push({
            path: `${section.type}.items[${i}].description`,
            text: item.description,
            isBullet: false,
          });
        }
      });
    }
  });
  return units;
}

function personalInfo(sections: ScoreInputSection[]): Record<string, any> {
  const section = sections.find((s) => s.type === 'personal_info');
  return (section?.content || {}) as Record<string, any>;
}

function hasAny(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

/** Completeness: the fields a reviewer expects to see. */
function scoreCompleteness(sections: ScoreInputSection[]) {
  const pi = personalInfo(sections);
  const findings: ScoreFinding[] = [];

  const checks: Array<{ label: string; ok: boolean; suggestion: string }> = [
    { label: '姓名', ok: hasAny(pi.fullName), suggestion: '补上姓名，这是简历的第一行。' },
    { label: '求职意向', ok: hasAny(pi.jobTitle), suggestion: '补上求职岗位，让 HR 一眼知道你想做什么。' },
    {
      label: '联系方式',
      ok: hasAny(pi.phone) || hasAny(pi.email),
      suggestion: '至少留电话或邮箱，否则 HR 找不到你。',
    },
    { label: '个人简介', ok: sections.some((s) => s.type === 'summary' && hasAny(s.content?.text)), suggestion: '用两三句话说明你是谁、做过什么、想做什么。' },
    { label: '工作经历', ok: sections.some((s) => s.type === 'work_experience' && (s.content?.items || []).length > 0), suggestion: '哪怕只有兼职或实习，也写进去，空着最吃亏。' },
    { label: '教育背景', ok: sections.some((s) => s.type === 'education' && (s.content?.items || []).length > 0), suggestion: '补上学校、专业、学历和起止时间。' },
    { label: '技能', ok: sections.some((s) => s.type === 'skills' && (s.content?.categories || []).length > 0), suggestion: '列出你实际用过的工具和方法，不用多，要真。' },
  ];

  const missing = checks.filter((c) => !c.ok);
  missing.forEach((c) => {
    findings.push({
      dimension: 'completeness',
      severity: 'hard',
      path: c.label,
      excerpt: '',
      problem: `缺少「${c.label}」`,
      suggestion: c.suggestion,
      autoFix: false,
    });
  });

  const score = Math.round(((checks.length - missing.length) / checks.length) * 100);
  return { score, findings, missingFields: missing.map((m) => m.label) };
}

/** Expression: weak openers, no outcome, long lines, repeated openers. */
function scoreExpression(units: ReturnType<typeof collectUnits>) {
  const findings: ScoreFinding[] = [];
  const bullets = units.filter((u) => u.isBullet);
  let weak = 0;
  let noMetric = 0;

  const openers = new Map<string, number>();

  bullets.forEach((unit) => {
    const text = unit.text.trim();
    const lower = text.toLowerCase();
    const weakHit = WEAK_OPENERS.find((w) => lower.startsWith(w));
    if (weakHit) {
      weak += 1;
      findings.push({
        dimension: 'expression',
        severity: 'hard',
        path: unit.path,
        excerpt: excerpt(text),
        problem: `以「${weakHit}」开头，读起来像岗位职责，不像你做成的事`,
        suggestion: `换成一个具体动作：把「${weakHit}…」改成「主导/维护/产出/推进 + 具体对象 + 结果」。`,
        autoFix: true,
      });
    }

    if (!/\d/.test(text)) {
      noMetric += 1;
      findings.push({
        dimension: 'expression',
        severity: 'soft',
        path: unit.path,
        excerpt: excerpt(text),
        problem: '没有任何量化信息',
        suggestion: '补一个数字（数量、频率、时长、人数）；确实没有数字，就写清范围和对象。',
        autoFix: true,
      });
    }

    if (text.length > 60) {
      findings.push({
        dimension: 'expression',
        severity: 'soft',
        path: unit.path,
        excerpt: excerpt(text),
        problem: `一条 ${text.length} 字，太长，HR 扫不到重点`,
        suggestion: '拆成两条，或删掉修饰语，只留「做了什么 + 结果」。',
        autoFix: true,
      });
    }

    const opener = text.slice(0, 2);
    openers.set(opener, (openers.get(opener) || 0) + 1);
  });

  openers.forEach((count, opener) => {
    if (count >= 3) {
      findings.push({
        dimension: 'expression',
        severity: 'soft',
        path: `opener:${opener}`,
        excerpt: opener,
        problem: `有 ${count} 条都以「${opener}」开头，句式重复`,
        suggestion: '换几种开头，或者按时间/模块重新组织。',
        autoFix: false,
      });
    }
  });

  const penalty = Math.min(55, weak * 10 + noMetric * 4);
  return { score: Math.max(40, 100 - penalty), findings, weak, noMetric };
}

/** Authenticity: AI-flavoured phrases and vague adjectives. */
function scoreAuthenticity(units: ReturnType<typeof collectUnits>) {
  const findings: ScoreFinding[] = [];
  let aiHits = 0;

  units.forEach((unit) => {
    const text = unit.text;
    const hit = AI_PHRASES.find((p) => text.includes(p));
    if (hit) {
      aiHits += 1;
      findings.push({
        dimension: 'authenticity',
        severity: 'hard',
        path: unit.path,
        excerpt: excerpt(text),
        problem: `出现套话「${hit}」，一眼像模板或 AI 写的`,
        suggestion: `删掉「${hit}」，换成你实际做的事：谁在用、解决了什么、怎么做的。`,
        autoFix: true,
      });
    }

    const vague = VAGUE_WORDS.find((w) => text.includes(w) && !/\d/.test(text));
    if (vague && !hit) {
      findings.push({
        dimension: 'authenticity',
        severity: 'soft',
        path: unit.path,
        excerpt: excerpt(text),
        problem: `用了「${vague}」但没有数字支撑，显得空`,
        suggestion: '要么补具体数字，要么换成能验证的事实（覆盖范围、频率、交付对象）。',
        autoFix: true,
      });
    }
  });

  const penalty = Math.min(60, aiHits * 15);
  return { score: Math.max(30, 100 - penalty), findings, aiHits };
}

/** Credibility: can the candidate survive an interview on this line? */
function scoreCredibility(units: ReturnType<typeof collectUnits>) {
  const findings: ScoreFinding[] = [];
  const bullets = units.filter((u) => u.isBullet);
  let thin = 0;

  bullets.forEach((unit) => {
    const text = unit.text.trim();
    const hasScope = /(\d|个|名|人|次|天|周|月|年|小时|区域|门店|客户|部门)/.test(text);
    const hasNumber = /\d/.test(text);
    if (text.length < 12 && !hasScope) {
      thin += 1;
      findings.push({
        dimension: 'credibility',
        severity: 'soft',
        path: unit.path,
        excerpt: excerpt(text),
        problem: '这条太笼统，面试官一追问就答不上来',
        suggestion: '补上「范围 + 频率 + 对象」：负责多大范围、多久做一次、交给谁。',
        autoFix: true,
      });
    } else if (!hasNumber && !hasScope) {
      thin += 1;
      findings.push({
        dimension: 'credibility',
        severity: 'soft',
        path: unit.path,
        excerpt: excerpt(text),
        problem: '没有数字也没有范围，面试官无法判断这件事的份量',
        suggestion: '加一个能说清的量：覆盖多少、多久一次、服务谁；编不出来就删掉这条。',
        autoFix: true,
      });
    }
  });

  const penalty = Math.min(40, thin * 6);
  return { score: Math.max(50, 100 - penalty), findings, thin };
}

/** Match: keyword coverage against a job description. */
function scoreMatch(sections: ScoreInputSection[], jobDescription?: string) {
  if (!jobDescription || !jobDescription.trim()) {
    return { score: 0, findings: [] as ScoreFinding[], applicable: false };
  }

  const resumeText = JSON.stringify(sections);
  const tokens = Array.from(
    new Set(
      (jobDescription.toLowerCase().match(/[a-z][a-z0-9+#.]{1,}|[\u4e00-\u9fa5]{2,4}/g) || [])
        .map((t) => t.trim())
        .filter((t) => t.length >= 2)
    )
  ).slice(0, 40);

  const missing = tokens.filter((t) => !resumeText.toLowerCase().includes(t));
  const covered = tokens.length - missing.length;
  const score = tokens.length ? Math.round((covered / tokens.length) * 100) : 0;

  const findings: ScoreFinding[] = missing.slice(0, 6).map((keyword) => ({
    dimension: 'match' as DimensionKey,
    severity: 'soft' as const,
    path: `jd:${keyword}`,
    excerpt: keyword,
    problem: `JD 提到「${keyword}」，简历里没有对应内容`,
    suggestion: `如果你确实做过，补一条相关的；没做过就不要硬写。`,
    autoFix: false,
  }));

  return { score, findings, applicable: true };
}

export function scoreResume(
  sections: ScoreInputSection[],
  options: { jobDescription?: string } = {}
): ScoreResult {
  const units = collectUnits(sections);
  const completeness = scoreCompleteness(sections);
  const expression = scoreExpression(units);
  const authenticity = scoreAuthenticity(units);
  const credibility = scoreCredibility(units);
  const match = scoreMatch(sections, options.jobDescription);

  const dimensions: ScoreDimension[] = [
    { key: 'completeness', label: DIMENSION_LABELS.completeness, score: completeness.score, weight: WEIGHTS.completeness, comment: completeness.missingFields.length ? `缺 ${completeness.missingFields.length} 项` : '该有的都有' },
    { key: 'expression', label: DIMENSION_LABELS.expression, score: expression.score, weight: WEIGHTS.expression, comment: expression.weak ? `${expression.weak} 条弱开头` : '表达清楚' },
    { key: 'match', label: DIMENSION_LABELS.match, score: match.score, weight: WEIGHTS.match, comment: match.applicable ? `关键词覆盖 ${match.score}%` : '未提供 JD' },
    { key: 'credibility', label: DIMENSION_LABELS.credibility, score: credibility.score, weight: WEIGHTS.credibility, comment: credibility.thin ? `${credibility.thin} 条太笼统` : '经得起追问' },
    { key: 'authenticity', label: DIMENSION_LABELS.authenticity, score: authenticity.score, weight: WEIGHTS.authenticity, comment: authenticity.aiHits ? `${authenticity.aiHits} 条套话` : '没有明显 AI 味' },
  ];

  const active = dimensions.filter((d) => d.key !== 'match' || match.applicable);
  const weightSum = active.reduce((sum, d) => sum + d.weight, 0);
  const total = Math.round(
    active.reduce((sum, d) => sum + d.score * d.weight, 0) / (weightSum || 1)
  );

  const findings = [
    ...completeness.findings,
    ...expression.findings,
    ...authenticity.findings,
    ...credibility.findings,
    ...match.findings,
  ];

  const bullets = units.filter((u) => u.isBullet);

  return {
    total,
    dimensions,
    findings,
    stats: {
      bullets: bullets.length,
      withNumbers: bullets.filter((u) => /\d/.test(u.text)).length,
      weakOpeners: expression.weak,
      aiPhrases: authenticity.aiHits,
      missingFields: completeness.missingFields,
    },
  };
}
