import { expect, type Page, type Request, type Response } from '@playwright/test';
import { isE2eMockedResponse, isKnownE2eMockedApiRequest } from './apiMocks';

type ContractFailure = {
  method: string;
  url: string;
  status?: number;
  contentType?: string;
  requestBodyPreview?: string;
  responseBodyPreview?: string;
  reason: string;
  classification?: string;
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

function isApi(url: string) {
  return /\/api\//.test(url);
}

function isStale(url: string) {
  return STALE_ML_ENDPOINTS.some((pattern) => pattern.test(url));
}

function isCancelledGetPollingRequest(request: Request) {
  const url = request.url();
  return request.method() === 'GET'
    && isKnownE2eMockedApiRequest(request.method(), url)
    && !BAD_URL_TOKENS.test(url)
    && !isStale(url)
    && /\/api\/(?:chart|feeds?|volume-profile|providers\/health|market\/runtime|market\/subscriptions)/.test(url);
}

export function attachNetworkGuards(page: Page, options: { allowApi404?: boolean } = {}) {
  const failures: ContractFailure[] = [];
  const apiRequests: ContractFailure[] = [];
  const summaries: ContractFailure[] = [];

  const push = (failure: ContractFailure) => failures.push(failure);
  const record = (request: Request, reason: string, classification = reason): ContractFailure => {
    const entry = {
      method: request.method(),
      url: request.url(),
      requestBodyPreview: preview(request.postData()),
      reason,
      classification,
    };
    summaries.push(entry);
    return entry;
  };
  const baseLog = (request: Request): ContractFailure => ({
    method: request.method(),
    url: request.url(),
    requestBodyPreview: preview(request.postData()),
    reason: '',
  });

  page.on('request', (request) => {
    const url = request.url();
    const base = baseLog(request);
    if (isApi(url)) {
      const known = isKnownE2eMockedApiRequest(request.method(), url);
      apiRequests.push({ ...base, reason: 'api-request', classification: known ? 'mock-route-matched' : 'unknown-unmocked-api-request' });
      if (!known) push({ ...base, reason: 'unknown unmocked API request', classification: 'unknown-unmocked-api-request' });
    }
    if (BAD_URL_TOKENS.test(url)) push({ ...base, reason: 'URL contains undefined/null/NaN', classification: 'bad-url-token' });
    if (isStale(url)) push({ ...base, reason: 'stale ML lifecycle endpoint used', classification: 'stale-endpoint' });
    const bodyReason = requestBodyFailure(request.postData() || '');
    if (bodyReason) push({ ...base, reason: bodyReason, classification: 'bad-request-body' });
  });

  page.on('response', async (response: Response) => {
    const request = response.request();
    const url = response.url();
    if (!isApi(url)) return;
    const status = response.status();
    const contentType = response.headers()['content-type'] || '';
    const mocked = isE2eMockedResponse(response.headers());
    const body = await response.text().catch(() => '');
    const base: ContractFailure = {
      method: request.method(),
      url,
      status,
      contentType,
      requestBodyPreview: preview(request.postData()),
      responseBodyPreview: preview(body),
      reason: '',
      classification: mocked ? 'mocked-response-ok' : 'real-response-ok',
    };
    const entry = apiRequests.find((item) => item.method === request.method() && item.url === url && item.status === undefined);
    if (entry) Object.assign(entry, { status, contentType, responseBodyPreview: preview(body), classification: mocked ? 'mocked-response-ok' : 'real-response-ok' });
    record(request, mocked ? 'mocked response ok' : 'real response ok', mocked ? 'mocked-response-ok' : 'real-response-ok');
    if (/html/i.test(contentType) || /^\s*<!doctype html/i.test(body) || /^\s*<html/i.test(body)) push({ ...base, reason: '/api response returned HTML', classification: 'bad-response-html' });
    if (status === 404 && !options.allowApi404) push({ ...base, reason: '/api response returned 404', classification: 'bad-response-404' });
    if (status >= 500) push({ ...base, reason: '/api response returned 5xx', classification: status === 501 ? 'unknown-unmocked-api-request' : 'bad-response-5xx' });
    if (!body && !isCancelledGetPollingRequest(request)) push({ ...base, reason: '/api response returned empty body', classification: 'bad-response-empty-body' });
    if (body && !/json/i.test(contentType)) push({ ...base, reason: '/api response did not declare JSON content-type', classification: 'bad-response-content-type' });
    if (body && /json/i.test(contentType)) {
      try { JSON.parse(body); } catch { push({ ...base, reason: '/api response returned invalid JSON', classification: 'bad-response-invalid-json' }); }
    }
    if (/\b(?:undefined|NaN|Infinity)\b/i.test(body)) push({ ...base, reason: '/api response contains undefined/NaN/Infinity', classification: 'bad-response-invalid-number' });
  });

  page.on('requestfailed', (request) => {
    if (!isApi(request.url())) return;
    const errorText = request.failure()?.errorText || 'unknown';
    if (/net::ERR_ABORTED|NS_BINDING_ABORTED|aborted/i.test(errorText) && isCancelledGetPollingRequest(request)) {
      const entry = apiRequests.find((item) => item.method === request.method() && item.url === request.url() && item.status === undefined);
      if (entry) Object.assign(entry, { reason: 'aborted cancelled GET polling request', classification: 'aborted-cancelled-get-polling-request' });
      record(request, 'aborted cancelled GET polling request', 'aborted-cancelled-get-polling-request');
      return;
    }
    push({ ...baseLog(request), reason: `network request failed: ${errorText}`, classification: /aborted/i.test(errorText) ? 'forbidden-aborted-request' : 'network-request-failed' });
  });

  return {
    failures,
    apiRequests,
    summaries,
    assertClean() {
      expect(failures, `Network contract failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
    },
  };
}
