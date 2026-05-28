# Frontend Architecture Audit
## Intraday Reversal Engine — Symbol Switching & Refresh Synchronization

---

## 1. Store Map

| Store | Key Fields | What Mutates It |
|---|---|---|
| `chartStore` | `symbol`, `timeframe`, `limit`, `candles`, `indicators`, `overlays`, `orderflow`, `source`, `loading`, `error` | `setSymbol`, `setTimeframe`, `loadChartPayload`, `refreshChart` |
| `feedStore` | `symbol`, `timeframe`, `feedStatus`, `latestTick`, `latestCandle`, `latestOrderBook`, `providers`, `activeProviders`, `selectedProviders`, `runtime`, `hasHydratedProviders` | `setSymbol`, `loadActiveProviders`, `hydrateFromReplayCandles`, `loadFeedStatus`, `loadLatestMarketData`, `saveActiveProviders` |
| `replayStore` | `symbol` (hardcoded `'SPX'`), `replayMode`, `replayData`, `replayIndex`, `playing`, `sessionId`, `timeframe` | `setTimeframe`, `setFromReplayEvent`, `startReplay`, `stopReplay` |
| `marketStore` | `prices{}`, `signals`, `regime`, `ticks`, `candles1m{}` (keyed by symbol), `orderBook{}` (keyed by symbol) | WS `onMessage` events via `wsClient` |
| `socketStore` | `connected`, `latency`, `messages`, `subscriptions` | WS `onMessage` via `wsClient`, `setInterval` |
| `workspaceStore` | `workspace` (persisted) | `setWorkspace` |
| `watchlistStore` | `watchlist` (persisted) | `addSymbol`, `removeSymbol`, `setWatchlist` |
| `quantLabStore` | `symbol` (own copy, default `'SPY'`) | `setSymbol` (isolated) |
| `strategyLabStore` | `symbol` (own copy, default `'SPY'`) | `setSymbol` (isolated) |
| `aiLabStore` | `symbol` (own copy, default `'SPY'`) | `setSymbol` (isolated) |

**Symbol is stored independently in 6 stores. None subscribe to each other.**

---

## 2. Data Flow: Symbol Selection → API Fetch → Chart Render

```
User clicks symbol in TerminalSidebar (App.jsx:119)
  → onSelectSymbol(symbol)
  → handleWatchlistSelect(symbol) [App.jsx:101–104]
    → setChartSymbol(symbol)       ← ONLY updates chartStore.symbol
    → await refreshChart()         ← no guard, no cancellation

    feedStore.symbol:       NEVER updated
    replayStore.symbol:     NEVER updated (stays 'SPX' forever)
    quantLabStore.symbol:   NEVER updated from watchlist
    strategyLabStore.symbol: NEVER updated from watchlist
    aiLabStore.symbol:      NEVER updated from watchlist

chartStore.loadChartPayload():
  1. Captures symbol at call time
  2. Fires fetch with no AbortController
  3. On resolve: blindly writes candles to store (no symbol guard)
  4. Calls feedStore.hydrateFromReplayCandles({ symbol: staleSymbol })
     → This overwrites feedStore.symbol with the captured (possibly stale) symbol
```

---

## 3. Confirmed Bugs

### BUG-01 — Stale fetch overwrites chart on symbol switch
**File**: `src/store/chartStore.js:57–97`

`loadChartPayload` captures `symbol` at call start, fires an uncancellable fetch, then
writes `candles` to the store unconditionally after resolve. No post-fetch symbol guard.

```js
// line 57–58: symbol captured before await
const { symbol, timeframe, limit } = get();
// line 62: fetch starts — no AbortController
const payload = await api.getChartPayload(symbol, timeframe, limit);
// line 74: blindly overwrites even if chartStore.symbol has changed
set({ candles: normalizedCandles, ... });
// line 85: also contaminates feedStore with potentially stale symbol
useFeedStore.getState().hydrateFromReplayCandles({ ..., symbol, ... });
```

**Impact**: Rapid symbol switching → last-to-resolve wins, not last-selected. Chart
displays symbol A's data under symbol B's label.

---

### BUG-02 — No AbortController anywhere in the API layer
**File**: `src/api.js` (all `fetch()` calls)

Every `fetch()` in `api.js` uses a plain call with no `signal`. There is no mechanism
to cancel in-flight requests on symbol switch. This makes BUG-01 structurally inevitable.

