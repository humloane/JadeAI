/**
 * Structural normalization for resume section content.
 *
 * The AI edit/generate tools ask the model to return structured JSON, but the
 * model sometimes writes list fields as plain strings (e.g. `highlights` as a
 * newline-separated string instead of `string[]`). The renderers assume arrays
 * and call `.map` / `.join`, so a non-empty string passes a `.length > 0` guard
 * and then throws — crashing the whole editor with no way to reopen the resume
 * (issue #87). This module coerces content into the shape the renderers expect.
 *
 * It is idempotent and non-destructive for already-valid content, so it is safe
 * to run both on write (AI tools / generation) and on read (healing resumes
 * whose content was already corrupted before this fix shipped).
 */

// Item-based sections whose content is `{ items: [...] }`.
const ITEM_SECTION_TYPES = new Set([
  'work_experience',
  'education',
  'projects',
  'certifications',
  'languages',
  'github',
  'custom',
  'qr_codes',
]);

// Fields inside an item that MUST be string arrays (renderers call .map/.join).
const ITEM_ARRAY_FIELDS = ['highlights', 'technologies'];

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Coerce any value into a clean string[]. A single string is split on newlines
 *  (the common way the model returns a bullet list as one blob) so it becomes
 *  multiple entries rather than one giant line. */
export function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x) => x != null && x !== '').map((x) => (typeof x === 'string' ? x : String(x)));
  }
  if (v == null) return [];
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return [];
    const parts = trimmed
      .split(/\r?\n/)
      .map((s) => s.replace(/^\s*[-*•]\s?/, '').trim())
      .filter(Boolean);
    return parts.length > 1 ? parts : [trimmed];
  }
  return [String(v)];
}

/**
 * Return a structurally-safe copy of a section's content for the given type.
 * Never throws; falls back to an empty-but-valid structure for junk input.
 */

/**
 * Normalize free-text personal fields so they read correctly in every template.
 * The model (and users) often type bare values: "1" for years, "汉" for ethnicity.
 * Idempotent: already-normalized values pass through unchanged.
 */

/** Convert a simple Chinese numeral (10-99) to digits; returns null otherwise. */
function chineseNumberToDigits(text: string): number | null {
  const digits: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  if (!/^[一二三四五六七八九十]+$/.test(text)) return null;
  if (text === '十') return 10;
  const [tensPart, onesPart] = text.split('十');
  if (text.includes('十')) {
    const tens = tensPart ? digits[tensPart] ?? 0 : 1;
    const ones = onesPart ? digits[onesPart] ?? 0 : 0;
    if (!tens || ones === undefined) return null;
    return tens * 10 + ones;
  }
  return digits[text] ?? null;
}


/** Normalize a single date cell to YYYY-MM (or YYYY when only a year is given). */
export function normalizeDateValue(value: string): string {
  const text = (value || '').trim();
  if (!text) return '';
  const ym = text.match(/^(\d{4})\s*[年./\-]\s*(\d{1,2})\s*月?$/);
  if (ym) return `${ym[1]}-${String(ym[2]).padStart(2, '0')}`;
  const y = text.match(/^(\d{4})\s*年?$/);
  if (y) return y[1];
  return text;
}

/** "至今" / "Present" in an end-date cell means the role is ongoing. */
const PRESENT_RE = /^(至今|现在|present|now|current)$/i;


/** Map common English proficiency words to their Chinese resume equivalents. */
const PROFICIENCY_MAP: Record<string, { zh: string; en: string }> = {
  native: { zh: '母语', en: 'Native' },
  fluent: { zh: '流利', en: 'Fluent' },
  advanced: { zh: '熟练', en: 'Advanced' },
  professional: { zh: '熟练', en: 'Professional' },
  intermediate: { zh: '良好', en: 'Intermediate' },
  conversational: { zh: '良好', en: 'Conversational' },
  basic: { zh: '基础', en: 'Basic' },
  beginner: { zh: '入门', en: 'Beginner' },
};

