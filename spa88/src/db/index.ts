// src/db/index.ts
import Dexie, { type Table } from 'dexie';
import type { ServiceItem, Staff, Appointment } from '../type';

class MassageStoreDatabase extends Dexie {
  // 定义表和对应的类型
  services!: Table<ServiceItem, number>;
  staff!: Table<Staff, number>;
  appointments!: Table<Appointment, number>;

  constructor() {
    super('MassageStoreDB'); // 浏览器本地数据库名称
    
    // 关键步骤：定义表结构和索引字段 (这里只列出需要作为查询条件的字段)
    // 带有 ++ 的代表自增主键，其他字段代表为其建立索引
    this.version(1).stores({
      services: '++id, name',
      staff: '++id, name, status',
      // 预约表我们需要经常按时间、技师、状态来查账，所以这些字段都要加索引
      appointments: '++id, appointmentTime, staffId, status, customerName'
    });
  }
}

// 实例化并导出
export const db = new MassageStoreDatabase();
