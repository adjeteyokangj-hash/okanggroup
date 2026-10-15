import { useState, type CSSProperties, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import type { StudioPanelState } from './types';
import { snapPanelAfterDrag } from './panelManager';

type Props = {
  panel: StudioPanelState;
  title: string;
  children: ReactNode;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onDock: (dock: StudioPanelState['dock']) => void;
  onSnapCommit: (panel: StudioPanelState) => void;
};

export function DockPanel({
  panel,
  title,
  children,
  onFocus,
  onClose,
  onMinimize,
  onMove,
  onResize,
  onDock,
  onSnapCommit,
}: Props) {
  const [dragging, setDragging] = useState(false);

  if (!panel.open) return null;

  if (panel.minimized) {
    const chipStyle: CSSProperties =
      panel.dock === 'right'
        ? { right: 12, top: Math.max(72, panel.y), zIndex: panel.zIndex }
        : panel.dock === 'left'
          ? { left: 12, top: Math.max(72, panel.y), zIndex: panel.zIndex }
          : {
              left: Math.max(12, panel.x),
              top: Math.max(72, panel.y),
              zIndex: panel.zIndex,
            };
    return (
      <button
        type="button"
        className="vs-panel-chip"
        style={chipStyle}
        title={`Restore ${title}`}
        onClick={(e) => {
          e.stopPropagation();
          onMinimize();
        }}
      >
        {title}
      </button>
    );
  }

  function startDrag(e: ReactMouseEvent) {
    e.preventDefault();
    onFocus();
    if (panel.dock !== 'float') onDock('float');
    setDragging(true);
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = panel.x;
    const oy = panel.y;
    let lastX = ox;
    let lastY = oy;
    function move(ev: MouseEvent) {
      lastX = ox + (ev.clientX - sx);
      lastY = oy + (ev.clientY - sy);
      onMove(lastX, lastY);
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDragging(false);
      onSnapCommit(
        snapPanelAfterDrag({
          ...panel,
          dock: 'float',
          x: lastX,
          y: lastY,
        }),
      );
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function startResize(e: ReactMouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onFocus();
    const sx = e.clientX;
    const sy = e.clientY;
    const ow = panel.width;
    const oh = panel.height;
    function move(ev: MouseEvent) {
      onResize(ow + (ev.clientX - sx), oh + (ev.clientY - sy));
    }
    function up() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  const style: CSSProperties =
    panel.dock === 'left'
      ? {
          left: 12,
          top: 96,
          width: panel.width,
          height: Math.min(panel.height, window.innerHeight - 120),
          zIndex: panel.zIndex,
        }
      : panel.dock === 'right'
        ? {
            right: 12,
            left: 'auto',
            top: 96,
            width: panel.width,
            height: Math.min(panel.height, window.innerHeight - 120),
            zIndex: panel.zIndex,
          }
        : panel.dock === 'bottom'
          ? {
              left: panel.x,
              top: 'auto',
              bottom: 72,
              width: panel.width,
              height: panel.height,
              zIndex: panel.zIndex,
            }
          : {
              left: panel.x,
              top: panel.y,
              width: panel.width,
              height: panel.height,
              zIndex: panel.zIndex,
            };

  function stopHeaderDrag(e: ReactMouseEvent) {
    e.stopPropagation();
  }

  return (
    <aside
      className={`vs-dock-panel dock-${panel.dock}${dragging ? ' is-dragging' : ''}`}
      style={style}
      onMouseDown={onFocus}
    >
      <header className="vs-dock-panel-head">
        <strong className="vs-dock-panel-title" onMouseDown={startDrag} title="Drag panel">
          {title}
        </strong>
        <div className="vs-dock-panel-actions" onMouseDown={stopHeaderDrag}>
          <select
            aria-label={`${title} dock`}
            value={panel.dock}
            onChange={(e) => onDock(e.target.value as StudioPanelState['dock'])}
            onClick={stopHeaderDrag}
            onMouseDown={stopHeaderDrag}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="bottom">Bottom</option>
            <option value="float">Float</option>
          </select>
          <button
            type="button"
            className="secondary"
            title="Minimise to chip"
            onMouseDown={stopHeaderDrag}
            onClick={(e) => {
              e.stopPropagation();
              onMinimize();
            }}
          >
            Min
          </button>
          <button
            type="button"
            className="secondary"
            title="Close panel"
            onMouseDown={stopHeaderDrag}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Close
          </button>
        </div>
      </header>
      <div className="vs-dock-panel-body">{children}</div>
      <div className="vs-dock-resize" onMouseDown={startResize} />
    </aside>
  );
}