/** Resolve a proficiency label to the requested output language. */
function localizeProficiency(value: string, lang: string): string {
  const text = value.trim();
  if (!text) return text;
  const lower = text.toLowerCase();
  const key =
    Object.keys(PROFICIENCY_MAP).find((k) => k === lower) ??
    Object.keys(PROFICIENCY_MAP).find((k) => PROFICIENCY_MAP[k].zh === text);
  if (!key) return text;
  return lang === 'en' ? PROFICIENCY_MAP[key].en : PROFICIENCY_MAP[key].zh;
}


/** Canonical language names, keyed by a lowercase English name. */
const LANGUAGE_NAMES: Record<string, { zh: string; en: string }> = {
  english: { zh: '英语', en: 'English' },
  chinese: { zh: '中文', en: 'Chinese' },
  mandarin: { zh: '普通话', en: 'Mandarin' },
  cantonese: { zh: '粤语', en: 'Cantonese' },
  japanese: { zh: '日语', en: 'Japanese' },
  korean: { zh: '韩语', en: 'Korean' },
  french: { zh: '法语', en: 'French' },
  german: { zh: '德语', en: 'German' },
  spanish: { zh: '西班牙语', en: 'Spanish' },
  russian: { zh: '俄语', en: 'Russian' },
  portuguese: { zh: '葡萄牙语', en: 'Portuguese' },
  italian: { zh: '意大利语', en: 'Italian' },
  arabic: { zh: '阿拉伯语', en: 'Arabic' },
};

/** Resolve a language name to the requested output language. */
function localizeLanguageName(value: string, lang: string): string {
  const text = value.trim();
  if (!text) return text;
  const key =
    Object.keys(LANGUAGE_NAMES).find((k) => k === text.toLowerCase()) ??
    Object.keys(LANGUAGE_NAMES).find((k) => LANGUAGE_NAMES[k].zh === text) ??
    Object.keys(LANGUAGE_NAMES).find((k) => LANGUAGE_NAMES[k].en.toLowerCase() === text.toLowerCase());
  if (!key) return text;
  return lang === 'en' ? LANGUAGE_NAMES[key].en : LANGUAGE_NAMES[key].zh;
}

export function normalizePersonalInfo(content: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...content };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

  const age = str(next.age);
  if (/^\d{1,3}$/.test(age)) next.age = `${age} 岁`;

  const years = str(next.yearsOfExperience);
  if (/^\d{1,2}$/.test(years)) next.yearsOfExperience = `${years} 年`;

  const ethnicity = str(next.ethnicity);
  if (ethnicity && !ethnicity.endsWith('族')) next.ethnicity = `${ethnicity}族`;

  const gender = str(next.gender);
  if (gender === '男性') next.gender = '男';
  if (gender === '女性') next.gender = '女';

  const political = str(next.politicalStatus);
  if (political === '党员') next.politicalStatus = '中共党员';
  if (political === '团员') next.politicalStatus = '共青团员';

  // Education level: collapse the common spellings to one label.
  const edu = str(next.educationLevel);
  if (edu) {
    const key = edu.toLowerCase().replace(/\s+/g, '');
    const EDU_MAP: Record<string, string> = {
      大学本科: '本科', 本科毕业: '本科', 学士: '本科', bachelor: '本科', 'bachelor\'s': '本科',
      硕士研究生: '硕士', 研究生: '硕士', master: '硕士',
      博士研究生: '博士', phd: '博士', doctor: '博士',
      大学专科: '大专', 专科: '大专', 高职: '大专',
    };
    if (EDU_MAP[key]) next.educationLevel = EDU_MAP[key];
  }

  // Gender: accept m/f/male/female.
  const genderRaw = str(next.gender).toLowerCase();
  if (['m', 'male', 'man', '男'].includes(genderRaw)) next.gender = '男';
  else if (['f', 'female', 'woman', '女'].includes(genderRaw)) next.gender = '女';

  // Age: "30岁" and "30" both become "30 岁".
  const ageMatch = str(next.age).match(/^(\d{1,3})\s*岁?$/);
  if (ageMatch) next.age = `${ageMatch[1]} 岁`;
  else {
    const cnAge = chineseNumberToDigits(str(next.age).replace(/岁$/, ''));
    if (cnAge) next.age = `${cnAge} 岁`;
  }

  // Years: "1年" and "1" both become "1 年".
  const yearsMatch = str(next.yearsOfExperience).match(/^(\d{1,2})\s*年?$/);
  if (yearsMatch) next.yearsOfExperience = `${yearsMatch[1]} 年`;

  // Phone: drop +86 and separators, then format 3-4-4.
  const phoneRaw = str(next.phone).replace(/[\s\-()]/g, '').replace(/^\+?86/, '');
  if (/^1\d{10}$/.test(phoneRaw)) {
    next.phone = `${phoneRaw.slice(0, 3)}-${phoneRaw.slice(3, 7)}-${phoneRaw.slice(7)}`;
  }

  return next;
}

