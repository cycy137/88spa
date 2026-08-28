// src/store/useStore.ts
import { create } from 'zustand';
import type { Appointment, ServiceItem, Staff } from '../type';

// ⚠️ 【替换这里】把下面这个地址改成你刚刚找到的真实 Cloudflare Worker 域名！
const API_BASE_URL = "https://88spa.cycy1357.workers.dev";

interface StoreState {
  appointments: Appointment[];
  services: ServiceItem[];
  staffList: Staff[];
  loading: boolean;
  
  // 核心操作方法
  fetchInitData: () => Promise<void>;
  addAppointment: (appt: Omit<Appointment, 'id'>) => Promise<void>;
  updateAppointment: (id: number, data: Partial<Appointment>) => Promise<void>;
  deleteAppointment: (id: number) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  appointments: [],
  services: [],
  staffList: [],
  loading: false,

  // 1. 初始化拉取云端 D1 数据库的所有项目、技师和流水的最新状态
  fetchInitData: async () => {
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/api/init-data`);
      if (!res.ok) throw new Error("云端数据拉取失败");
      const json = await res.json();
      
      // 注意：SQLite 存的时间是字符串，前端需要映射转换回 Date 对象或 Dayjs 兼容格式
      const parsedAppointments = (json.appointments || []).map((a: any) => ({
        ...a,
        appointmentTime: new Date(a.appointmentTime)
      }));

      set({ 
        services: json.services || [], 
        staffList: json.staff || [], 
        appointments: parsedAppointments 
      });
    } catch (err) {
      console.error("初始化数据失败:", err);
    } finally {
      set({ loading: false });
    }
  },

  // 2. 往云端 D1 提交一条新预约或散客入账
  addAppointment: async (appt) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...appt,
          // 将 Date 对象序列化为标准的 ISO 字符串存入 SQLite
          appointmentTime: appt.appointmentTime.toISOString()
        })
      });
      if (res.ok) {
        // 创建成功后重新刷一次全局状态，让所有手机和电脑的数据保持绝对同步
        await get().fetchInitData();
      }
    } catch (err) {
      console.error("提交预约失败:", err);
    }
  },

  // 3. 在云端更新一笔账单（如补录小费或修改金额）
  updateAppointment: async (id, data) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data })
      });
      if (res.ok) {
        await get().fetchInitData();
      }
    } catch (err) {
      console.error("更新账目失败:", err);
    }
  },

  // 4. 从云端彻底删除一笔账目流水
  deleteAppointment: async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        await get().fetchInitData();
      }
    } catch (err) {
      console.error("删除账目失败:", err);
    }
  }
}));
