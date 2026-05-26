import { useWorkspaceStore } from '../store/workspaceStore';

export default function WorkspaceSwitcher() {
  const { workspace, setWorkspace } = useWorkspaceStore();

  const workspaces = [
    'Risk',
    'Macro',
    'Portfolio',
    'Execution',
    'Replay',
    'QuantLab',
    'StrategyLab',
    'StrategyBuilder',
    'PaperTrading',
  ];

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginBottom: 20,
        flexWrap: 'wrap',
      }}
    >
      {workspaces.map((w) => (
        <button
          key={w}
          onClick={() => setWorkspace(w)}
          style={{
            background:
              workspace === w
                ? '#2563eb'
                : '#111111',
            color: 'white',
            border: '1px solid #202020',
            borderRadius: 10,
            padding: '10px 14px',
            cursor: 'pointer',
          }}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