---

### BUG-03 — `hydrateFromReplayCandles` writes stale symbol back to `feedStore`
**File**: `src/store/feedStore.js:554–571`, called from `src/store/chartStore.js:85`

After a stale fetch resolves (BUG-01), it calls `hydrateFromReplayCandles({ symbol: staleSymbol })`:

```js
// feedStore.js:569
return { symbol: normalizedSymbol, activeSymbols: [normalizedSymbol], latestCandle, ... };
```

The log at line 568 (`'runtime overwrite attempt blocked from replay hydration'`) is
misleading: the function **does** overwrite `symbol`, `latestCandle`, `latestTick`,
`feedStatus`, and `activeSymbols`. Only `runtime.source` is protected.

---

### BUG-04 — `handleWatchlistSelect` never updates `feedStore.symbol`
**File**: `src/App.jsx:101–104`

```js
const handleWatchlistSelect = async (symbol) => {
  setChartSymbol(symbol);   // ✓ chartStore.symbol updated
  await refreshChart();      // ✓ fetches for chartStore
  // ✗ feedStore.symbol never set
  // ✗ feedStore.loadLatestMarketData() never called
};
```

`LiveDataWorkspace` triggers `loadLatestMarketData` on `store.symbol` change
(`LiveDataWorkspace.jsx:111–115`), but since `feedStore.symbol` doesn't change,
it never refetches. LiveDataWorkspace always shows data for the previously active symbol.

---

### BUG-05 — `loadActiveProviders` silently overwrites user-selected symbol
**File**: `src/store/feedStore.js:367`

```js
const nextSymbol = String(activeSymbols[0] || '').trim().toUpperCase();
// ...
return { symbol: nextSymbol || state.symbol, ... };
```

The backend's first active symbol replaces the user's selected symbol on every provider
refresh. This fires from `refreshAll` and `initializeFeedWorkspace` (workspace init).

---

### BUG-06 — `feedStore.loadLatestMarketData` has no post-fetch symbol guard
**File**: `src/store/feedStore.js:478–495`

Same pattern as BUG-01. Captures `symbol` before a three-way `Promise.all`, then
unconditionally writes `latestTick`, `latestCandle`, `latestOrderBook` without
verifying symbol hasn't changed since the call started.

---

### BUG-07 — `replayStore.symbol` is hardcoded `'SPX'` and never synced
**File**: `src/store/replayStore.js:25`

```js
symbol: 'SPX',   // never updated from watchlist or any user action
```

`startReplay` fires `api.replayStart({ symbol: state.symbol })` — always `'SPX'`
unless... it can't be changed because `ReplayWorkspace` has no symbol input.
The replay engine is permanently siloed from the active chart symbol.

---

### BUG-08 — `setFromReplayEvent` has no symbol guard — replay data bleeds across symbols
**File**: `src/store/replayStore.js:106–124`

```js
setFromReplayEvent: (payload) => {
  if (!payload) return;
  // No check: is this replay event for the currently-active symbol?
  if (Array.isArray(payload.candles) && payload.candles.length) {
    set({ replayData: payload.candles, replayIndex: payload.index || 0 });
```

A WS `replay` event from a backend session for symbol A overwrites `replayData`
regardless of which symbol the replay chart is currently showing.

---

### BUG-09 — `replayStore.setTimeframe` has no post-fetch guard
**File**: `src/store/replayStore.js:76–104`

Captures `symbol` and `normalizedTimeframe` before the fetch. After resolve,
unconditionally replaces `replayData`. Rapid timeframe switching (or symbol switch
mid-fetch) causes stale data to overwrite current state.

---

### BUG-10 — `ChartOrderflowWorkspace` `useEffect` missing symbol/timeframe/limit deps
**File**: `src/workspaces/ChartOrderflowWorkspace.jsx:67–69`

```js
useEffect(() => {
  refreshChart();
}, []);   // fires only on mount
```

The symbol `<input>` and timeframe `<select>` update `chartStore` on every change,
but no `useEffect` reacts to those changes. The user must manually click "Refresh"
to see the chart update. On workspace remount, it fetches with whatever symbol is
currently in the store — which may be stale from a previous watchlist click.

---

