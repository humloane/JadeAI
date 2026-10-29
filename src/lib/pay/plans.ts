export interface Plan {
  id: string;
  name: string;
  priceCents: number;
  credits: number;
  days: number | null;
  description: string;
}

export const PLANS: Plan[] = [
  { id: 'single', name: '单份导出', priceCents: 990, credits: 1, days: null, description: '导出 1 次无水印 PDF' },
  { id: 'triple', name: '三份套餐', priceCents: 1990, credits: 3, days: null, description: '导出 3 次，平均 6.6 元/份' },
  { id: 'monthly', name: '月卡', priceCents: 2990, credits: 999, days: 30, description: '30 天内不限次导出 + AI 优化' },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}

export function formatPrice(cents: number): string {
  return `¥${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
