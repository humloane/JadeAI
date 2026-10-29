import Database from 'better-sqlite3';
const db = new Database('data/jade.db');

const plans = [
  ['single', '单份导出', 990, 1, null, '导出 1 次无水印 PDF', 1, 0],
  ['triple', '三份套餐', 1990, 3, null, '导出 3 次，平均 6.6 元/份', 1, 1],
  ['monthly', '月卡', 2990, 999, 30, '30 天内不限次导出 + AI 优化', 1, 2],
];
const insPlan = db.prepare(`insert into plans (id,name,price_cents,credits,days,description,enabled,sort_order)
  values (?,?,?,?,?,?,?,?) on conflict(id) do nothing`);
for (const p of plans) insPlan.run(...p);

const tpl = db.prepare(`insert into templates (id,name,enabled,sort_order,custom)
  values (?,?,?,?,?) on conflict(id) do nothing`);
const names = {
  classic:'经典', modern:'现代', minimal:'极简', professional:'专业', 'two-column':'双栏',
  creative:'创意', ats:'ATS', academic:'学术', elegant:'优雅', executive:'高管',
  developer:'开发者', designer:'设计师', startup:'创业', formal:'正式', infographic:'信息图',
  compact:'紧凑', euro:'欧式', clean:'清爽', bold:'醒目', timeline:'时间线',
  nordic:'北欧', corporate:'商务', consultant:'顾问', finance:'金融', medical:'医疗',
  gradient:'渐变', metro:'都市', material:'材质', coder:'代码', blocks:'块状',
  magazine:'杂志', artistic:'艺术', retro:'复古', neon:'霓虹', watercolor:'水彩',
  swiss:'瑞士', japanese:'日式', berlin:'柏林', luxe:'奢华', rose:'玫瑰',
  architect:'建筑', legal:'法律', teacher:'教师', scientist:'科研', engineer:'工程',
  sidebar:'侧栏', card:'卡片', zigzag:'折线', ribbon:'丝带', mosaic:'马赛克',
};
let i = 0;
for (const [id, name] of Object.entries(names)) { tpl.run(id, name, 1, i++, 0); }

const defaults = {
  site_name: '简历工坊',
  site_logo: '/logo.svg',
  icp: '',
  contact_wechat: '',
  free_exports: 0,
  watermark_text: '预览版 · 付费后可导出无水印',
  default_template: 'modern',
  default_language: 'zh',
  editor_sections: ['summary','work_experience','education','skills','projects'],
};
const insSet = db.prepare(`insert into site_settings (key,value) values (?,?) on conflict(key) do nothing`);
for (const [k, v] of Object.entries(defaults)) insSet.run(k, JSON.stringify(v));

console.log('plans:', db.prepare('select count(*) c from plans').get().c);
console.log('templates:', db.prepare('select count(*) c from templates').get().c);
console.log('settings:', db.prepare('select count(*) c from site_settings').get().c);
