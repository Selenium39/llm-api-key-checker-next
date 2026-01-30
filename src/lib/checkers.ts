import { getProviderMeta, ProviderId } from './providers';

export type CheckRequest = {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  keys: string[];
  concurrency: number;
  validationPrompt?: string;
  lowThreshold?: number; // for status classification
  enableStream?: boolean;
};

export type CheckResult = {
  key: string;
  ok: boolean;
  status:
    | 'valid'
    | 'invalid'
    | 'rate_limited'
    | 'unknown_error'
    | 'low'
    | 'zero'
    | 'no_balance';
  message?: string;
  balance?: number; // -1 means unavailable
  raw?: unknown;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, '');
}

async function readErrorBody(res: Response) {
  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function classifyHttp(res: Response) {
  if (res.status === 401 || res.status === 403) return 'invalid' as const;
  if (res.status === 429) return 'rate_limited' as const;
  return 'unknown_error' as const;
}

async function checkOpenAICompatibleKey(req: { baseUrl: string; model: string; key: string; prompt?: string }) {
  const url = `${normalizeBaseUrl(req.baseUrl)}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.key}`,
    },
    body: JSON.stringify({
      model: req.model,
      messages: [{ role: 'user', content: req.prompt || 'Hi' }],
      max_tokens: 1,
      stream: false,
    }),
  });

  if (res.ok) {
    const raw = await res.json().catch(() => ({}));
    return { ok: true as const, raw };
  }

  return {
    ok: false as const,
    status: classifyHttp(res),
    raw: await readErrorBody(res),
  };
}

async function checkAnthropicKey(req: { baseUrl: string; model: string; key: string; prompt?: string }) {
  const url = `${normalizeBaseUrl(req.baseUrl)}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': req.key,
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: 1,
      messages: [{ role: 'user', content: req.prompt || 'Hi' }],
    }),
  });

  if (res.ok) {
    const raw = await res.json().catch(() => ({}));
    return { ok: true as const, raw };
  }

  return {
    ok: false as const,
    status: classifyHttp(res),
    raw: await readErrorBody(res),
  };
}

async function checkBalance(provider: ProviderId, baseUrl: string, key: string): Promise<number> {
  // Best-effort, only for providers where this is known to work.
  if (provider === 'deepseek') {
    const url = `${normalizeBaseUrl(baseUrl).replace(/\/v1$/, '')}/user/balance`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } });
    if (!res.ok) return -1;
    const d: any = await res.json().catch(() => null);
    const info = d?.balance_infos?.find((b: any) => b.currency === 'USD') || d?.balance_infos?.[0];
    const bal = info?.total_balance;
    const n = Number(bal);
    return Number.isFinite(n) ? n : -1;
  }

  if (provider === 'moonshot') {
    const url = `${normalizeBaseUrl(baseUrl)}/users/me/balance`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return -1;
    const d: any = await res.json().catch(() => null);
    const n = Number(d?.data?.available_balance);
    return Number.isFinite(n) ? n : -1;
  }

  if (provider === 'newapi') {
    const url = `${normalizeBaseUrl(baseUrl).replace(/\/v1$/, '')}/api/usage/token`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return -1;
    const d: any = await res.json().catch(() => null);
    if (d?.code === true && d?.data) {
      const tokenToUsdRate = 500000;
      const availableUsd = Number((d.data.total_available / tokenToUsdRate).toFixed(2));
      return Number.isFinite(availableUsd) ? availableUsd : -1;
    }
    return -1;
  }

  return -1;
}

export async function checkOne(input: {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  key: string;
  prompt?: string;
  lowThreshold?: number;
}): Promise<CheckResult> {
  const meta = getProviderMeta(input.provider);

  let result:
    | { ok: true; raw: unknown }
    | { ok: false; status: CheckResult['status']; raw: unknown };

  if (meta.kind === 'anthropic') {
    result = await checkAnthropicKey({ baseUrl: input.baseUrl, model: input.model, key: input.key, prompt: input.prompt });
  } else {
    result = await checkOpenAICompatibleKey({ baseUrl: input.baseUrl, model: input.model, key: input.key, prompt: input.prompt });
  }

  if (result.ok) {
    const balance = meta.supportsBalance ? await checkBalance(input.provider, input.baseUrl, input.key) : undefined;

    // Balance-based classification (only when balance is available)
    if (typeof balance === 'number') {
      if (balance === -1) {
        return { key: input.key, ok: true, status: 'no_balance', balance, raw: result.raw };
      }
      if (balance === 0) {
        return { key: input.key, ok: true, status: 'zero', balance, raw: result.raw };
      }
      const th = typeof input.lowThreshold === 'number' ? input.lowThreshold : 0;
      if (th > 0 && balance > 0 && balance < th) {
        return { key: input.key, ok: true, status: 'low', balance, raw: result.raw };
      }
    }

    return { key: input.key, ok: true, status: 'valid', balance, raw: result.raw };
  }

  return {
    key: input.key,
    ok: false,
    status: result.status,
    message: result.status === 'invalid' ? '认证失败/无效Key' : result.status === 'rate_limited' ? '请求频繁/被限流' : '请求失败',
    raw: result.raw,
  };
}

export function parseKeys(text: string): string[] {
  const parts = text
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // de-dup preserve order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}
