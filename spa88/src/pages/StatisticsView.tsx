// src/pages/StatisticsView.tsx
import { useState } from 'react';
import { Card, Row, Col, Statistic, Table, DatePicker, Space } from 'antd';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import dayjs from 'dayjs';
import { useStore } from '../store/useStore';

const { RangePicker } = DatePicker;

// 饼图基础色盘
const COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2'];

export default function StatisticsView() {
  // 时间筛选状态（默认看近30天的统计）
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().subtract(30, 'day'),
    dayjs()
  ]);

  const appointments = useStore((state) => state.appointments);
  const loading = useStore((state) => state.loading);

  // 只筛选出云端账目里“已经服务完成并入账”的单子
  const completedAppointments = appointments.filter(appt => appt.status === 'completed');


  // ==========================================
  // 2. 根据日期筛选核心账目流水
  // ==========================================
const filteredData = appointments.filter(item => {
  if (!dateRange || !dateRange[0] || !dateRange[1]) return true;
  const itemTime = dayjs(item.appointmentTime);
  
  // ✨ 正确做法：先把数组里的开始时间和结束时间解构出来
  const [startDate, endDate] = dateRange;
  
  const start = startDate.startOf('day');
  const end = endDate.endOf('day');
  
  return itemTime.valueOf() >= start.valueOf() && itemTime.valueOf() <= end.valueOf();
});

  // ==========================================
  // 3. 多维度数据纯前端聚合计算逻辑
  // ==========================================
  let totalServiceFee = 0; // 总项目费
  let totalTip = 0;        // 总小费

  // 用来存储各个技师的数据统计
  const staffMap: Record<string, { staffName: string; serviceFee: number; tip: number; count: number }> = {};
  // 用来存储各个项目的数据统计
  const serviceMap: Record<string, { serviceName: string; value: number; count: number }> = {};

  filteredData.forEach(item => {
    totalServiceFee += item.serviceFee;
    totalTip += item.tip;

    // 技师业绩累加
    if (!staffMap[item.staffName]) {
      staffMap[item.staffName] = { staffName: item.staffName, serviceFee: 0, tip: 0, count: 0 };
    }
    staffMap[item.staffName].serviceFee += item.serviceFee;
    staffMap[item.staffName].tip += item.tip;
    staffMap[item.staffName].count += 1;

    // 项目销量累加
    if (!serviceMap[item.serviceName]) {
      serviceMap[item.serviceName] = { serviceName: item.serviceName, value: 0, count: 0 };
    }
    serviceMap[item.serviceName].value += item.serviceFee;
    serviceMap[item.serviceName].count += 1;
  });

  const totalRevenue = totalServiceFee + totalTip; // 总营业额

  // 格式化输出供 Recharts 图表使用
  const staffChartData = Object.values(staffMap).sort((a, b) => b.tip - a.tip); // 按小费高低排序
  const serviceChartData = Object.values(serviceMap);

  // 技师报表表格列头配置
  const staffColumns = [
    { title: '技师姓名/工号', dataIndex: 'staffName', key: 'staffName' },
    { title: '服务单数', dataIndex: 'count', key: 'count', sorter: (a: any, b: any) => a.count - b.count },
    { title: '项目费总额', dataIndex: 'serviceFee', key: 'serviceFee', render: (val: number) => `${val} 元`, sorter: (a: any, b: any) => a.serviceFee - b.serviceFee },
    { title: '小费总额', dataIndex: 'tip', key: 'tip', render: (val: number) => `${val} 元`, style: { color: '#52c41a' }, sorter: (a: any, b: any) => a.tip - b.tip },
    { title: '总业绩贡献', key: 'total', render: (record: any) => <b style={{ color: '#1890ff' }}>{record.serviceFee + record.tip} 元</b> }
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* 顶部查账时间选择栏 */}
      <Card size="small">
        <Space flex-wrap="wrap" align="center">
          <span style={{ fontWeight: 'bold' }}>选择查账核算周期：</span>
          <RangePicker 
            value={dateRange} 
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}
            allowClear={false}
          />
        </Space>
      </Card>

      {/* 核心财务核心指标核心看版 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic title="总营业额 (包含项目+小费)" value={totalRevenue} precision={2} suffix="元" valueStyle={{ color: '#1890ff', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic title="纯项目收费总额" value={totalServiceFee} precision={2} suffix="元" valueStyle={{ color: '#fa8c16' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <Statistic title="纯小费总收入" value={totalTip} precision={2} suffix="元" valueStyle={{ color: '#52c41a', fontWeight: 'bold' }} />
          </Card>
        </Col>
      </Row>

      {/* 核心可视化分析图表组 */}
      <Row gutter={[16, 16]}>
        {/* 技师小费/项目费对比排行榜 */}
        <Col xs={24} lg={14}>
          <Card title="技师业绩与小费排行榜 (Recharts 柱状图分析)" style={{ height: '420px' }}>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <BarChart data={staffChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="staffName" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value} 元`} />
                  <Legend />
                  <Bar dataKey="serviceFee" name="项目费业绩" fill="#1890ff" stackId="a" />
                  <Bar dataKey="tip" name="小费收入" fill="#52c41a" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>

        {/* 热门服务项目销售额构成 */}
        <Col xs={24} lg={10}>
          <Card title="服务项目销售额构成占比 (饼图分析)" style={{ height: '420px' }}>
            <div style={{ width: '100%', height: 320, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={serviceChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }) => `${name}: ${(Number(percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                    nameKey="serviceName"
                  >
                    {serviceChartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value} 元`} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 底层技师具体账目对账单明细表 */}
      <Card title="员工月底工资/提成/小费对账单">
        <Table 
          columns={staffColumns} 
          dataSource={staffChartData} 
          rowKey="staffName" 
          pagination={false} 
          locale={{ emptyText: '当前筛选周期内暂无已完成的账目流水' }}
        />
      </Card>
    </Space>
  );
}
