/**
 * Network guards for E2E tests.
 *
 * Installs page-level monitors that fail the test on:
 *  - console errors (uncaught exceptions, React errors)
 *  - any /api/* request that returns a non-2xx status
 *  - any /api/* response that is HTML (not JSON)
 *  - request URLs containing dead paths (/api/ai/models/, /api/ml/champion, undefined, null-ids)
 */
import { Page, expect } from '@playwright/test';

export interface GuardViolation {
  type: 'console-error' | 'network-error' | 'html-response' | 'dead-route' | 'bad-url';
  message: string;
  url?: string;
}

const DEAD_ROUTE_PATTERNS: RegExp[] = [
  /\/api\/ai\/models\//,     // removed dead model-lifecycle routes
  /\/api\/ml\/champion\b/,   // never a real endpoint
];

const BAD_URL_PATTERNS: RegExp[] = [
  /\/undefined\b/,
  /\/null\b/,
  /[?&]id=undefined/,
  /[?&]id=null/,
  /[?&]symbol=undefined/,
  /[?&]symbol=null/,
];

export function installNetworkGuards(page: Page, violations: GuardViolation[]) {
  // Console errors (includes unhandled promise rejections surfaced as errors)
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // React intentionally logs caught error boundaries — ignore those.
      if (
        text.includes('The above error occurred in the') ||
        text.includes('React will try to recreate this component')
      ) return;
      violations.push({ type: 'console-error', message: text });
    }
  });

  // Uncaught page errors
  page.on('pageerror', (err) => {
    violations.push({ type: 'console-error', message: `pageerror: ${err.message}` });
  });

  // Network-level guards on every request/response pair
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (url.includes('/api/')) {
      violations.push({ type: 'network-error', message: `Request failed: ${req.method()} ${url}`, url });
    }
  });

  page.on('response', (res) => {
    const url  = res.url();
    const status = res.status();

    if (!url.includes('/api/') && !url.includes('localhost:10000')) return;

    // Non-2xx API response
    if (status < 200 || status >= 300) {
      violations.push({ type: 'network-error', message: `HTTP ${status}: ${url}`, url });
    }

    // HTML content-type from an API route
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('text/html')) {
      violations.push({ type: 'html-response', message: `HTML response from API: ${url}`, url });
    }
  });

  page.on('request', (req) => {
    const url = req.url();

    for (const pattern of DEAD_ROUTE_PATTERNS) {
      if (pattern.test(url)) {
        violations.push({ type: 'dead-route', message: `Dead route called: ${req.method()} ${url}`, url });
      }
    }

    for (const pattern of BAD_URL_PATTERNS) {
      if (pattern.test(url)) {
        violations.push({ type: 'bad-url', message: `Bad URL segment: ${req.method()} ${url}`, url });
      }
    }
  });
}

/**
 * Assert that no guard violations occurred.
 * Call this at the end of each test or at checkpoint moments.
 */
export function assertNoViolations(violations: GuardViolation[], context = '') {
  const label = context ? ` (${context})` : '';
  expect(
    violations,
    `Guard violations${label}:\n${violations.map((v) => `  [${v.type}] ${v.message}`).join('\n')}`,
  ).toHaveLength(0);
}
