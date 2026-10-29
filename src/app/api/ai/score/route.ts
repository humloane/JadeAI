import { NextRequest, NextResponse } from 'next/server';
import { resumeRepository } from '@/lib/db/repositories/resume.repository';
import { resolveUser, getUserIdFromRequest } from '@/lib/auth/helpers';
import { scoreResume, type ScoreInputSection } from '@/lib/resume/score';

export async function POST(request: NextRequest) {
  try {
    const fingerprint = getUserIdFromRequest(request);
    const user = await resolveUser(fingerprint);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const resumeId = String(body?.resumeId || '');
    const jobDescription = typeof body?.jobDescription === 'string' ? body.jobDescription : undefined;

    let sections: ScoreInputSection[];

    if (resumeId) {
      const resume = await resumeRepository.findById(resumeId);
      if (!resume) {
        return NextResponse.json({ error: '简历不存在' }, { status: 404 });
      }
      if (resume.userId !== user.id) {
        return NextResponse.json({ error: '无权访问' }, { status: 403 });
      }
      sections = (resume.sections || []) as ScoreInputSection[];
    } else if (Array.isArray(body?.sections)) {
      sections = body.sections as ScoreInputSection[];
    } else {
      return NextResponse.json({ error: '缺少 resumeId 或 sections' }, { status: 400 });
    }

    const result = scoreResume(sections, { jobDescription });
    return NextResponse.json(result);
  } catch (error) {
    console.error('POST /api/ai/score error:', error);
    return NextResponse.json({ error: '评分失败' }, { status: 500 });
  }
}
