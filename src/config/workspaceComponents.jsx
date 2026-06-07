import RiskWorkspace from '../workspaces/RiskWorkspace.jsx';
import MacroWorkspace from '../workspaces/MacroWorkspace.jsx';
import PortfolioWorkspace from '../workspaces/PortfolioWorkspace.jsx';
import ExecutionWorkspace from '../workspaces/ExecutionWorkspace.jsx';
import ReplayWorkspace from '../workspaces/ReplayWorkspace.jsx';
import QuantLabWorkspace from '../workspaces/QuantLabWorkspace.jsx';
import StrategyLabWorkspace from '../workspaces/StrategyLabWorkspace.jsx';
import StrategyBuilderWorkspace from '../workspaces/StrategyBuilderWorkspace.jsx';
import PaperTradingWorkspace from '../workspaces/PaperTradingWorkspace.jsx';
import LiveDataWorkspace from '../workspaces/LiveDataWorkspace.jsx';
import ChartOrderflowWorkspace from '../workspaces/ChartOrderflowWorkspace.jsx';
import AILabWorkspace from '../workspaces/AILabWorkspace.jsx';
import AlertsWorkspace from '../workspaces/AlertsWorkspace.jsx';
import OMSWorkspace from '../workspaces/OMSWorkspace.jsx';
import InstitutionalWorkspace from '../workspaces/InstitutionalWorkspace.jsx';
import OpsWorkspace from '../workspaces/OpsWorkspace.jsx';
import MLDashboard from '../workspaces/MLDashboard.jsx';
import HistoricalDataWorkspace from '../workspaces/HistoricalDataWorkspace.jsx';

export const workspaceComponents = {
  Risk: RiskWorkspace,
  Macro: MacroWorkspace,
  Portfolio: PortfolioWorkspace,
  Execution: ExecutionWorkspace,
  Replay: ReplayWorkspace,
  QuantLab: QuantLabWorkspace,
  StrategyLab: StrategyLabWorkspace,
  StrategyBuilder: StrategyBuilderWorkspace,
  PaperTrading: PaperTradingWorkspace,
  LiveData: LiveDataWorkspace,
  ChartOrderflow: ChartOrderflowWorkspace,
  AILab: AILabWorkspace,
  Alerts: AlertsWorkspace,
  OMS: OMSWorkspace,
  Institutional: InstitutionalWorkspace,
  Ops: OpsWorkspace,
  MLEngine: MLDashboard,
  HistoricalData: HistoricalDataWorkspace,
};

export const getWorkspaceComponent = (workspace) => workspaceComponents[workspace?.componentKey];
