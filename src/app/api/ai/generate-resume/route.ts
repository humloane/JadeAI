import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, extractAIConfig, getJsonProviderOptions, AIConfigError } from '@/lib/ai/provider';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { generateResumeInputSchema, type GenerateResumeOutput } from '@/lib/ai/generate-resume-schema';

const SECTION_TITLES: Record<string, Record<string, string>> = {
  zh: {
    personal_info: '个人信息',
    summary: '个人简介',
    work_experience: '工作经历',
    education: '教育背景',
    skills: '专业技能',
    projects: '项目经历',
  },
  en: {
    personal_info: 'Personal Information',
    summary: 'Professional Summary',
    work_experience: 'Work Experience',
    education: 'Education',
    skills: 'Skills',
    projects: 'Projects',
  },
};

type EmbellishLevel = 'conservative' | 'standard' | 'bold';

const EMBELLISH_RULES: Record<EmbellishLevel, string> = {
  conservative: `EMBELLISHMENT LEVEL: conservative (an interview and/or background check is likely).
- Only rewrite the candidate's wording into professional written language.
- Do NOT add scope, duties, tools, frequency, achievements or numbers the candidate did not state.`,
  standard: `EMBELLISHMENT LEVEL: standard.
- You MAY add routine context that follows from what the candidate described: how often the task ran, who it served, which ordinary tools that role uses.
- Do NOT add numbers, achievements, team sizes, revenue or results the candidate did not state.`,
  bold: `EMBELLISHMENT LEVEL: bold (mass applications, an interview is unlikely).
- You MAY add common responsibilities that belong to the target role.
- Still no numbers, no company or school names, no degrees or certificates.`,
};

function getSystemPrompt(language: string, level: EmbellishLevel = 'standard'): string {
  const lang = language === 'en' ? 'English' : 'Simplified Chinese';

  return `You are a professional resume writer. Write the resume in ${lang}.

ABSOLUTE RULES (these override everything below):
1. Never invent identity facts: real name, phone, email, city, company names, school names, degrees, majors, graduation dates, certificates. When the candidate did not provide a value, return an empty string "" for that field.
2. Never invent numbers: no percentages, amounts, counts, team sizes, revenue, rankings or time saved. If the candidate gave no number, express the outcome through the scope, frequency, object or result their description actually supports.
3. Interview safety: every bullet must be something the candidate can answer questions about. If a sentence would need a fact the candidate does not have, do not write it.
4. You MAY restructure and polish: turn spoken language into professional written language, split one duty into 2-4 concrete responsibility bullets, start bullets with strong verbs, and state the work context the description implies.

${EMBELLISH_RULES[level]}

Output rules:
- Dates in YYYY-MM.
- If years of experience is 0, output at most 1 work item (internship or part-time) or none.
- personal_info: leave every unknown field as "".
- Skills: group into categories that fit the target role.
- Each work item: 2-4 highlight bullets. Do not pad to a fixed count.
- Dates: use the range the candidate gave. Never output the same start and end month. If the role is ongoing, set endDate to null and current to true. If the candidate gave no dates, leave startDate and endDate as "" and current as false; never guess.
- Education: include startDate/endDate only when the candidate provided them (a graduation year is enough); otherwise leave both as "".
- CRITICAL: You are a JSON API. Your entire response must be a single valid JSON object starting with { and ending with }. Do NOT use markdown syntax. Do NOT wrap in code fences. Do NOT add any text before or after the JSON.`;
}

import { extractJson } from '@/lib/ai/extract-json';
import { normalizeSectionContent } from '@/lib/resume/normalize-content';
import { z } from 'zod/v4';

const generateResumeOutputSchema = z.object({
  personal_info: z.any(),
  summary: z.any(),
  work_experience: z.any(),
  education: z.any(),
  skills: z.any(),
  projects: z.any(),
});


/**
 * Keep generated dates honest and renderable:
 * - no start date -> no end date and not current
 * - identical start/end -> drop the end date
 * - empty end date on a finished role -> current stays false
 */
