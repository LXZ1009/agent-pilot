import { FormEvent } from 'react';
import { RefreshCw, SendHorizonal } from 'lucide-react';

interface Props {
  value: string;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function Composer({ value, loading, onChange, onSubmit }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="workspace-composer" onSubmit={submit}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="直接描述你的任务，例如：开始华东大区定价会的会前访谈，先访谈张三。也可以直接粘贴张三回复内容进行收集。"
        rows={4}
      />
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? <RefreshCw className="spin" size={18} /> : <SendHorizonal size={18} />}
        <span>{loading ? '执行中' : '发送'}</span>
      </button>
    </form>
  );
}