### BUG-11 — Symbol input fires store write on every keystroke with no debounce
**File**: `src/workspaces/ChartOrderflowWorkspace.jsx:85`

```jsx
onChange={(e) => setSymbol(e.target.value.toUpperCase())}
```

Typing `'AAPL'` triggers 4 Zustand `set` calls: `'A'`, `'AA'`, `'AAP'`, `'AAPL'`,
re-rendering all chart subscribers on each keystroke. If BUG-10 were fixed with
reactive deps, this would also fire 4 fetches.

---

### BUG-12 — Rapid watchlist clicks fire multiple concurrent uncancelled fetches
**File**: `src/App.jsx:101–104`

`handleWatchlistSelect` is `async` but there is no debounce, lock, or cancellation.
Three rapid clicks start three concurrent `loadChartPayload` calls. The
last-to-resolve (not last-selected) wins and writes to `chartStore.candles`.

---

### BUG-13 — `LiveDataWorkspace` subscribes to entire `feedStore` without selector
**File**: `src/workspaces/LiveDataWorkspace.jsx:95`

```js
const store = useFeedStore();   // no selector — re-renders on any state change
```

Any write to any field in `feedStore` (including intermediate loading states) causes
this workspace to re-render. This is also why the second `useEffect` sees stale
function references and why `store.loadLatestMarketData` is missing from deps.

---

### BUG-14 — WebSocket subscriptions are never removed
**File**: `src/App.jsx:93–99`

```js
useEffect(() => {
  watchlist.forEach((symbol) => {
    if (subscribedRef.current.has(symbol)) return;
    useMarketStore.getState().subscribeSymbol(symbol);
    subscribedRef.current.add(symbol);
  });
}, [watchlist]);
```

When a symbol is removed from the watchlist, no unsubscribe is sent. The backend
continues pushing market data for removed symbols indefinitely.

---

### BUG-15 — Two separate WebSocket transports targeting different endpoints
**File**: `src/services/wsClient.js:94–96`, `src/core/streamManager.js:14–23`

- `wsClient` (raw WebSocket): `VITE_WS_URL || 'ws://localhost:3001/ws'`
- `streamManager` (socket.io): `api.base` = `VITE_API_BASE || 'http://localhost:10000'`

`marketStore` and `socketStore` use `wsClient`. `realtimeBindings` uses `streamManager`.
These are two different connections. If `wsClient` targets a non-existent port 3001
endpoint, `marketStore` receives no data silently.

---

### BUG-16 — `marketStore.initialize` and `socketStore.initialize` register permanent listeners
**File**: `src/store/marketStore.js:36`, `src/store/socketStore.js:14`

```js
initialize: () => {
  wsClient.onMessage((message) => { ... });   // pushed to listeners[], never removed
}
```

`wsClient.onMessage` only appends. `initialize()` called more than once (hot reload,
re-mount) stacks duplicate listeners. `socketStore.initialize` also starts a
`setInterval` that is never cleared.

---

### BUG-17 — Flash of stale candles when switching symbols
**File**: `src/store/chartStore.js:52`, `src/workspaces/ChartOrderflowWorkspace.jsx:97`

`setSymbol` updates the store synchronously (symbol label changes), but `candles` are
not cleared. The chart renders the previous symbol's candles under the new symbol's
label during the fetch latency window.

---

### BUG-18 — Six stores each own independent `symbol` with no coordination
**File**: `chartStore.js:39`, `feedStore.js:5`, `replayStore.js:25`, `quantLabStore.js:55`, `strategyLabStore.js:31`, `aiLabStore.js:16`

Possible simultaneous state:
```
chartStore.symbol     = 'AAPL'   (last watchlist click)
feedStore.symbol      = 'SPY'    (provider-synced override)
replayStore.symbol    = 'SPX'    (hardcoded default, never changed)
quantLabStore.symbol  = 'MSFT'   (last used in QuantLab)
strategyLabStore.symbol = 'QQQ'
aiLabStore.symbol     = 'SPY'
```

---

## 4. Architecture Diagram

