#!/usr/bin/env node
/**
 * 人工确认订单已收款。
 * 用法: node scripts/confirm-order.mjs <订单号前缀>
 */
import Database from 'better-sqlite3';

const prefix = process.argv[2];
if (!prefix) {
  console.error('用法: node scripts/confirm-order.mjs <订单号前缀>');
  process.exit(1);
}

const db = new Database('data/jade.db');
const rows = db.prepare("select id, plan, amount_cents, status, user_id from orders where id like ?").all(`${prefix}%`);

if (rows.length === 0) {
  console.error('没有找到订单:', prefix);
  process.exit(1);
}
if (rows.length > 1) {
  console.error('前缀匹配到多张订单，请写长一点:');
  rows.forEach((r) => console.error(' ', r.id, r.plan, r.amount_cents, r.status));
  process.exit(1);
}

const order = rows[0];
db.prepare("update orders set status='paid', paid_at=unixepoch() where id=?").run(order.id);
console.log(`已确认收款: ${order.id}`);
console.log(`  套餐 ${order.plan} / ${(order.amount_cents / 100).toFixed(2)} 元 / 用户 ${order.user_id}`);
