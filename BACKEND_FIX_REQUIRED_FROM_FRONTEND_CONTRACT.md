# Backend Fix Required — Frontend Production Contract Findings

These failures were discovered by `tests/e2e/production-backend-contract.spec.ts` and
`tests/e2e/production-real-backend-journey.spec.ts` running against the live production
backend at `https://reversal.onrender.com`.

Every item below is a **backend defect** — the frontend correctly calls the route and
correctly renders the response.  No frontend code was changed as a result of these findings.

---

## DEFECT 1 — `GET /api/ops/status` returns 404

### Summary

The Operations workspace (`src/workspaces/OpsWorkspace.jsx`) calls
`GET /api/ops/status` on every render.  The production backend returns HTTP 404
(route not found) instead of the expected JSON snapshot.

### Observed contract violation

| Field          | Value                                              |
|----------------|----------------------------------------------------|
| Method + URL   | `GET https://reversal.onrender.com/api/ops/status` |
| Expected status | 200 with `{ ok: true, service, uptime, memMb, session, ws, metrics, ... }` |
| Actual status  | 404                                                |
| Actual body    | (empty or generic not-found JSON)                  |
| Screen effect  | Operations workspace renders "API endpoint not found" |

### Frontend call site

`src/api.js` — calls `fetch(\`${API_BASE}/api/ops/status\`)`.

Operations workspace polls this route every 15 seconds via `setInterval`.

### Backend route (defined but not reachable in production)

File: `server-deliverables/api15/opsRoutes.js`

```js
router.get('/status', (req, res) => {
  const snap    = metrics.getSnapshot();
  const session = getSessionState();
  const ws      = wsAdapter.getStats();
  res.json({ ok: true, service, uptime, memMb, session, ws, metrics: snap, ... });
});
```

Registered in `server/index.cjs`:

```js
const opsRoutes = require('../server-deliverables/api15/opsRoutes');
// ...
app.use('/api/ops', opsRoutes);   // line 124
```

### Root cause analysis

The route handler file and its dependencies (`../observability/metrics`,
`../guardrails/marketSessionGuardrails`, `../ws/wsScalingAdapter`,
`../config/runtimeConfig`) all exist in the repository.

The most likely causes for the production 404 are:

1. **Silent require() failure at startup** — one of the imported modules
   (`wsScalingAdapter`, `marketSessionGuardrails`, or `metrics`) throws synchronously
   during `require()`.  Express silently skips the `app.use('/api/ops', opsRoutes)`
   call, so the route is never registered.  Other routes are unaffected.

2. **Deployment does not include `server-deliverables/api15/`** — the Render
   deployment may be configured to deploy only certain source directories, and
   `server-deliverables/api15/opsRoutes.js` may have been excluded.

3. **Runtime dependency not available** — `wsAdapter.getStats()` or
   `getSessionState()` throws during the first request, and Express converts the
   unhandled error to a 404 instead of a 500 (unlikely but possible if the error
   occurs inside route registration, not inside the handler).

### Suggested backend fix prompt

> Check the Render production deployment startup log for any `require()` error
> referencing `opsRoutes`, `wsScalingAdapter`, `marketSessionGuardrails`, or `metrics`.
>
> If the module fails to load, wrap the `require()` call in `server/index.cjs` with a
> try/catch that logs the error and registers a fallback 503 handler instead of silently
> skipping the route:
>
> ```js
> let opsRoutes;
> try {
>   opsRoutes = require('../server-deliverables/api15/opsRoutes');
> } catch (err) {
>   console.error('[startup] opsRoutes failed to load:', err);
>   opsRoutes = (_req, res) => res.status(503).json({ ok: false, error: 'ops-unavailable' });
> }
> app.use('/api/ops', opsRoutes);
> ```
>
> Then verify the Operations workspace renders the real status snapshot instead of
> "API endpoint not found".

### Frontend e2e contract test

`tests/e2e/production-backend-contract.spec.ts` — route entry:

```ts
{ method: 'GET', path: '/api/ops/status', workspace: 'Ops' },
// known backend 404 — see BACKEND_FIX_REQUIRED_FROM_FRONTEND_CONTRACT.md
```

The contract test correctly fails this route with `failureReason: 'route-not-found-404'`
and will continue to fail until the backend is repaired.  The test has NOT been weakened.

---

## Status

| Route | Status | Owner |
|-------|--------|-------|
| `GET /api/ops/status` | **BACKEND FIX REQUIRED** | Backend / Ops |

All other 49 routes tested by the production contract spec pass (or return 401/403 as
correctly auth-gated responses, which is a PASS).

---

## How to re-run contract verification after backend fix

```bash
PRODUCTION_CONTRACT=1 \
  PLAYWRIGHT_BASE_URL=https://reversal.onrender.com \
  VITE_API_BASE=https://reversal.onrender.com \
  npx playwright test tests/e2e/production-backend-contract.spec.ts
```

Expected: 50/50 passed (0 failed, ≥1 auth-gated).
