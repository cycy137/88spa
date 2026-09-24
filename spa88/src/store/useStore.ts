// src/store/useStore.ts
import { create } from 'zustand';
import type { Appointment, ServiceItem, Staff } from '../type';

// ⚠️ 【替换这里】把下面这个地址改成你刚刚找到的真实 Cloudflare Worker 域名！
const API_BASE_URL = "https://88spa.cycy1357.workers.dev";

// 后台管理员口令：登录成功后保存在 sessionStorage，关闭标签页即失效
const ADMIN_TOKEN_KEY = "spa88_admin_token";
export const getAdminToken = (): string | null => sessionStorage.getItem(ADMIN_TOKEN_KEY);

const authHeaders = (): Record<string, string> => {
  const t = getAdminToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

interface StoreState {
  appointments: Appointment[];
  services: ServiceItem[];
  staffList: Staff[];
  loading: boolean;
  authRequired: boolean;

  // 核心操作方法
  fetchInitData: () => Promise<void>;
  verifyAdminToken: (token: string) => Promise<boolean>;
  logout: () => void;
  setAuthRequired: (v: boolean) => void;
  addAppointment: (appt: Omit<Appointment, 'id'>) => Promise<void>;
  updateAppointment: (id: number, data: Partial<Appointment>) => Promise<void>;
  deleteAppointment: (id: number, data: Partial<Appointment>) => Promise<void>;
}

export const useStore = create<StoreState>((set, get) => ({
  appointments: [],
  services: [],
  staffList: [],
  loading: false,
  authRequired: false,

  // 1. 初始化拉取云端 D1：走需要口令的管理接口
  //    （公开的 /api/init-data 已不再返回预约/员工数据，不要再调它）
  fetchInitData: async () => {
    const token = getAdminToken();
    if (!token) {
      set({ authRequired: true });
      return;
    }
    set({ loading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/init-data`, {
        headers: { ...authHeaders() },
      });
      if (res.status === 401) {
        // 口令不对或已被更换：清掉本地口令，弹回登录界面
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        set({ authRequired: true, appointments: [], services: [], staffList: [] });
        return;
      }
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
        appointments: parsedAppointments,
        authRequired: false,
      });
    } catch (err) {
      console.error("初始化数据失败:", err);
    } finally {
      set({ loading: false });
    }
  },

  // 登录：用输入的口令试调管理接口，成功才保存口令
  verifyAdminToken: async (token: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/init-data`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      set({ authRequired: false });
      await get().fetchInitData();
      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    set({ authRequired: true, appointments: [], services: [], staffList: [] });
  },

  setAuthRequired: (v: boolean) => set({ authRequired: v }),

  // 2. 往云端 D1 提交一条新预约或散客入账（公开预约接口，后台记账共用，无需口令）
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

  // 3. 在云端更新一笔账单（如补录小费或修改金额），需要管理员口令
  updateAppointment: async (id, data) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id, ...data })
      });
      if (res.status === 401) {
        set({ authRequired: true });
        throw new Error("口令失效，请重新登录");
      }
      if (res.ok) {
        // ✨【关键】确保这行代码存在，它会让所有正在看大列表的手机和电脑秒级刷出新状态
        await get().fetchInitData();
      } else {
        throw new Error("云端数据库拒接了此次更新");
      }
    } catch (err) {
      console.error("更新账目失败:", err);
    }
  },

  // 4. 从云端彻底删除一笔账目流水，需要管理员口令
  deleteAppointment: async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id })
      });
      if (res.status === 401) {
        set({ authRequired: true });
        throw new Error("口令失效，请重新登录");
      }
      if (res.ok) {
        await get().fetchInitData();
      }
    } catch (err) {
      console.error("删除账目失败:", err);
    }
  }
}));
