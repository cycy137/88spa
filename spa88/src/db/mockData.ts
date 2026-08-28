// src/db/mockData.ts
import { db } from './index';

export async function initMockDataIfEmpty() {
  // 1. 检查如果项目表为空，写入初始项目
  const serviceCount = await db.services.count();
  if (serviceCount === 0) {
    await db.services.bulkAdd([
      { name: '中式指压推拿', price: 128, duration: 60 },
      { name: '泰式全身精油 SPA', price: 258, duration: 90 },
      { name: '传统足疗足浴', price: 88, duration: 45 },
      { name: '采耳与头部放松', price: 68, duration: 30 },
    ]);
  }

  // 2. 检查如果技师表为空，写入初始技师
  const staffCount = await db.staff.count();
  if (staffCount === 0) {
    await db.staff.bulkAdd([
      { name: '88号-阿珍', status: 'active' },
      { name: '99号-阿强', status: 'active' },
      { name: '06号-莉莉', status: 'active' },
    ]);
  }
}
