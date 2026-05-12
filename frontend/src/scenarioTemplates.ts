export interface ScenarioTemplate {
  id: string;
  title: string;
  description: string;
  prompt: string;
  tags: string[];
}

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'pricing_interview',
    title: '定价会议会前访谈',
    description: '发起访谈、收集回复、识别缺口、生成追问。',
    prompt: '开始华东大区定价会的会前访谈，先访谈张三。',
    tags: ['定价会议', '会前访谈']
  },
  {
    id: 'pricing_material',
    title: '生成会议物料',
    description: '基于当前上下文生成会议物料资产包。',
    prompt: '基于当前已收集的信息，生成定价会议物料资产包。',
    tags: ['物料', '资产包']
  },
  {
    id: 'pricing_preview',
    title: '生成会前预览',
    description: '生成会前 5 分钟主持人预览和通知载荷。',
    prompt: '生成会前5分钟主持人预览和通知载荷。',
    tags: ['预览', '通知']
  },
  {
    id: 'generic_risk',
    title: '执行风险分析',
    description: '用同一工作区验证后续其他业务场景。',
    prompt: '分析一下某方案的执行风险，并说明需要哪些业务信息。',
    tags: ['通用任务', '风险分析']
  }
];
