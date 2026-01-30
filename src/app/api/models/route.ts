import { NextRequest } from 'next/server';
import { ProviderId } from '@/lib/providers';

export const runtime = 'nodejs';

type Body = {
  provider: ProviderId;
  baseUrl: string;
  keys: string[];
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

async function tryOpenAIModels(baseUrl: string, key: string): Promise<string[] | null> {
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) return null;
  const d: any = await res.json().catch(() => null);
  const list = d?.data;
  if (!Array.isArray(list)) return null;
  const ids = list.map((m: any) => m?.id).filter(Boolean);
  return Array.from(new Set(ids));
}

async function tryAnthropicModels(baseUrl: string, key: string): Promise<string[] | null> {
  // Anthropic has an API endpoint /v1/models (may require newer versions/permissions).
  const url = `${normalizeBaseUrl(baseUrl)}/models`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      Accept: 'application/json'
    }
  });
  if (!res.ok) return null;
  const d: any = await res.json().catch(() => null);
  const list = d?.data;
  if (!Array.isArray(list)) return null;
  const ids = list.map((m: any) => m?.id).filter(Boolean);
  return Array.from(new Set(ids));
}

function isLikelyOpenAICompatible(provider: ProviderId) {
  // For our MVP, treat most providers as OpenAI-compatible.
  return provider !== 'anthropic';
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  const keys = Array.isArray(body.keys) ? body.keys : [];

  const out: { ok: boolean; models?: string[]; tried: number; message?: string } = {
    ok: false,
    tried: 0
  };

  for (const k of keys) {
    if (!k) continue;
    out.tried++;

    const models = isLikelyOpenAICompatible(body.provider)
      ? await tryOpenAIModels(body.baseUrl, k)
      : await tryAnthropicModels(body.baseUrl, k);

    if (models && models.length) {
      out.ok = true;
      out.models = models;
      return Response.json(out);
    }
  }

  out.message = 'Unable to fetch models with provided keys.';
  return Response.json(out, { status: 400 });
}
