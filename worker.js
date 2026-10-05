// ============================================================================
// Cloudflare Worker —— 88spa 后端（2026-09-24 安全加固版）
//
//
// 1. GET /api/init-data 改为公开最小化接口：返回 services + themeConfig，
// 外加 staff 的公开字段（id/name/status，供官网预约选技师）。
// 不再返回 appointments（之前会把全部预约客户信息泄露给 C 端），
// 也不返回 staff.phone 等员工隐私字段。
// 2. 新增 GET /api/admin/init-data：后台管理专用，需要管理员口令，
// 返回 services + staff + appointments。
// 3. POST /api/appointments/update、POST /api/appointments/delete 改为需要
// 管理员口令（之前零鉴权，任何人可改/删账目）。
// 4. POST /api/appointments 保持公开（官网预约弹窗 + 后台散客记账共用），
// 但加了基础输入校验，挡掉空提交和明显乱刷。
//
//
// - D1 数据库绑定名必须为 MY_BINDING（保持和原来一致，不用改）。
// - 在 Worker 的 Settings → Variables and Secrets 里添加 Secret：
// Name = ADMIN_TOKEN
// Value = 一个强口令（建议 20 位以上随机字符），店员登录后台时输入。
// 或命令行：echo "你的强口令" | wrangler secret put ADMIN_TOKEN
//
// 先部署这个 Worker → 再合并后台前端 PR（88spa repo），顺序勿反。
// ============================================================================