```
                   User
                     │
          click symbol in sidebar
                     │
                     ▼
           App.handleWatchlistSelect
                │           │
                │    setChartSymbol ──→ chartStore.symbol ✓
                │    refreshChart() ──→ loadChartPayload()
                │                          │
                │                    [no cancel, no guard]
                │                          │ fetch resolves
                │                          ▼
                │                  set({ candles })        ← stale overwrite possible
                │                  hydrateFromReplayCandles ← writes stale symbol to feedStore
                │
                ✗ feedStore.symbol  NOT updated
                ✗ replayStore.symbol NOT updated (stuck at 'SPX')
                ✗ quantLabStore.symbol NOT updated
                ✗ strategyLabStore.symbol NOT updated
                ✗ aiLabStore.symbol NOT updated


feedStore:
  loadActiveProviders() ──→ can overwrite symbol from backend activeSymbols[0]
  loadLatestMarketData() ──→ no symbol guard, stale writes possible

replayStore:
  setFromReplayEvent() ──→ no symbol guard, WS events from any symbol pollute replayData
  setTimeframe() ──→ no post-fetch guard

Two WS connections:
  wsClient → ws://localhost:3001/ws     (marketStore, socketStore)
  streamManager → localhost:10000       (realtimeBindings → marketStore prices)
  ↑ both permanent, neither cleaned up
```

---

## 5. Clean Architecture

### Single Source of Truth

Create `src/store/terminalStore.js`:

```js
export const useTerminalStore = create((set) => ({
  symbol: 'SPY',
  timeframe: '1m',
  setSymbol: (s) => set({ symbol: normalizeSymbol(s) }),
  setTimeframe: (tf) => set({ timeframe: tf || '1m' }),
}));
```

All stores that need the active symbol receive it as a **parameter** to their action
calls, not as owned state. `feedStore.symbol` and `replayStore.symbol` fields are
removed. `chartStore.symbol` becomes the same `terminalStore.symbol` (or is removed
and always reads from terminal store).

Feature stores (`quantLabStore`, `strategyLabStore`, `aiLabStore`) may retain their
own local symbol for independent UX, but should initialize from `terminalStore.symbol`
and expose a UI to change it within the workspace.

### Request Lifecycle

Every fetch action pattern:

```js
let _abortController = null;

loadChartPayload: async () => {
  if (_abortController) _abortController.abort();
  _abortController = new AbortController();

  const { symbol, timeframe, limit } = get();
  set({ loading: true, candles: [], error: '' });   // clear immediately

  try {
    const payload = await api.getChartPayload(symbol, timeframe, limit, _abortController.signal);
    if (get().symbol !== symbol) return;             // post-fetch guard
    set({ candles: ..., loading: false });
  } catch (err) {
    if (err.name === 'AbortError') return;
    set({ loading: false, error: err.message });
  }
}
```

`api.js` must thread `signal` parameter through to `fetch(url, { signal, ...options })`.

### Provider/Runtime Lifecycle

- Remove `symbol: nextSymbol || state.symbol` from `feedStore.loadActiveProviders` (line 367).
- Remove `symbol: normalizedSymbol` from `feedStore.hydrateFromReplayCandles` (line 569).
- Provider start/stop must never own symbol. Symbol is user-controlled.

### Chart Hydration Gate

Strict sequence:
1. `setSymbol(s)` → immediately `set({ candles: [], loading: true })`
2. `loadChartPayload()` with AbortController
3. After await: `if (get().symbol !== capturedSymbol) return`
4. On success: `set({ candles, loading: false })`

`ChartOrderflowWorkspace`:
```js
// debounce symbol input to 400ms
const [symbolDraft, setSymbolDraft] = useState(symbol);
useEffect(() => {
  const id = setTimeout(() => setSymbol(symbolDraft), 400);
  return () => clearTimeout(id);
}, [symbolDraft]);

useEffect(() => {
  refreshChart();
}, [symbol, timeframe, limit]);   // reactive deps
```

### Replay Isolation

```js
// In ReplayWorkspace
const activeSymbol = useTerminalStore((s) => s.symbol);
const { symbol: replaySymbol, playing, stopReplay } = useReplayStore();

useEffect(() => {
  if (replaySymbol === activeSymbol) return;
  if (playing) stopReplay();
  useReplayStore.setState({
    symbol: activeSymbol,
    replayData: fallbackReplayData(),
    replayIndex: 0,
    sessionId: null,
    playing: false,
  });
}, [activeSymbol]);
```

`setFromReplayEvent` must guard:
```js
if (payload.symbol && payload.symbol !== get().symbol) return;
```

### Recommended Final Store Topology

