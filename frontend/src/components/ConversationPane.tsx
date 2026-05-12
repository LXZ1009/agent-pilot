import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, UserRound, Wrench } from 'lucide-react';

import type { WorkspaceMessage } from '../workspace';
import { WorkspaceCardView } from './WorkspaceCardView';

interface Props {
  messages: WorkspaceMessage[];
  onAction: (prompt: string) => void;
}

export function ConversationPane({ messages, onAction }: Props) {
  return (
    <section className="conversation-pane">
      {messages.map((message) => (
        <article key={message.id} className={`message-row ${message.role}`}>
          <div className="message-avatar">{iconFor(message.role)}</div>
          <div className="message-content">
            <header>
              <strong>{message.actor}</strong>
              {message.createdAt && <time>{new Date(message.createdAt).toLocaleString()}</time>}
            </header>
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || ' '}</ReactMarkdown>
            </div>
            {message.cards?.length ? (
              <div className="message-cards">
                {message.cards.map((card) => <WorkspaceCardView key={card.id} card={card} onAction={onAction} />)}
              </div>
            ) : null}
          </div>
        </article>
      ))}
    </section>
  );
}

function iconFor(role: WorkspaceMessage['role']) {
  if (role === 'user') return <UserRound size={18} />;
  if (role === 'system') return <Wrench size={18} />;
  return <Bot size={18} />;
}
