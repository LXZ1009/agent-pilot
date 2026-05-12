import { Layers3, Plus, Sparkles } from 'lucide-react';

import type { ScenarioTemplate } from '../scenarioTemplates';
import type { WorkspaceView } from '../workspace';

interface Props {
  view: WorkspaceView;
  templates: ScenarioTemplate[];
  onUseTemplate: (prompt: string) => void;
  onNewSession: () => void;
}

export function SessionSidebar({ view, templates, onUseTemplate, onNewSession }: Props) {
  return (
    <aside className="session-sidebar">
      <div className="brand-card">
        <div className="brand-icon"><Layers3 size={22} /></div>
        <div>
          <span>Agent Pilot</span>
          <strong>多 Agent 协同工作区</strong>
        </div>
      </div>

      <section className="side-section">
        <div className="section-title-row">
          <span className="section-label">当前会话</span>
          <button className="small-icon-btn" type="button" onClick={onNewSession} title="新建任务">
            <Plus size={15} />
          </button>
        </div>
        <button className="session-card active" type="button">
          <span>{view.scenarioName}</span>
          <strong>{view.title}</strong>
          <small>{view.status} · {view.stage}</small>
        </button>
      </section>

      <section className="side-section">
        <span className="section-label">场景模板</span>
        <div className="template-list">
          {templates.map((template) => (
            <button key={template.id} className="template-card" type="button" onClick={() => onUseTemplate(template.prompt)}>
              <div>
                <Sparkles size={15} />
                <strong>{template.title}</strong>
              </div>
              <p>{template.description}</p>
              <small>{template.tags.join(' · ')}</small>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
