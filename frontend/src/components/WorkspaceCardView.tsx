import { ClipboardList, FileJson, GitBranch, HelpCircle, MessageSquareText, PackageCheck } from 'lucide-react';

import type { WorkspaceCard } from '../workspace';

interface Props {
  card: WorkspaceCard;
  onAction: (prompt: string) => void;
}

export function WorkspaceCardView({ card, onAction }: Props) {
  return (
    <div className={`workspace-card ${card.type}`}>
      <div className="workspace-card-header">
        <span>{iconFor(card.type)}</span>
        <div>
          <strong>{card.title}</strong>
          {card.status && <small>{card.status}</small>}
        </div>
      </div>
      {card.summary && <p>{card.summary}</p>}
      {card.items?.length ? (
        <ul>
          {card.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
      {card.actions?.length ? (
        <div className="card-actions">
          {card.actions.map((action) => (
            <button
              key={action.id}
              className={action.tone === 'primary' ? 'primary-mini-btn' : 'secondary-mini-btn'}
              type="button"
              onClick={() => onAction(action.prompt)}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function iconFor(type: WorkspaceCard['type']) {
  if (type === 'interview_task') return <MessageSquareText size={17} />;
  if (type === 'missing_fields') return <HelpCircle size={17} />;
  if (type === 'followup_questions') return <ClipboardList size={17} />;
  if (type === 'material_asset') return <PackageCheck size={17} />;
  if (type === 'preview_card') return <FileJson size={17} />;
  if (type === 'agent_job') return <GitBranch size={17} />;
  return <FileJson size={17} />;
}
