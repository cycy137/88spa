// src/pages/CalendarView.tsx
import { useState } from 'react';
import { Calendar, Badge, Card, List, Button, Modal, Form, InputNumber, Tag, Space, message, Typography, Input, Select, TimePicker } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Appointment } from '../type';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;

export default function CalendarView() {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  
  // 两个弹窗的显示状态控制
  const [isTipModalOpen, setIsTipModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  const [currentAppt, setCurrentAppt] = useState<Appointment | null>(null);
  
  const [tipForm] = Form.useForm();
  const [createForm] = Form.useForm();

  // 1. 实时读取本地数据库中的所有核心数据
  const appointments = useLiveQuery(() => db.appointments.toArray()) || [];
  const staffList = useLiveQuery(() => db.staff.where('status').equals('active').toArray()) || [];
  const servicesList = useLiveQuery(() => db.services.toArray()) || [];

  // 获取特定日期的预约列表
  const getListData = (value: Dayjs) => {
    return appointments.filter((appt) =>
      dayjs(appt.appointmentTime).isSame(value, 'day')
    );
  };

  // 2. 渲染日历单元格中的小标签
  const dateCellRender = (value: Dayjs) => {
    const listData = getListData(value);
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {listData.map((item) => {
          let statusColor: 'processing' | 'success' | 'default' = 'processing';
          if (item.status === 'completed') statusColor = 'success';
          if (item.status === 'cancelled') statusColor = 'default';

          return (
            <li key={item.id} style={{ fontSize: '11px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <Badge 
                status={statusColor} 
                text={`${dayjs(item.appointmentTime).format('HH:mm')} [${item.staffName}]`} 
              />
            </li>
          );
        })}
      </ul>
    );
  };

  // 3. 当新建预约表单中，用户选择某个「项目」时，自动联动时长和标准价格
  const handleServiceChange = (serviceId: number) => {
    const selectedService = servicesList.find(s => s.id === serviceId);
    if (selectedService) {
      createForm.setFieldsValue({
        duration: selectedService.duration,
        serviceFee: selectedService.price,
      });
    }
  };

  // 4. 提交「新建预约」表单
  // 提交创建预约（已修复 toDate / undefined 报错问题）
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
    //   console.log(servicesList)
      const selectedService = servicesList.find(s => s.id === values.serviceId);
      const selectedStaff = staffList.find(s => s.id === values.staffId);

      if (!selectedService || !selectedStaff) {
        message.error('选中的项目或技师数据不存在');
        return;
      }

      // 【安全修复】防御性检查：确保时间组件确实拿到了值
      if (!values.timeString) {
        message.error('请选择具体的预约时间');
        return;
      }

      // values.timeString 本身就是一个 dayjs 对象
      const timeInstance = values.timeString;
      const hours = timeInstance.hour();
      const minutes = timeInstance.minute();

      // 基于当前日历选中的日期，设置对应的时和分
      const finalAppointmentTime = selectedDate
        .hour(hours)
        .minute(minutes)
        .second(0)
        .millisecond(0)
        .toDate(); // 转换为标准的 Date 对象存入数据库

      await db.appointments.add({
        customerName: values.customerName,
        customerPhone: values.customerPhone || '',
        staffId: values.staffId,
        staffName: selectedStaff.name,
        serviceId: values.serviceId,
        serviceName: selectedService.name,
        appointmentTime: finalAppointmentTime,
        duration: values.duration,
        serviceFee: values.serviceFee,
        tip: 0,
        status: 'booked',
        remark: values.remark || ''
      });

      message.success('预约创建成功！');
      setIsCreateModalOpen(false);
      createForm.resetFields();
    } catch (err) {
      console.error('表单验证或写入数据库失败:', err);
    }
  };


  // 5. 点击“结账/完成”按钮，弹出小费补录窗口
  const handleCompleteClick = (appt: Appointment) => {
    setCurrentAppt(appt);
    tipForm.setFieldsValue({ tip: 0 });
    setIsTipModalOpen(true);
  };

  // 6. 提交小费，更新数据库状态为 completed
  const handleTipSubmit = async () => {
    if (!currentAppt || !currentAppt.id) return;
    try {
      const values = await tipForm.validateFields();
      await db.appointments.update(currentAppt.id, {
        status: 'completed',
        tip: values.tip || 0
      });
      message.success('该笔预约已完成服务，账目已入账！');
      setIsTipModalOpen(false);
      setCurrentAppt(null);
    } catch (err) {
      console.error(err);
    }
  };

  // 7. 取消预约操作
  const handleCancelAppt = async (id: number) => {
    Modal.confirm({
      title: '确定要取消这笔预约吗？',
      content: '取消后此预约将不计入营业额统计。',
      okText: '确定取消',
      okType: 'danger',
      cancelText: '再想想',
      onOk: async () => {
        await db.appointments.update(id, { status: 'cancelled' });
        message.warning('预约已取消');
      }
    });
  };

  // 当天选中的详细列表数据
  const dayAppointments = getListData(selectedDate).sort((a, b) => 
    dayjs(a.appointmentTime).valueOf() - dayjs(b.appointmentTime).valueOf()
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* 顶部操作控制栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: '12px 24px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
        <div>
          当前选定日期：<Text strong style={{ fontSize: '16px', color: '#1890ff' }}>{selectedDate.format('YYYY-MM-DD')}</Text>
        </div>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={() => {
            // 点击新建时，默认把表单的时间设为当前日历选中的这一天
            createForm.setFieldsValue({ appointmentTime: selectedDate.hour(dayjs().hour()).minute(0) });
            setIsCreateModalOpen(true);
          }}
        >
          新建预约登记
        </Button>
      </div>

      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
        {/* 左侧：日历主看板 */}
        <Card style={{ flex: '1 1 60%', minWidth: '400px' }} title="预约日历" size="small">
          <Calendar 
            value={selectedDate} 
            onSelect={(value) => setSelectedDate(value)}
            cellRender={dateCellRender}
          />
        </Card>

        {/* 右侧：选中日期的具体预约时段与操作流转 */}
        <Card 
          style={{ flex: '1 1 35%', minWidth: '300px' }} 
          title={`${selectedDate.format('YYYY年MM月DD日')} 预约详情 (共 ${dayAppointments.length} 单)`}
        >
          <List
            itemLayout="horizontal"
            dataSource={dayAppointments}
            locale={{ emptyText: '当天暂无预约安排' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  item.status === 'booked' && (
                    <Button type="link" onClick={() => handleCompleteClick(item)}>
                      完成(结账)
                    </Button>
                  ),
                  item.status === 'booked' && (
                    <Button type="link" danger onClick={() => handleCancelAppt(item.id!)}>
                      取消
                    </Button>
                  )
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <b style={{ color: '#1890ff' }}>{dayjs(item.appointmentTime).format('HH:mm')}</b>
                      <span>{item.customerName}</span>
                      {item.status === 'booked' && <Tag color="blue">已预约</Tag>}
                      {item.status === 'completed' && <Tag color="green">已完成</Tag>}
                      {item.status === 'cancelled' && <Tag color="red">已取消</Tag>}
                    </Space>
                  }
                  description={
                    <div>
                      <p style={{ margin: '4px 0' }}>
                        技师：<Text code>{item.staffName}</Text> | 项目：<Text code>{item.serviceName}</Text> ({item.duration}分钟)
                      </p>
                      <p style={{ margin: 0, color: '#8c8c8c' }}>
                        项目费：{item.serviceFee} 元 
                        {item.status === 'completed' && ` | 小费：${item.tip} 元`}
                      </p>
                      {item.remark && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#fa8c16' }}>备注: {item.remark}</p>}
                    </div>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      </div>

            {/* ========================================================= */}
      {/* 弹窗 1：新建预约 */}
      {/* ========================================================= */}
      <Modal
        title={`新建预约 - ${selectedDate.format('YYYY年MM月DD日')}`}
        open={isCreateModalOpen}
        onOk={handleCreateSubmit}
        onCancel={() => setIsCreateModalOpen(false)}
        okText="确认创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" initialValues={{ duration: 60, serviceFee: 0 }}>
          <Form.Item
            label="顾客姓名/称呼"
            name="customerName"
            rules={[{ required: true, message: '请输入顾客姓名或称呼' }]}
          >
            <Input placeholder="例如：张先生 / 散客" />
          </Form.Item>

          <Form.Item
            label="预约具体时段"
            name="timeString"
            rules={[{ required: true, message: '请选择具体预约时间' }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="选择时间" />
          </Form.Item>

          <Form.Item
            label="选择服务项目"
            name="serviceId"
            rules={[{ required: true, message: '请选择服务项目' }]}
          >
            <Select 
              placeholder="选择项目" 
              onChange={handleServiceChange}
              options={servicesList.map(s => ({ value: s.id, label: `${s.name} (${s.price}元/${s.duration}分钟)` }))} 
              />
          </Form.Item>

          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item
              label="项目时长 (分钟)"
              name="duration"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              label="项目实际费用 (元)"
              name="serviceFee"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item
            label="指派服务技师"
            name="staffId"
            rules={[{ required: true, message: '请选择服务的技师' }]}
          >
            <Select 
              placeholder="选择技师" 
              options={staffList.filter(s => s.status === 'active').map(s => ({ value: s.id, label: s.name }))}
            />
          </Form.Item>

          <Form.Item label="备注信息" name="remark">
            <Input.TextArea placeholder="选填，如：客户要求手劲大、加钟等" rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ========================================================= */}
      {/* 弹窗 2：补录小费完成服务 */}
      {/* ========================================================= */}
      <Modal
        title="服务完成确认"
        open={isTipModalOpen}
        onOk={handleTipSubmit}
        onCancel={() => setIsTipModalOpen(false)}
        okText="确认结账"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={tipForm} layout="vertical">
          <div style={{ marginBottom: 16, backgroundColor: '#f6ffed', padding: '12px', borderRadius: '4px', border: '1px solid #b7eb8f' }}>
            <p style={{ margin: '0 0 4px 0' }}>关联项目: <b>{currentAppt?.serviceName}</b> (技师: {currentAppt?.staffName})</p>
            <p style={{ margin: 0 }}>应收项目费: <b style={{ color: '#52c41a', fontSize: '16px' }}>{currentAppt?.serviceFee} 元</b></p>
          </div>

          <Form.Item
            label="顾客最终给予的小费金额 (元)"
            name="tip"
            rules={[{ required: true, message: '请输入小费金额，若无小费请输入 0' }]}
          >
            <InputNumber 
              min={0} 
              style={{ width: '100%' }} 
              formatter={value => `${value}元`} 
              parser={(value:any) => value ? value.replace('元', '') : ''} 
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
