import { NextRequest } from 'next/server';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export interface AIConfig {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}


/**
 * Some OpenAI-compatible gateways answer a non-streaming request with an SSE
 * stream anyway, which makes the AI SDK fail with `Unexpected token 'd'`.
 * This wrapper folds those chunks back into a single chat.completion JSON body.
 * Real streaming requests are passed through untouched.
 */
async function foldSseToJson(res: Response): Promise<Response> {
  const text = await res.text();
  if (!text.trimStart().startsWith('data:')) {
    return new Response(text, { status: res.status, headers: res.headers });
  }

  let content = '';
  let model = '';
  let usage: unknown = undefined;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const chunk = JSON.parse(payload);
      if (chunk?.model) model = chunk.model;
      const choice = chunk?.choices?.[0];
      if (typeof choice?.delta?.content === 'string') content += choice.delta.content;
      else if (typeof choice?.message?.content === 'string') content += choice.message.content;
      if (chunk?.usage) usage = chunk.usage;
    } catch {
      // ignore keep-alive / malformed chunks
    }
  }

  const body = {
    id: 'chatcmpl-compat',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    ...(usage ? { usage } : {}),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const compatFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input as RequestInfo, init);
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream')) return res;

  const bodyText =
    typeof init?.body === 'string'
      ? init.body
      : init?.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : '';

  // A real streaming caller wants SSE untouched.
  if (bodyText.includes('"stream":true') || bodyText.includes('"stream": true')) return res;

  const folded = await foldSseToJson(res);
  const payload = await folded.clone().json().catch(() => null);
  const content = payload?.choices?.[0]?.message?.content ?? '';
  if (content) return folded;

  // Some relay channels answer a non-streaming request with an empty SSE
  // (usage only) and only emit content when stream=true. Retry as a stream.
  let retryBody = bodyText;
  try {
    const parsedBody = JSON.parse(bodyText);
    parsedBody.stream = true;
    retryBody = JSON.stringify(parsedBody);
  } catch {
    retryBody = bodyText.replace(/"stream"\s*:\s*false/, '"stream":true');
  }
  if (!retryBody.includes('"stream":true')) return folded;

  const retryRes = await fetch(input as RequestInfo, { ...(init || {}), body: retryBody });
  const retryType = retryRes.headers.get('content-type') || '';
  if (!retryType.includes('text/event-stream')) return retryRes;
  return foldSseToJson(retryRes);
};

export function extractAIConfig(request: NextRequest): AIConfig {
  // Operator-managed mode: the site owner configures one key in the environment
  // and end users never see or supply credentials.
  const managedKey = process.env.AI_API_KEY;
  if (managedKey) {
    return {
      provider: process.env.AI_PROVIDER || 'openai',
      apiKey: managedKey,
      baseURL: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4o',
    };
  }

  const provider = request.headers.get('x-provider') || 'openai';
  const apiKey = request.headers.get('x-api-key') || '';
  const baseURL = request.headers.get('x-base-url') || 'https://api.openai.com/v1';
  const model = request.headers.get('x-model') || 'gpt-4o';
  return { provider, apiKey, baseURL, model };
}

export function getModel(config: AIConfig, modelOverride?: string) {
  if (!config.apiKey) {
    throw new AIConfigError('API key is required. Please configure it in Settings.');
  }
  const modelId = modelOverride || config.model;

  switch (config.provider) {
    case 'anthropic': {
      const p = createAnthropic({ apiKey: config.apiKey, baseURL: config.baseURL || undefined, fetch: compatFetch });
      return p(modelId);
    }
    case 'gemini': {
      const p = createGoogleGenerativeAI({ apiKey: config.apiKey, baseURL: config.baseURL || undefined, fetch: compatFetch });
      return p(modelId);
    }
    default: {
      const p = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, fetch: compatFetch });
      return p.chat(modelId);
    }
  }
}

/**
 * Returns providerOptions for JSON mode — only applicable to OpenAI-compatible providers.
 */
export function getJsonProviderOptions(config: AIConfig) {
  if (config.provider === 'openai') {
    return { openai: { response_format: { type: 'json_object' as const } } };
  }
  return {} as Record<string, never>;
}

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIConfigError';
  }
}