```
terminalStore          — symbol, timeframe (global, single owner)
watchlistStore         — watchlist (persisted, no symbol)
workspaceStore         — workspace (persisted)

chartStore             — candles, indicators, overlays, orderflow, loading, error
                         ← symbol param passed from terminalStore, NOT owned

feedStore              — feedStatus, latestTick, latestCandle, latestOrderBook
                         providers, activeProviders, selectedProviders, runtime
                         ← symbol param passed from terminalStore, NOT owned

replayStore            — replayMode, replayData, replayIndex, playing, sessionId
                         ← symbol synced from terminalStore on change, resets on change

marketStore            — prices{sym}, candles1m{sym}, orderBook{sym}
                         ← naturally multi-symbol keyed, no single-symbol assumption

socketStore            — connected, latency, messages (no symbol)

quantLabStore          — local symbol (user-controlled within workspace)
strategyLabStore       — local symbol (user-controlled within workspace)
aiLabStore             — local symbol (user-controlled within workspace)
```

---

## 6. Priority-Ordered Refactor Steps

### P0 — Stop active data corruption (minimal, targeted fixes)

1. **`chartStore.js:74`** — Add `if (get().symbol !== symbol) return;` immediately after the `await`. One line.

2. **`feedStore.js:569`** — Remove `symbol: normalizedSymbol,` from `hydrateFromReplayCandles` return object. Chart hydration must not own symbol.

3. **`feedStore.js:367`** — Remove `symbol: nextSymbol || state.symbol,` from `loadActiveProviders` return. Provider sync must not hijack user symbol.

4. **`feedStore.js:488`** — Add `if (get().symbol !== symbol) return;` after the `Promise.all` in `loadLatestMarketData`.

5. **`replayStore.js:109`** — Add symbol guard at top of `setFromReplayEvent`: `if (payload.symbol && payload.symbol !== get().symbol) return;`

6. **`chartStore.js:52`** — In `setSymbol`, also clear candles: `set({ symbol: normalizeSymbol(symbol) || DEFAULT_SYMBOL, candles: [], loading: false })` so stale candles are never shown under a new symbol label.

### P1 — Symbol single-source-of-truth

7. Create `src/store/terminalStore.js` with `symbol` and `setSymbol`.

8. **`App.jsx:101–104`** — `handleWatchlistSelect` calls both `terminalStore.setSymbol(symbol)` and `feedStore.setSymbol(symbol)` before kicking the refresh.

9. **`feedStore`** — Subscribe to `terminalStore.symbol` changes (via `useEffect` in a hook or via `subscribe`) and auto-call `loadLatestMarketData` when symbol changes.

### P2 — Request cancellation

10. Add `signal` parameter to `api.getChartPayload`, `api.getLatestTick`, `api.getLatestCandle`, `api.getLatestOrderBook`.

11. Add module-level `AbortController` ref to `chartStore.loadChartPayload` and `feedStore.loadLatestMarketData`.

12. Add `AbortController` to `replayStore.setTimeframe` + post-fetch timeframe guard.

### P3 — Chart UX fixes

13. **`ChartOrderflowWorkspace.jsx:67–69`** — Add `[symbol, timeframe, limit]` to `useEffect` deps. Wrap symbol `<input>` in local draft state with 400ms debounce before committing to store.

14. **`ChartOrderflowWorkspace.jsx`** — Extract `CandlestickChart` to a separate file to prevent it re-rendering on every parent state change.

### P4 — Replay isolation

15. Add symbol input to `ReplayWorkspace` and sync `replayStore.symbol` from `terminalStore.symbol` with reset logic.

16. Call `stopReplay()` in `App.handleWatchlistSelect` if `replayStore.playing` is true.

### P5 — WebSocket hygiene

17. **`App.jsx:93–99`** — On watchlist change, compute removed symbols and call `wsClient.send({ type: 'unsubscribe', channel: ... })` for each.

18. Audit `wsClient` vs `streamManager` — determine which endpoint is live, remove the dead one, ensure `marketStore` price updates flow through a single transport.

19. Guard `marketStore.initialize` with `if (this._initialized) return; this._initialized = true;` to prevent duplicate listener registration.

### P6 — Store subscription hygiene

20. **`LiveDataWorkspace.jsx:95`** — Replace `const store = useFeedStore()` with granular selectors to prevent full re-render on any state change.
