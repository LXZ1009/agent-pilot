interface WorkbenchContextState {
  meetingId: string;
  meetingTitle: string;
  scheduledStart: string;
  hostName: string;
  businessTopic: string;
  intervieweesText: string;
}

interface Props {
  context: WorkbenchContextState;
  onChange: <Key extends keyof WorkbenchContextState>(key: Key, value: WorkbenchContextState[Key]) => void;
}

export function MeetingSetupPanel({ context, onChange }: Props) {
  return (
    <section className="setup-panel">
      <div className="setup-grid">
        <label>
          任务实例 ID
          <input value={context.meetingId} onChange={(event) => onChange('meetingId', event.target.value)} />
        </label>
        <label>
          任务标题
          <input value={context.meetingTitle} onChange={(event) => onChange('meetingTitle', event.target.value)} />
        </label>
        <label>
          开始时间
          <input value={context.scheduledStart} onChange={(event) => onChange('scheduledStart', event.target.value)} />
        </label>
        <label>
          主持/负责人
          <input value={context.hostName} onChange={(event) => onChange('hostName', event.target.value)} />
        </label>
        <label className="wide-field">
          业务主题
          <input value={context.businessTopic} onChange={(event) => onChange('businessTopic', event.target.value)} />
        </label>
        <label className="wide-field">
          参与对象（每行：id,姓名,角色,区域）
          <textarea
            value={context.intervieweesText}
            onChange={(event) => onChange('intervieweesText', event.target.value)}
            rows={3}
          />
        </label>
      </div>
    </section>
  );
}
