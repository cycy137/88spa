// src/pages/StatisticsView.tsx
import { useState } from 'react';
import { Card, Row, Col, Statistic, Table, DatePicker, Space, Radio } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useStore } from '../store/useStore';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

// 饼图专属高级财务配色
const COLORS = ['#52c41a', '#1890ff', '#722ed1'];

export default function StatisticsView() {
  // 时间筛选状态（默认看近30天的统计）
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(30, 'day'),
    dayjs()
  ]);

  // 显示口径：自己统计（实际金额）/ 员工发钱（项目费抹零到整十）
  const [mode, setMode] = useState<'actual' | 'payout'>('actual');

  // 从 Zustand Store 提取云端全量账目状态与加载器
  const appointments = useStore((state) => state.appointments);
  const loading = useStore((state) => state.loading);

  // 抹零：向下取整到十位（如 105→100）
  const floor10 = (n: number) => Math.floor(Number(n || 0) / 10) * 10;
  // 按当前口径取每条的项目费
  const effFee = (item: any) => mode === 'payout' ? floor10(item.serviceFee) : Number(item.serviceFee || 0);

  // 只筛选出云端账目里“已经完全对账结单”的完成流水（带有结单备注标记）
  const completedAppointments = appointments.filter(
    appt => appt.status === 'completed' && (appt.remark?.includes('[已对账结单]') || false)
  );

  // 根据选中的核算周期进行前端过滤
  const filteredData = completedAppointments.filter(item => {
    if (!dateRange) return true;
    const itemTime = dayjs(item.appointmentTime);
    const [startDate, endDate] = dateRange;
    return itemTime.valueOf() >= startDate.startOf('day').valueOf() && 
           itemTime.valueOf() <= endDate.endOf('day').valueOf();
  });

  // ==========================================
  // ⚡ 核心：全新多渠道独立资金核算逻辑
  // ==========================================
  let totalServiceFee = 0;   // 项目账面原价总额（按当前口径）
  let totalTip = 0;          // 实收小费总额
  let totalCash = 0;         // 实收现金总额
  let totalCard = 0;         // 实收刷卡总额
  let totalGiftCard = 0;     // 实收礼品卡总额
  let punchCardCount = 0;    // Punch Card 使用总次数
  let totalServiceNet = 0;   // 项目净收入（口径一致：抹零后减打折，供发钱模式用）

  const staffMap: Record<string, { staffName: string; serviceFee: number; tip: number; count: number }> = {};

  // 加项统计
  let addonHuangCount = 0, addonHuangTotal = 0;
  let addonBaguanCount = 0, addonBaguanTotal = 0;
  let addonCbdCount = 0, addonCbdTotal = 0;

  filteredData.forEach(item => {
    totalServiceFee += effFee(item);
    totalTip += item.tip;
    
    // 累加各个独立渠道的实收硬币/钞票
    totalCash += Number(item.payCash || 0);
    totalCard += Number(item.payCard || 0);
    totalGiftCard += Number(item.payGiftCard || 0);

    // 加项明细统计（加项本身是固定价，不抹零）
    if (item.addonHuangdaoyi) { addonHuangCount++; addonHuangTotal += Number(item.addonHuangdaoyi); }
    if (item.addonBaguan) { addonBaguanCount++; addonBaguanTotal += Number(item.addonBaguan); }
    if (item.addonCbd) { addonCbdCount++; addonCbdTotal += Number(item.addonCbd); }
    
    // 累计打卡打折次数 (SQLite 存的是 1 或 0)
    if (item.usePunchCard === 1) {
      punchCardCount += 1;
    }
    // 口径一致的项目净收入
    totalServiceNet += Math.max(0, effFee(item) - (item.usePunchCard === 1 ? 30 : 0));

    // 技师业绩提成树累加
    if (!staffMap[item.staffName]) {
      staffMap[item.staffName] = { staffName: item.staffName, serviceFee: 0, tip: 0, count: 0 };
    }
    // 技师项目费业绩以实收项目费（原价减去打折）计算更符合扣点规则
    // 员工发钱口径下先抹零到整十
    const discount = item.usePunchCard === 1 ? 30 : 0;
    const actualStaffServiceFee = Math.max(0, effFee(item) - discount);
    
    staffMap[item.staffName].serviceFee += actualStaffServiceFee;
    staffMap[item.staffName].tip += item.tip;
    staffMap[item.staffName].count += 1;
  });

  // 1. 实收纯项目总金额：自己统计用三大渠道之和；员工发钱用抹零口径的项目净收入
  const actualTotalServicePaid = totalCash + totalCard + totalGiftCard;
  const displayServiceTotal = mode === 'payout' ? totalServiceNet : actualTotalServicePaid;
  // 2. 真实总营业额 = 项目费总和 + 额外实收小费
  const netRevenue = displayServiceTotal + totalTip;
  // 3. 累计让利打折损失
  const totalDiscountGiven = punchCardCount * 30;

  // 格式化输出供 Recharts 柱状图使用 (技师排行榜)
  const staffChartData = Object.values(staffMap).sort((a, b) => b.tip - a.tip);

  // ✨ 组装全新的“三大支付渠道构成”饼图数据源
  const paymentMethodPieData = [
    { name: '💵 现金实收', value: totalCash },
    { name: '💳 刷卡进账', value: totalCard },
    { name: '🎁 礼品卡消耗', value: totalGiftCard },
  ].filter(item => item.value > 0); // 过滤掉销售额为0的渠道，防止饼图渲染空白

  // 技师核算表列头
  const staffColumns = [
    { title: '技师姓名/工号', dataIndex: 'staffName', key: 'staffName' },
    { title: '完成服务单数', dataIndex: 'count', key: 'count', sorter: (a: any, b: any) => a.count - b.count },
    { title: mode === 'payout' ? '实收项目业绩(已抹零+扣减打折)' : '实收项目业绩(扣减打折)', dataIndex: 'serviceFee', key: 'serviceFee', render: (val: number) => `${val.toFixed(2)} 元`, sorter: (a: any, b: any) => a.serviceFee - b.serviceFee },
    { title: '所获小费总额', dataIndex: 'tip', key: 'tip', render: (val: number) => `${val.toFixed(2)} 元`, style: { color: '#52c41a' }, sorter: (a: any, b: any) => a.tip - b.tip },
    { title: '员工总薪资参考(业绩+小费)', key: 'total', render: (record: any) => <b style={{ color: '#1890ff' }}>{(record.serviceFee + record.tip).toFixed(2)} 元</b> }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 顶部查账周期选择 + 显示口径切换 */}
      <Card size="small" style={{ borderRadius: '8px' }}>
        <Space align="center" wrap>
          <span style={{ fontWeight: 'bold', color: '#595959' }}>核算周期：</span>
          <RangePicker 
            value={dateRange} 
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            allowClear={false}
          />
          <span style={{ fontWeight: 'bold', color: '#595959', marginLeft: 16 }}>显示口径：</span>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { value: 'actual', label: '📊 自己统计' },
              { value: 'payout', label: '💰 员工发钱' },
            ]}
          />
        </Space>
        {mode === 'payout' && (
          <div style={{ marginTop: 8, color: '#8c8c8c', fontSize: '13px' }}>
            💰 员工发钱口径：每条项目费已向下抹零到整十（如 105→100）再扣减打卡优惠；小费与各实收渠道为实际金额。加项明细不参与抹零。
          </div>
        )}
      </Card>

      {/* 核心财务多功能看盘 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #1890ff', borderRadius: '4px' }}>
            <Statistic title="实收总营业额 (项目+小费)" loading={loading} value={netRevenue} precision={2} suffix="元" valueStyle={{ color: '#1890ff', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #52c41a', borderRadius: '4px' }}>
            <Statistic title="纯小费总收入" loading={loading} value={totalTip} precision={2} suffix="元" valueStyle={{ color: '#52c41a', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #fa8c16', borderRadius: '4px' }}>
            <Statistic title={mode === 'payout' ? "项目应发提成基数 (已抹零)" : "项目实收扣点总额"} loading={loading} value={displayServiceTotal} precision={2} suffix="元" valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={24} sm={6}>
          <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04)', borderLeft: '4px solid #ff4d4f', borderRadius: '4px' }}>
            <Statistic title="🎟️ 打卡卡券减免让利" loading={loading} value={totalDiscountGiven} precision={2} suffix={`元 (${punchCardCount}次)`} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
      </Row>

      {/* 多渠道资金拆分盘（收银台明细对照） */}
      <Card title="收银对账分流看板" size="small" style={{ borderRadius: '8px' }}>
        <Row style={{ textAlign: 'center' }}>
          <Col span={8}>
            <Statistic title="💵 现金抽屉实收" value={totalCash} precision={2} suffix="元" />
          </Col>
          <Col span={8} style={{ borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
            <Statistic title="💳 刷卡机/POS进账" value={totalCard} precision={2} suffix="元" valueStyle={{ color: '#13c2c2' }} />
          </Col>
          <Col span={8}>
            <Statistic title="🎁 礼品卡消耗扣减" value={totalGiftCard} precision={2} suffix="元" valueStyle={{ color: '#722ed1' }} />
          </Col>
        </Row>
      </Card>

      {/* 加项统计 */}
      <Card title="加项明细统计" size="small" style={{ borderRadius: '8px' }}>
        <Row style={{ textAlign: 'center' }}>
          <Col span={8}>
            <Statistic title="🌿 黄道益" value={addonHuangTotal} precision={2} suffix={`元 (${addonHuangCount}次)`} valueStyle={{ color: '#52c41a' }} />
          </Col>
          <Col span={8} style={{ borderLeft: '1px solid #f0f0f0', borderRight: '1px solid #f0f0f0' }}>
            <Statistic title="🏺 拔罐" value={addonBaguanTotal} precision={2} suffix={`元 (${addonBaguanCount}次)`} valueStyle={{ color: '#fa8c16' }} />
          </Col>
          <Col span={8}>
            <Statistic title="💧 CBD" value={addonCbdTotal} precision={2} suffix={`元 (${addonCbdCount}次)`} valueStyle={{ color: '#722ed1' }} />
          </Col>
        </Row>
      </Card>

      {/* 可视化分析图表组 */}
      <Row gutter={[16, 16]}>
        {/* 技师小费/项目费对比排行榜 */}
        <Col xs={24} lg={14}>
          <Card title="技师扣点业绩与小费风云榜" style={{ height: '420px', borderRadius: '8px' }}>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={staffChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="staffName" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(2)} 元`} />
                  <Legend />
                  <Bar dataKey="serviceFee" name="项目净提成业绩" fill="#1890ff" stackId="a" />
                  <Bar dataKey="tip" name="独立小费收入" fill="#52c41a" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>

        {/* 核心支付渠道构成比例饼图 */}
        <Col xs={24} lg={10}>
          <Card title="店内收银收款渠道构成占比" style={{ height: '420px', borderRadius: '8px' }}>
            <div style={{ width: '100%', height: 320, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              {paymentMethodPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentMethodPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => `${name}: ${(Number(percent || 0) * 100).toFixed(0)}%`}
                      outerRadius={90}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {paymentMethodPieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `${Number(value).toFixed(2)} 元`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <span style={{ color: '#bfbfbf' }}>当前周期内暂无组合支付入账数据</span>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 员工工资发放对账单 */}
      <Card title="员工月底工资/提成/小费精准核算单" style={{ borderRadius: '8px' }}>
        <div style={{ marginBottom: '12px', color: '#8c8c8c', fontSize: '13px' }}>
          💡 备注提示：此处的“项目业绩”已自动扣除了由 **Punch Card 产生的 30 元让利折扣**，方便您直接乘以店里的分成比例发工资，无需人工二次剔除。
        </div>
        <Table 
          loading={loading}
          columns={staffColumns} 
          dataSource={staffChartData} 
          rowKey="staffName" 
          pagination={false} 
          locale={{ emptyText: '当前核算周期内暂无经过对账结单的完成流水' }}
        />
      </Card>
    </Space>
  );
}