export default {
async fetch(request, env) {
const corsHeaders = {
"Access-Control-Allow-Origin": "*",
"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
"Access-Control-Allow-Headers": "Content-Type, Authorization",
"Access-Control-Max-Age": "86400",
};

if (request.method === "OPTIONS") {
return new Response(null, {
status: 204,
headers: corsHeaders
});
}

const url = new URL(request.url);
const path = url.pathname;

// 统一 JSON 响应
const json = (data, status = 200) =>
new Response(JSON.stringify(data), {
status,
headers: {...corsHeaders, "Content-Type": "application/json"}
});

// D1 是否绑定
const db = () => {
if (!env.MY_BINDING) return null;
return env.MY_BINDING;
};
const dbOr500 = () => {
const d = db();
if (!d) {
return json({
error: "未检测到名为 MY_BINDING 的数据库，请确认绑定名是否拼写一致。"
}, 500);
}
return null;
};

// 后台鉴权：请求头 Authorization: Bearer <ADMIN_TOKEN>
const isAdmin = () => {
if (!env.ADMIN_TOKEN) return false;
const auth = request.headers.get("Authorization") || "";
return auth === `Bearer ${env.ADMIN_TOKEN}`;
};
const requireAdmin = () => {
if (!isAdmin()) {
return json({ error: "未授权：需要管理员口令"}, 401);
}
return null;
};

// 输入清洗：去首尾空格 + 长度上限，防止乱刷超长字段
const clean = (v, max) => {
const t = (v?? "").toString().trim();
return t.length > max? t.slice(0, max): t;
};

try {
// ==========================================
// 路由 A：公开初始化数据（官网 C 端用）
// 返回服务列表 + 换肤配置 + 技师公开信息（id/name/status，供预约选技师）
// 不含预约记录，不含员工电话等隐私字段
// ==========================================
if (path === "/api/init-data" && request.method === "GET") {
const err = dbOr500();
if (err) return err;

const services = await env.MY_BINDING.prepare("SELECT * FROM services").all();
// 只取公开字段：技师电话等隐私字段不对外
const staff = await env.MY_BINDING.prepare("SELECT id, name, status FROM staff").all();

return json({
services: services.results || [],
staff: staff.results || [],
// 🌟 预留给前端官网 useSeasonalTheme 机制的动态季度皮肤配置节点
themeConfig: {
currentTheme: "summer",
customBgColor: "#fbf9f6", // 明亮治愈奶白
customBgImage: "" // 预留给换季店内大图 URL
}
});
}

// ==========================================
// 路由 A2：后台管理初始化数据（需管理员口令）
// 返回服务 + 员工 + 全部预约流水
// ==========================================
if (path === "/api/admin/init-data" && request.method === "GET") {
const authErr = requireAdmin();
if (authErr) return authErr;
const err = dbOr500();
if (err) return err;

const services = await env.MY_BINDING.prepare("SELECT * FROM services").all();
const staff = await env.MY_BINDING.prepare("SELECT * FROM staff").all();
const appointments = await env.MY_BINDING.prepare("SELECT * FROM appointments").all();

return json({
services: services.results || [],
staff: staff.results || [],
appointments: appointments.results || [],
});
}

// ==========================================
// 路由 B：新建预约 / 散客记账（公开，官网弹窗与后台共用）
// 加了基础校验：缺少时间或服务信息直接 400 拒绝
// ==========================================
if (path === "/api/appointments" && request.method === "POST") {
const err = dbOr500();
if (err) return err;

const data = await request.json();

const appointmentTime = clean(data.appointmentTime, 40);
const serviceName = clean(data.serviceName, 100);
if (!appointmentTime || (!serviceName && data.serviceId == null)) {
return json({ error: "缺少必要的预约信息（时间/服务）"}, 400);
}

const customerName = clean(data.customerName, 50) || "Walk-in";
const customerPhone = clean(data.customerPhone, 30);
const customerEmail = clean(data.customerEmail, 100) || null;
const staffName = clean(data.staffName, 50) || "Auto Assign";
const remark = clean(data.remark, 500);
const notes = clean(data.notes, 500) || null;
const roomNumber = clean(data.roomNumber, 20) || null;

const {
staffId, serviceId, duration,
serviceFee, tip, status,
payCash, payCard, payGiftCard, usePunchCard,
addonHuangdaoyi, addonBaguan, addonCbd
} = data;

const info = await env.MY_BINDING.prepare(
`INSERT INTO appointments (
customerName, customerPhone, customerEmail, staffId, staffName,
serviceId, serviceName, appointmentTime, duration,
serviceFee, tip, status, remark, notes, roomNumber,
payCash, payCard, payGiftCard, usePunchCard,
addonHuangdaoyi, addonBaguan, addonCbd
) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
).bind(
customerName,
customerPhone,
customerEmail,
staffId || null,
staffName,
serviceId,
serviceName,
appointmentTime,
duration,
serviceFee, // 联动关键：前台如果是特价，传过来的就是特价金额，直接计入流水
tip || 0,
status || 'booked',
remark,
notes,
roomNumber,
payCash || 0,
payCard || 0,
payGiftCard || 0,
usePunchCard || 0,
addonHuangdaoyi || 0,
addonBaguan || 0,
addonCbd || 0
).run();

return json({ success: true, id: info.meta.last_row_id});
}

// ==========================================
// 路由 C：修改账目（需管理员口令）
// ==========================================
if (path === "/api/appointments/update" && request.method === "POST") {
const authErr = requireAdmin();
if (authErr) return authErr;
const err = dbOr500();
if (err) return err;

const data = await request.json();
const { id} = data;

if (!id) {
return json({ error: "缺少必要的订单 id"}, 400);
}

const fieldsToUpdate = [];
const queryValues = [];

const allowedFields = [
"customerName", "customerPhone", "customerEmail", "staffId", "staffName",
"serviceId", "serviceName", "appointmentTime", "duration",
"serviceFee", "tip", "status", "remark", "notes", "roomNumber",
"payCash", "payCard", "payGiftCard", "usePunchCard",
"addonHuangdaoyi", "addonBaguan", "addonCbd"
];

for (const field of allowedFields) {
if (data[field]!== undefined) {
fieldsToUpdate.push(`${field} =?`);
queryValues.push(data[field]);
}
}

if (fieldsToUpdate.length === 0) {
return json({ error: "没有提供任何需要更新的字段"}, 400);
}

queryValues.push(id);
const sqlQuery = `UPDATE appointments SET ${fieldsToUpdate.join(", ")} WHERE id =?`;

await env.MY_BINDING.prepare(sqlQuery).bind(...queryValues).run();

return json({ success: true});
}

// ==========================================
// 路由 D：删除账目（需管理员口令）
// ==========================================
if (path === "/api/appointments/delete" && request.method === "POST") {
const authErr = requireAdmin();
if (authErr) return authErr;
const err = dbOr500();
if (err) return err;

const { id} = await request.json();
if (!id) {
return json({ error: "缺少必要的订单 id"}, 400);
}
await env.MY_BINDING.prepare("DELETE FROM appointments WHERE id =?").bind(id).run();
return json({ success: true});
}

// /api/* 未命中：返回 404；其他路径交给前端静态资源（Workers Static Assets）
if (path.startsWith("/api/")) {
return json({ error: "API 路径未找到"}, 404);
}
// 前端页面：env.ASSETS 由 wrangler.toml 的 [assets] 提供
if (env.ASSETS) {
return env.ASSETS.fetch(request);
}
return json({ error: "API 路径未找到"}, 404);

} catch (error) {
return json({
error: "云端代码执行崩溃：" + error.message
}, 500);
}
}
};
