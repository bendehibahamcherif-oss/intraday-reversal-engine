# Mobile Navigation Audit

## Current navigation configuration found

| Area | File | Finding |
|---|---|---|
| Desktop sidebar | `src/TerminalSidebar.jsx` | Desktop used a local `NAV_ITEMS` array that included many workspaces unavailable to mobile. |
| Mobile bottom nav | `src/components/terminal/MobileBottomNav.jsx` | Mobile used a separate hardcoded five-item `TABS` array. The `MORE` tab directly opened `Portfolio` instead of an overflow menu. |
| Workspace renderer | `src/App.jsx` | Workspace rendering used a separate `switch` statement, so navigation definitions and renderable workspace ids could drift. |
| Workspace persistence | `src/store/workspaceStore.js` | Persisted workspace ids were accepted without registry validation. Invalid values could fall through to the default renderer silently. |
| Command palette | `src/components/terminal/CommandPalette.jsx` | Workspace commands used another local workspace list and omitted some registered/renderable workspaces. |

## Workspace accessibility matrix before fix

| Workspace | Desktop visible? | Mobile visible? | Route/key | Component | Reason missing | Fix |
|---|---|---|---|---|---|---|
| Chart | Yes | Yes | `ChartOrderflow` | `ChartOrderflowWorkspace` | Present in both hardcoded lists. | Move to canonical registry and keep as mobile primary. |
| Markets | Yes | Yes | `Macro` | `MacroWorkspace` | Present in both hardcoded lists. | Move to canonical registry and keep as mobile primary. |
| Live Data | Yes | No | `LiveData` | `LiveDataWorkspace` | Desktop-only `NAV_ITEMS`; absent from mobile `TABS`; no real More drawer. | Add to registry and mobile More menu. |
| Providers | Implicit only | No | `Providers` | `LiveDataWorkspace` | Provider controls existed inside data/provider UI but had no workspace entry. | Add registry alias entry mapped to Live Data component. |
| Credentials | Implicit only | No | `Credentials` | `LiveDataWorkspace` | Credential controls existed inside provider flow but had no workspace entry. | Add registry alias entry mapped to Live Data component. |
| Stream Status | Implicit only | No | `StreamStatus` | `LiveDataWorkspace` | Status UI existed as data/provider functionality but had no workspace entry. | Add registry alias entry mapped to Live Data component. |
| Provider Diagnostics | Implicit only | No | `ProviderDiagnostics` | `LiveDataWorkspace` | Diagnostics panel existed but had no mobile navigation entry. | Add registry alias entry mapped to Live Data component. |
| Volume Profile | Implicit only | No | `VolumeProfile` | `ChartOrderflowWorkspace` | Chart-related feature had no workspace entry in mobile navigation. | Add registry alias entry mapped to Chart component. |
| Alerts | Yes | Yes | `Alerts` | `AlertsWorkspace` | Present in both hardcoded lists. | Move to canonical registry and keep as mobile primary. |
| AI Lab | Yes | No | `AILab` | `AILabWorkspace` | Desktop-only item; mobile primary used ML Engine instead, not AI Lab. | Add to registry and use as mobile primary. |
| ML Dashboard | Yes | Yes | `MLEngine` | `MLDashboard` | Present as mobile ML tab, but duplicated config. | Move to registry and expose in More menu. |
| ML Model Card | Implicit only | No | `MLModelCard` | `MLDashboard` | Implemented as dashboard tab/content but no workspace entry. | Add registry alias entry mapped to ML Dashboard. |
| ML Training Runs | Implicit only | No | `MLTrainingRuns` | `MLDashboard` | Implemented as dashboard tab/content but no workspace entry. | Add registry alias entry mapped to ML Dashboard. |
| ML Predictions | Implicit only | No | `MLPredictions` | `MLDashboard` | Implemented as dashboard tab/content but no workspace entry. | Add registry alias entry mapped to ML Dashboard. |
| ML Diagnostics & Drift | Implicit only | No | `MLDiagnosticsDrift` | `MLDashboard` | Implemented as dashboard tab/content but no workspace entry. | Add registry alias entry mapped to ML Dashboard. |
| ML Champion Inference | Implicit only | No | `MLChampionInference` | `AILabWorkspace` | Implemented as AI/ML workflow but no workspace entry. | Add registry alias entry mapped to AI Lab component. |
| Historical Data | Yes | No | `HistoricalData` | `HistoricalDataWorkspace` | Desktop-only item; absent from mobile `TABS`; no More drawer. | Add to registry and mobile More menu. |
| Backtesting | Implicit only | No | `Backtesting` | `StrategyBuilderWorkspace` | Backtesting workflow existed but had no mobile workspace entry. | Add registry alias entry mapped to Strategy Builder. |
| Paper Trading | Yes | No | `PaperTrading` | `PaperTradingWorkspace` | Desktop-only item; absent from mobile `TABS`; no More drawer. | Add to registry and mobile More menu. |
| Portfolio | Yes | Misused | `Portfolio` | `PortfolioWorkspace` | The mobile `MORE` tab selected Portfolio instead of opening an overflow menu. | Move Portfolio to scrollable More menu. |
| Risk | Yes | No | `Risk` | `RiskWorkspace` | Desktop-only item; absent from mobile `TABS`; invalid fallback default was Risk. | Add to registry and mobile More menu; default fallback is Chart. |
| Macro / Multi-Asset | Implicit/alias | Partial | `MacroMultiAsset` | `MacroWorkspace` | Macro itself was mobile primary, but named secondary workspace did not exist. | Add explicit More entry mapped to Macro component. |
| Correlation | Implicit only | No | `Correlation` | `MacroWorkspace` | Implemented inside Macro but had no mobile workspace entry. | Add registry alias entry mapped to Macro component. |
| Beta | Implicit only | No | `Beta` | `MacroWorkspace` | Implemented inside Macro but had no mobile workspace entry. | Add registry alias entry mapped to Macro component. |
| Strategy Lab | Yes | No | `StrategyLab` | `StrategyLabWorkspace` | Desktop-only item; absent from mobile `TABS`; no More drawer. | Add to registry and mobile More menu. |
| Quant Lab | Yes | No | `QuantLab` | `QuantLabWorkspace` | Desktop-only item; absent from mobile `TABS`; no More drawer. | Add to registry and mobile More menu. |
| Replay | Yes | No | `Replay` | `ReplayWorkspace` | Desktop-only item; absent from mobile `TABS`; no More drawer. | Add to registry and mobile More menu. |
| Settings / More | No | No | `Settings` | `OpsWorkspace` | No safe workspace entry existed for settings/more system area. | Add registry entry mapped to Operations component. |

## Root cause

The app had at least four separate workspace/menu definitions: desktop sidebar, mobile bottom tabs, command palette, and App renderer. Mobile navigation intentionally exposed only five hardcoded tabs and had no overflow drawer. The `MORE` item was not a menu; it navigated to `Portfolio`, which made all other secondary workspaces unreachable on mobile.