function normalizeGeneratedDates(data: GenerateResumeOutput): void {
  const work = (data as any)?.work_experience?.items;
  if (Array.isArray(work)) {
    for (const item of work) {
      if (!item) continue;
      const start = typeof item.startDate === 'string' ? item.startDate.trim() : '';
      const end = typeof item.endDate === 'string' ? item.endDate.trim() : '';
      if (!start) {
        item.startDate = '';
        item.endDate = null;
        item.current = false;
        continue;
      }
      if (start && end && start === end) {
        item.endDate = null;
        item.current = false;
      }
      if (!end && item.current !== true) item.current = false;
    }
  }

  const education = (data as any)?.education?.items;
  if (Array.isArray(education)) {
    for (const item of education) {
      if (!item) continue;
      const start = typeof item.startDate === 'string' ? item.startDate.trim() : '';
      const end = typeof item.endDate === 'string' ? item.endDate.trim() : '';
      if (!start && !end) {
        item.startDate = '';
        item.endDate = '';
      } else if (start && end && start === end) {
        item.endDate = '';
      }
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const rawLevel = (body as { embellishLevel?: string })?.embellishLevel;
    const level: EmbellishLevel =
      rawLevel === 'conservative' || rawLevel === 'bold' ? rawLevel : 'standard';
    const parsed = generateResumeInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { jobTitle, yearsOfExperience, skills, industry, experience, template, language } = parsed.data;
    const lang = language || 'zh';

    const aiConfig = extractAIConfig(request);
    const model = getModel(aiConfig);

    const skillsContext = skills && skills.length > 0
      ? `\nKey skills to incorporate: ${skills.join(', ')}`
      : '';
    const industryContext = industry
      ? `\nIndustry: ${industry}`
      : '';
    const experienceContext = experience
      ? `\n\nThe candidate provided the following work experience description. Parse this into structured work_experience items, and use it to inform the summary, skills, and projects sections:\n---\n${experience}\n---`
      : '';

    const promptText = `Build the resume for a ${jobTitle} ${yearsOfExperience === 0 ? 'at entry level (fresh graduate / no prior experience)' : `with ${yearsOfExperience} years of experience`}.${skillsContext}${industryContext}${experienceContext}

Use ONLY the candidate's facts above. Leave unknown fields as "".

Return a JSON object with these exact top-level keys: personal_info, summary, work_experience, education, skills, projects.

The structure must be:
- personal_info: { fullName, jobTitle, email, phone, location, website?, linkedin?, github? }
- summary: { text }
- work_experience: { items: [{ company, position, location?, startDate, endDate (null if current), current, description, highlights: string[] }] }
- education: { items: [{ institution, degree, field, location?, startDate, endDate, gpa?, highlights: string[] }] }
- skills: { categories: [{ name, skills: string[] }] }
- projects: { items: [{ name, url?, startDate?, endDate?, description, technologies: string[], highlights: string[] }] }

Respond with JSON only.`;

    // Higher cap than a single chat turn: a full 6-section resume can exceed 8192
    // output tokens, which truncates the JSON and makes extractJson fail (issue #87).
    const generate = (providerOptions: ReturnType<typeof getJsonProviderOptions>) =>
      generateText({
        model,
        maxOutputTokens: 16384,
        system: getSystemPrompt(lang, level),
        prompt: promptText,
        providerOptions,
      });

    let result;
    try {
      result = await generate(getJsonProviderOptions(aiConfig));
    } catch (err) {
      // Some OpenAI-compatible endpoints reject `response_format: json_object`.
      // The prompt already demands raw JSON and extractJson repairs the output,
      // so retry once without the JSON-mode option before giving up.
      const opts = getJsonProviderOptions(aiConfig);
      if (Object.keys(opts).length > 0) {
        result = await generate({} as ReturnType<typeof getJsonProviderOptions>);
      } else {
        throw err;
      }
    }

    const generatedData: GenerateResumeOutput = extractJson(result.text, generateResumeOutputSchema) as GenerateResumeOutput;
    normalizeGeneratedDates(generatedData);

    // Create a new resume in the database
    const resumeTitle = lang === 'zh'
      ? `${jobTitle} - AI生成简历`
      : `${jobTitle} - AI Generated Resume`;

    const newResume = await resumeRepository.create({
      userId: user.id,
      title: resumeTitle,
      template: template || 'classic',
      language: lang,
    });

    if (!newResume) {
      return NextResponse.json({ error: 'Failed to create resume' }, { status: 500 });
    }

    // Create sections in the database
    const titles = SECTION_TITLES[lang] || SECTION_TITLES.zh;
    const sectionTypes = ['personal_info', 'summary', 'work_experience', 'education', 'skills', 'projects'] as const;

    for (let i = 0; i < sectionTypes.length; i++) {
      const type = sectionTypes[i];
      const content = generatedData[type];

      await resumeRepository.createSection({
        resumeId: newResume.id,
        type,
        title: titles[type],
        sortOrder: i,
        // Guard against the model returning list fields as strings (issue #87).
        content: normalizeSectionContent(type, content, lang),
      });
    }

    // Fetch the complete resume with sections
    const completeResume = await resumeRepository.findById(newResume.id);

    return NextResponse.json({
      resumeId: newResume.id,
      title: resumeTitle,
      sections: completeResume?.sections || [],
    });
  } catch (error) {
    if (error instanceof AIConfigError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error('POST /api/ai/generate-resume error:', error);
    // Surface the underlying reason (bad model id, endpoint rejected the request,
    // JSON parse failure, …) so the user can actually diagnose it instead of a
    // generic message (issue #87).
    const detail = error instanceof Error && error.message ? error.message : '';
    return NextResponse.json(
      { error: detail ? `Failed to generate resume: ${detail}` : 'Failed to generate resume' },
      { status: 500 }
    );
  }
}