export function normalizeSectionContent(type: string, rawContent: unknown, lang: string = 'zh'): Record<string, unknown> {
  const content = asObject(rawContent);

  if (type === 'skills') {
    const base = content ?? {};
    const cats = Array.isArray(base.categories) ? base.categories : [];
    return {
      ...base,
      categories: cats
        .map((c) => {
          const cat = asObject(c);
          if (!cat) return { id: genId(), name: '', skills: [] as string[] };
          const skills = toStringArray(cat.skills)
            .flatMap((v) => v.split(/[、,，;；]/))
            .map((v) => v.trim())
            .filter(Boolean);
          return { ...cat, id: cat.id || genId(), skills };
        })
        .filter((cat) => (cat.name || '').trim() !== '' || cat.skills.length > 0),
    };
  }

  if (ITEM_SECTION_TYPES.has(type)) {
    const base = content ?? {};
    const items = Array.isArray(base.items) ? base.items : [];
    return {
      ...base,
      items: items.map((it) => {
        const item = asObject(it);
        if (!item) return { id: genId() };
        const next: Record<string, unknown> = { ...item, id: item.id || genId() };
        for (const field of ITEM_ARRAY_FIELDS) {
          // Only coerce a field that is present but the wrong type; leave
          // legitimately-absent optional fields (e.g. certifications.highlights)
          // untouched so we don't inflate the stored shape.
          if (field in next && !Array.isArray(next[field])) {
            next[field] = toStringArray(next[field]);
          }
        }

        // Technologies are a comma-separated list in practice.
        if (Array.isArray(next.technologies)) {
          next.technologies = (next.technologies as unknown[])
            .flatMap((v) => String(v).split(/[,，、;；]/))
            .map((v) => v.trim())
            .filter(Boolean);
        }

        // Dates: accept 2023.01 / 2023年1月 / 2023/1 and "至今".
        if (typeof next.endDate === 'string' && PRESENT_RE.test(next.endDate.trim())) {
          next.endDate = '';
          next.current = true;
        }
        for (const field of ['startDate', 'endDate', 'date']) {
          if (typeof next[field] === 'string') {
            next[field] = normalizeDateValue(next[field] as string);
          }
        }

        if (typeof next.proficiency === 'string') {
          next.proficiency = localizeProficiency(next.proficiency, lang);
        }

        if (type === 'languages' && typeof next.language === 'string') {
          next.language = localizeLanguageName(next.language, lang);
        }

        // Drop items that carry no information at all (the model sometimes
        // returns an empty shell, which would leave a heading with no content).
        const meaningful = Object.entries(next).some(([key, value]) => {
          if (key === 'id') return false;
          if (value == null) return false;
          if (typeof value === 'string') return value.trim() !== '';
          if (Array.isArray(value)) return value.length > 0;
          if (typeof value === 'boolean') return value === true;
          return true;
        });
        return meaningful ? next : null;
      }).filter((item): item is Record<string, unknown> => item !== null),
    };
  }

  // summary / personal_info / other object sections.
  if (!content) {
    if (type === 'summary') return { text: rawContent == null ? '' : String(rawContent) };
    return {};
  }
  if (type === 'personal_info') return normalizePersonalInfo(content);
  return content;
}

/** Normalize the content of every section in a list (used on resume load). */
export function normalizeSections<T extends { type: string; content: unknown }>(sections: T[], lang: string = 'zh'): T[] {
  return (sections || []).map((s) => ({
    ...s,
    content: normalizeSectionContent(s.type, s.content, lang) as T['content'],
  }));
}
