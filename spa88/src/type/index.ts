// src/types/index.ts

// 1. 服务项目定义
export interface ServiceItem {
  id?: number;          // 自增ID
  name: string;         // 项目名称 (如：全身精油、中式推拿)
  price: number;        // 标准价格 (元)
  duration: number;     // 标准时长 (分钟)
}

// 2. 技师/员工定义
export interface Staff {
  id?: number;          // 自增ID
  name: string;         // 技师名字/工号
  phone?: string;       // 选填：联系方式
  status: 'active' | 'inactive'; // 是否在职
}

// 3. 预约与账目核心定义 (一体化设计)
export interface Appointment {
  id?: number;          // 自增ID
  customerName: string; // 顾客姓名/称呼
  customerPhone?: string;// 选填：顾客电话
  
  // 关联信息
  staffId: number;      // 被预约技师ID
  staffName: string;    // 冗余存储技师名字，方便不查表直接展示
  serviceId: number;    // 预约项目ID
  serviceName: string;  // 冗余存储项目名称
  
  // 时间处理 (Dexie 支持直接存 Date 对象，或者存 ISO 字符串)
  appointmentTime: Date; // 预约的具体开始时间 (包含年月日、时分)
  duration: number;     // 实际做多久 (分钟，默认同步项目时长，但支持修改)
  
  // 费用统计
  serviceFee: number;   // 项目费用 (默认同步标准价，支持打折/手动修改)
  tip: number;          // 小费 (初期预约时为 0，服务完成后补录)
  
  // 状态流转
  // booked: 已预约未服务, completed: 服务完成(计入账目统计), cancelled: 已取消
  status: 'booked' | 'completed' | 'cancelled'; 
  
  remark?: string;      // 备注 (如：客户要求力道大一点、加钟等)
}
