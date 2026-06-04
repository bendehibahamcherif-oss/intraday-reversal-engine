import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useTerminalLayoutStore } from '../../store/terminalLayoutStore.js';

const panelContentStyle = {
  height: '100%',
  width: '100%',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};

const hResizeHandleStyle = {
  width: 3,
  background: 'var(--t-border)',
  transition: 'background 0.15s',
  cursor: 'col-resize',
};

const vResizeHandleStyle = {
  height: 3,
  background: 'var(--t-border)',
  transition: 'background 0.15s',
  cursor: 'row-resize',
};

export default function ResizableTerminalLayout({
  leftPanel,
  centerPanel,
  rightPanel,
  bottomPanel,
}) {
  const leftVisible   = useTerminalLayoutStore((s) => s.leftVisible);
  const rightVisible  = useTerminalLayoutStore((s) => s.rightVisible);
  const bottomVisible = useTerminalLayoutStore((s) => s.bottomVisible);
  const fullscreenPanel = useTerminalLayoutStore((s) => s.fullscreenPanel);

  // Fullscreen mode: render only the requested panel filling all space
  if (fullscreenPanel) {
    const contentMap = {
      left:   leftPanel,
      center: centerPanel,
      right:  rightPanel,
      bottom: bottomPanel,
    };
    const content = contentMap[fullscreenPanel] ?? centerPanel;
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={panelContentStyle}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PanelGroup
        direction="vertical"
        autoSaveId="terminal-main-v"
        style={{ flex: 1, minHeight: 0 }}
      >
        {/* Top row: left + center + right */}
        <Panel
          minSize={bottomVisible ? 20 : 100}
          defaultSize={bottomVisible ? 90 : 100}
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <PanelGroup
            direction="horizontal"
            autoSaveId="terminal-main-h"
            style={{ flex: 1, minWidth: 0 }}
          >
            {leftVisible && (
              <Panel minSize={5} defaultSize={15} style={{ minWidth: 0 }}>
                <div style={panelContentStyle}>
                  {leftPanel}
                </div>
              </Panel>
            )}

            {leftVisible && (
              <PanelResizeHandle style={hResizeHandleStyle} />
            )}

            <Panel minSize={20} defaultSize={55} style={{ minWidth: 0 }}>
              <div style={panelContentStyle}>
                {centerPanel}
              </div>
            </Panel>

            {rightVisible && (
              <PanelResizeHandle style={hResizeHandleStyle} />
            )}

            {rightVisible && (
              <Panel minSize={5} defaultSize={20} style={{ minWidth: 0 }}>
                <div style={panelContentStyle}>
                  {rightPanel}
                </div>
              </Panel>
            )}
          </PanelGroup>
        </Panel>

        {/* Bottom panel */}
        {bottomVisible && (
          <>
            <PanelResizeHandle style={vResizeHandleStyle} />
            <Panel minSize={5} defaultSize={10} style={{ minHeight: 0 }}>
              <div style={panelContentStyle}>
                {bottomPanel}
              </div>
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
