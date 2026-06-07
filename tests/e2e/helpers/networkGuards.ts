import { expect, type Page, type Request, type Response } from '@playwright/test';

type ContractFailure = {
  method: string;
  url: string;
  status?: number;
  contentType?: string;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  reason: string;
};

const STALE_ML_ENDPOINTS = [/\/api\/ai\//, /\/api\/ml\/champion(?:\b|\/)/, /\/api\/ai\/models\/[^/]+\/champion/];
const BAD_URL_TOKENS = /(?:undefined|null|NaN)/i;
const preview = (value?: string | null) => String(value || '').slice(0, 500);

function requestBodyFailure(body: string) {
  if (!body) return null;
  if (/"undefined"/.test(body) || /\bundefined\b/.test(body)) return 'request body contains undefined';
  if (/"datasetId"\s*:\s*(?:null|"undefined")/.test(body)) return 'request body contains invalid datasetId';
  if (/"modelId"\s*:\s*(?:null|"undefined")/.test(body)) return 'request body contains invalid modelId';
  if (/"symbol"\s*:\s*(?:null|"undefined")/.test(body)) return 'request body contains invalid symbol';
  if (/"symbols"\s*:\s*\[\s*\]/.test(body)) return 'request body contains empty symbols array';
  return null;
}

export function attachNetworkGuards(page: Page, options: { allowApi404?: boolean } = {}) {
  const failures: ContractFailure[] = [];
  const apiRequests: ContractFailure[] = [];

  const push = (failure: ContractFailure) => failures.push(failure);
  const baseLog = (request: Request): ContractFailure => ({
    method: request.method(),
    url: request.url(),
    requestBodyPreview: preview(request.postData()),
    reason: '',
  });

  page.on('request', (request) => {
    const url = request.url();
    const isApi = /\/api\//.test(url);
    const base = baseLog(request);
    if (isApi) apiRequests.push({ ...base, reason: 'api-request' });
    if (BAD_URL_TOKENS.test(url)) push({ ...base, reason: 'URL contains undefined/null/NaN' });
    if (STALE_ML_ENDPOINTS.some((pattern) => pattern.test(url))) push({ ...base, reason: 'stale ML lifecycle endpoint used' });
    const bodyReason = requestBodyFailure(request.postData() || '');
    if (bodyReason) push({ ...base, reason: bodyReason });
  });

  page.on('response', async (response: Response) => {
    const request = response.request();
    const url = response.url();
    if (!/\/api\//.test(url)) return;
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';
    const body = await response.text().catch(() => '');
    const base: ContractFailure = {
      method: request.method(),
      url,
      status,
      contentType,
      requestBodyPreview: preview(request.postData()),
      responseBodyPreview: preview(body),
      reason: '',
    };
    const entry = apiRequests.find((item) => item.method === request.method() && item.url === url && item.status === undefined);
    if (entry) Object.assign(entry, { status, contentType, responseBodyPreview: preview(body) });
    if (/html/i.test(contentType) || /^\s*<!doctype html/i.test(body) || /^\s*<html/i.test(body)) push({ ...base, reason: '/api response returned HTML' });
    if (status === 404 && !options.allowApi404) push({ ...base, reason: '/api response returned 404' });
    if (status >= 500) push({ ...base, reason: '/api response returned 5xx' });
    if (body && /json/i.test(contentType)) {
      try { JSON.parse(body); } catch { push({ ...base, reason: '/api response returned invalid JSON' }); }
    }
  });

  page.on('requestfailed', (request) => {
    if (/\/api\//.test(request.url())) push({ ...baseLog(request), reason: `network request failed: ${request.failure()?.errorText || 'unknown'}` });
  });

  return {
    failures,
    apiRequests,
    assertClean() {
      expect(failures, `Network contract failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
    },
  };
}
