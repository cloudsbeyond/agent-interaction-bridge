export const GENERAL_SECTION_LABELS = [
  '摘要',
  '结论',
  '一句话',
  '规则',
] as const;

export const ARCHITECTURE_SECTION_TITLES = [
  '一句话',
  '主链路',
  '组件',
  '执行端',
  '边界',
] as const;

export const REPORT_SECTION_TITLES = [
  '状态',
  '完成',
  '进行中',
  '风险',
  '下一步',
] as const;

export const COMPARISON_SECTION_TITLES = [
  '对比结论',
  'A 侧',
  'B 侧',
  '取舍',
  '建议',
] as const;

export const PRESENTATION_SECTION_LABELS = uniqueLabels([
  ...GENERAL_SECTION_LABELS,
  ...ARCHITECTURE_SECTION_TITLES,
  ...REPORT_SECTION_TITLES,
  ...COMPARISON_SECTION_TITLES,
]);

function uniqueLabels(labels: readonly string[]): string[] {
  return [...new Set(labels)];
}
