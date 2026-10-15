import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TreasureHouseCmsShadow } from './TreasureHouseCmsShadow';
import { TreasureHouseVisualStudio } from '../visual-studio/TreasureHouseVisualStudio';

type Instance = {
  id: string;
  display_name: string;
  client_id: string;
};

type Props = {
  instance: Instance;
  clientName: string;
  error: string | null;
  message: string | null;
  canEdit: boolean;
  canSubmit: boolean;
  canPublish: boolean;
  canUpload: boolean;
};

/**
 * Splits Treasure House shadow into:
 * - CMS Management — dashboard, modules forms, media, history, settings
 * - Visual Studio — page/content visual editing on the shared shell
 */
export function TreasureHouseWorkspace({
  instance,
  clientName,
  error,
  message,
  canEdit,
  canSubmit,
  canPublish,
  canUpload,
}: Props) {
  const [mode, setMode] = useState<'manage' | 'visual'>('manage');

  return (
    <section className="cms-workspace th-workspace">
      <header className="page-head">
        <div>
          <h1>{instance.display_name}</h1>
          <p>
            {clientName} · shadow CMS (synthetic) · <Link to="/my-cms">Back to My CMS</Link>
          </p>
        </div>
        <div className="th-workspace-modes" role="tablist" aria-label="Treasure House workspace">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'manage'}
            className={mode === 'manage' ? 'on' : 'secondary'}
            onClick={() => setMode('manage')}
          >
            CMS Management
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'visual'}
            className={mode === 'visual' ? 'on' : 'secondary'}
            onClick={() => setMode('visual')}
          >
            Visual Studio
          </button>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {mode === 'manage' ? (
        <>
          <div className="th-workspace-callout panel">
            <div>
              <strong>Administration</strong>
              <p className="muted-sm" style={{ margin: '0.35rem 0 0' }}>
                Dashboard, records, media, history and settings. Use{' '}
                <strong>Visual Studio</strong> to edit supported website pages on a simulated canvas —
                not the live church site.
              </p>
            </div>
            <button type="button" onClick={() => setMode('visual')}>
              Open Visual Studio
            </button>
          </div>
          <TreasureHouseCmsShadow
            instanceId={instance.id}
            clientId={instance.client_id}
            canEdit={canEdit}
            canSubmit={canSubmit}
            canPublish={canPublish}
            canUploadMedia={canUpload}
          />
        </>
      ) : (
        <TreasureHouseVisualStudio
          instanceId={instance.id}
          clientId={instance.client_id}
          canEdit={canEdit}
          canSubmit={canSubmit}
          canPublish={canPublish}
          canUploadMedia={canUpload}
          onExitToManagement={() => setMode('manage')}
        />
      )}
    </section>
  );
}
