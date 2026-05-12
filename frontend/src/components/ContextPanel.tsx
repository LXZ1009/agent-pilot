import { Activity, Box, Braces, ClipboardList } from 'lucide-react';

import type { WorkspaceView } from '../workspace';

interface Props {
  view: WorkspaceView;
}

export function ContextPanel({ view }: Props) {
  return (
    <aside className="context-panel">
      <section className="context-card">
        <div className="panel-heading"><ClipboardList size={17} /><strong>当前上下文</strong></div>
        <ul className="context-list">
          {view.contextSummary.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="context-card">
        <div className="panel-heading"><Activity size={17} /><strong>Agent 执行概览</strong></div>
        {view.jobs.length ? (
          <ol className="job-list">
            {view.jobs.map((job) => (
              <li key={job.job_id}>
                <strong>{job.agent}</strong>
                <span>{job.status}</span>
                <p>{job.summary}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted-text">暂无真实 async subagent job。任务启动后会在这里展示执行透明层。</p>
        )}
      </section>

      <section className="context-card">
        <div className="panel-heading"><Box size={17} /><strong>产物</strong></div>
        {view.artifacts.length ? (
          <div className="artifact-stack">
            {view.artifacts.map((artifact) => (
              <div className="artifact-pill" key={artifact.id}>
                <strong>{artifact.title}</strong>
                <span>{artifact.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted-text">暂无产物。可在工作区发起“生成会议物料”或“生成会前预览”。</p>
        )}
      </section>

      <section className="context-card debug-card">
        <details>
          <summary><Braces size={16} /> 原始运行数据</summary>
          <pre>{JSON.stringify(view.raw ?? { status: 'idle' }, null, 2)}</pre>
        </details>
      </section>
    </aside>
  );
}
