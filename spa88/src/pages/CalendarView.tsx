// src/pages/CalendarView.tsx
import { useState } from 'react';
import { Calendar, Badge, Card, Button, Modal, Form, Input, InputNumber, Select, TimePicker, Tag, Space, message, Typography } from 'antd';
import { PlusOutlined, EditOutlined, CheckCircleOutlined, RollbackOutlined, CloseCircleOutlined, CalendarOutlined } from '@ant-design/icons';
import { useStore } from '../store/useStore';
import type { Appointment } from '../type';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;

export default function CalendarView() {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);

  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();

  // 从 Zustand Store 实时拉取云端数据
  const appointments = useStore((state) => state.appointments);
  const services = useStore((state) => state.services);
  const staffList = useStore((state) => state.staffList);
  const loading = useStore((state) => state.loading);

  const addAppointment = useStore((state) => state.addAppointment);
  const updateAppointment = useStore((state) => state.updateAppointment);

  // 纯前端：按天过滤预约
  const getListData = (value: Dayjs) => {
    return appointments.filter((appt) =>
      dayjs(appt.appointmentTime).isSame(value, 'day')
    );
  };

  // PC端专用：渲染大日历格子内部的小角标
  const dateCellRender = (value: Dayjs) => {
    const listData = getListData(value);
    return (
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {listData.map((item) => {
          let statusColor: 'processing' | 'success' | 'default' = 'processing';
          if (item.status === 'completed') statusColor = 'success';
          if (item.status === 'cancelled') statusColor = 'default';

          return (
            <li key={item.id || Math.random()} style={{ fontSize: '11px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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

  // 项目下拉框变动：自动联动时长与标准价格 (兼容新建和编辑表单)
  const handleServiceChange = (serviceId: number, formInstance: any) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      formInstance.setFieldsValue({
        duration: service.duration,
        serviceFee: service.price
      });
    }
  };

  // 【CRUD - C】提交新建客约到云端
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      const selectedService = services.find(s => s.id === values.serviceId);
      const selectedStaff = staffList.find(s => s.id === values.staffId);

      if (!selectedService || !selectedStaff || !values.timeString) {
        message.error('请填写完整的预约必填项');
        return;
      }

      const hours = values.timeString.hour();
      const minutes = values.timeString.minute();
      const finalAppointmentTime = selectedDate.hour(hours).minute(minutes).second(0).millisecond(0).toDate();

      await addAppointment({
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

      message.success('云端预约创建成功！');
      setIsCreateModalOpen(false);
      createForm.resetFields();
    } catch (err) { console.error(err); }
  };

  // 【CRUD - U】打开修改弹窗并回显数据
  const handleEditClick = (appt: Appointment) => {
    setEditingAppt(appt);
    editForm.setFieldsValue({
      customerName: appt.customerName,
      customerPhone: appt.customerPhone,
      timeString: dayjs(appt.appointmentTime),
      serviceId: appt.serviceId,
      duration: appt.duration,
      serviceFee: appt.serviceFee,
      staffId: appt.staffId,
      remark: appt.remark,
    });
    setIsEditModalOpen(true);
  };

  // 【CRUD - U】提交更新到云端
  const handleEditSubmit = async () => {
    if (!editingAppt || !editingAppt.id) return;
    try {
      const values = await editForm.validateFields();
      const selectedService = services.find(s => s.id === values.serviceId);
      const selectedStaff = staffList.find(s => s.id === values.staffId);

      if (!selectedService || !selectedStaff) return;

      const hours = values.timeString.hour();
      const minutes = values.timeString.minute();
      const finalAppointmentTime = dayjs(editingAppt.appointmentTime).hour(hours).minute(minutes).second(0).millisecond(0).toDate();

      await updateAppointment(editingAppt.id, {
        customerName: values.customerName,
        customerPhone: values.customerPhone || '',
        staffId: values.staffId,
        staffName: selectedStaff.name,
        serviceId: values.serviceId,
        serviceName: selectedService.name,
        appointmentTime: finalAppointmentTime.toISOString(),
        duration: values.duration,
        serviceFee: values.serviceFee,
        remark: values.remark || ''
      } as any);

      message.success('预约信息已成功更新！');
      setIsEditModalOpen(false);
      setEditingAppt(null);
    } catch (err) { console.error(err); }
  };

  // 【CRUD - U】纯服务状态切换：完成服务 / 撤回
  const handleStatusChange = async (id: number, newStatus: 'completed' | 'booked') => {
    await updateAppointment(id, { status: newStatus });
    message.success(newStatus === 'completed' ? '服务已完成！请移步流水页核算收钱。' : '状态已撤回到已预约');
  };

  // 【CRUD - D】取消客约
  const handleCancelAppt = async (id: number) => {
    Modal.confirm({
      title: '确定取消这笔预约吗？',
      onOk: async () => {
        await updateAppointment(id, { status: 'cancelled' });
        message.warning('预约已取消');
      }
    });
  };

  // 📱 手机端专用：生成在 iPhone 11/17 屏幕宽度下绝不拥挤的前后 7 天滑动星期线线
  const renderMobileStripe = () => {
    const days = [];
    for (let i = -3; i <= 3; i++) {
      days.push(dayjs().add(i, 'day'));
    }
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#fff', padding: '12px 6px', borderRadius: '8px', marginBottom: '16px', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
        {days.map((d) => {
          const isSelected = d.isSame(selectedDate, 'day');
          const isToday = d.isSame(dayjs(), 'day');
          return (
            <div 
              key={d.toString()}
              onClick={() => setSelectedDate(d)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                width: '13%',
                backgroundColor: isSelected ? '#1890ff' : 'transparent',
                color: isSelected ? '#fff' : isToday ? '#1890ff' : '#595959',
                border: isToday && !isSelected ? '1px solid #1890ff' : 'none',
                boxShadow: isSelected ? '0 4px 10px rgba(24,144,255,0.3)' : 'none'
              }}
            >
              <span style={{ fontSize: '11px', opacity: isSelected ? 0.9 : 0.6, marginBottom: '2px' }}>
                {d.format('dd')}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 'bold' }}>
                {d.format('DD')}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const dayAppointments = getListData(selectedDate).sort((a, b) => 
    dayjs(a.appointmentTime).valueOf() - dayjs(b.appointmentTime).valueOf()
  );

   return (
    <div className="calendar-container">
      {/* ⚡ 核心响应式样式注入：针对 iPhone 11 (375px) 和 iPhone 17 (393px) 窄屏进行特制重绘 */}
      <style>{`
        .calendar-container { display: flex; gap: 20px; flex-wrap: wrap; position: relative; width: 100%; }
        .pc-calendar-card { flex: 1 1 60%; min-width: 400px; display: block; }
        .mobile-stripe-box { display: none; width: 100%; }
        .detail-card { flex: 1 1 35%; min-width: 320px; border-radius: 8px; }
        .mobile-float-btn { display: none; position: fixed; bottom: 80px; right: 20px; z-index: 99; box-shadow: 0 4px 14px rgba(24,144,255,0.4); border-radius: 50px; height: 48px; font-weight: bold; }
        
        /* 📱 移动端断点：当屏幕宽度小于 768px（完美覆盖主流手机浏览器）时自动激活 */
        @media (max-width: 768px) {
          .pc-calendar-card { display: none !important; }
          .mobile-stripe-box { display: block !important; }
          .detail-card { flex: 1 1 100% !important; min-width: 100% !important; border: none !important; box-shadow: none !important; background: transparent !important; }
          .mobile-float-btn { display: flex !important; align-items: center; }
          .detail-card .ant-card-head { border-bottom: none !important; padding: 0 4px !important; }
          .detail-card .ant-card-body { padding: 4px 4px !important; }
        }
      `}</style>

      {/* 📱 手机端专用：周星轴滑动滑块 */}
      <div className="mobile-stripe-box">
        {renderMobileStripe()}
        <div style={{ padding: '0 4px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: '13px' }}><CalendarOutlined /> 正在查看以下特定时段排班：</Text>
          <Tag color="geekblue" style={{ fontSize: '12px', padding: '2px 8px', fontWeight: 'bold', borderRadius: '4px', margin: 0 }}>
            {selectedDate.format('YYYY年MM月DD日')}
          </Tag>
        </div>
      </div>

      {/* 💻 PC端专用：宏观大日历看板 */}
      <Card 
        loading={loading}
        className="pc-calendar-card"
        title="云端预约排班日历" 
        size="small"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsCreateModalOpen(true)}>新建预约</Button>}
      >
        <Calendar value={selectedDate} onSelect={(value) => setSelectedDate(value)} cellRender={dateCellRender} />
      </Card>

      {/* 📱💻 双端自适应：预约明细流卡片（重点照顾手机端防挤压排版） */}
      <Card 
        className="detail-card"
        title={<span style={{ fontSize: '16px', fontWeight: 'bold', color: '#262626' }}>本日排班时段 ({dayAppointments.length} 单)</span>}
      >
        {dayAppointments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#bfbfbf', backgroundColor: '#fff', borderRadius: '10px', border: '1px dashed #d9d9d9' }}>
            当天暂无任何客约安排
          </div>
        ) : (
          dayAppointments.map((item) => (
            <div 
              key={item.id || Math.random()} 
              style={{ 
                border: '1px solid #f0f0f0', 
                borderRadius: '10px', 
                padding: '14px', 
                marginBottom: '12px', 
                backgroundColor: item.status === 'completed' ? '#f6ffed' : '#ffffff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.01)', 
                position: 'relative',
                transition: 'all 0.3s'
              }}
            >
              {/* 卡片头部：时间、顾客称呼和核心状态 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Space size="middle">
                  <b style={{ color: '#1890ff', fontSize: '18px', fontFamily: 'monospace' }}>
                    {dayjs(item.appointmentTime).format('HH:mm')}
                  </b>
                  <span style={{ fontWeight: 'bold', color: '#262626', fontSize: '14px' }}>
                    顾客: {item.customerName}
                  </span>
                </Space>
                <div>
                  {item.status === 'booked' && <Tag color="blue" style={{ borderRadius: '3px', margin: 0 }}>已预约</Tag>}
                  {item.status === 'completed' && <Tag color="green" style={{ borderRadius: '3px', margin: 0 }}>服务已完成</Tag>}
                  {item.status === 'cancelled' && <Tag color="red" style={{ borderRadius: '3px', margin: 0 }}>已取消</Tag>}
                </div>
              </div>

              {/* 卡片中段：服务内容、技师与项目费（使用轻量卡片包装，不发生文字上下掉行） */}
              <div style={{ backgroundColor: '#fafafa', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', color: '#595959' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                  <span>指派技师: <Text strong>{item.staffName}</Text></span>
                  <span>项目: <Text strong>{item.serviceName}</Text></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: '4px', marginTop: '4px' }}>
                  <span>标准时长: {item.duration}分钟</span>
                  <span>预期费用: <span style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: '14px' }}>{item.serviceFee} 元</span></span>
                </div>
              </div>

              {/* 备注栏 */}
              {item.remark && (
                <div style={{ fontSize: '12px', color: '#fa8c16', backgroundColor: '#fffbe6', padding: '6px 10px', borderRadius: '6px', marginTop: '10px', border: '1px solid #ffe58f' }}>
                  📌 备注: {item.remark}
                </div>
              )}

              {/* 底部按钮区：针对大拇指触控优化的微型独立胶囊操作块 */}
              <div style={{ display: 'flex', justifyContent: 'end', marginTop: '12px', gap: '8px', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
                {item.status === 'booked' && (
                  <Button type="text" size="small" style={{ backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '12px', color: '#595959' }} icon={<EditOutlined />} onClick={() => handleEditClick(item)}>
                    修改
                  </Button>
                )}
                {item.status === 'booked' && (
                  <Button type="primary" size="small" style={{ backgroundColor: '#52c41a', borderColor: '#52c41a', borderRadius: '4px', fontSize: '12px' }} icon={<CheckCircleOutlined />} onClick={() => handleStatusChange(item.id!, 'completed')}>
                    做完点它
                  </Button>
                )}
                {item.status === 'completed' && (
                  <Button size="small" danger ghost style={{ borderRadius: '4px', fontSize: '12px' }} icon={<RollbackOutlined />} onClick={() => handleStatusChange(item.id!, 'booked')}>
                    点错撤回
                  </Button>
                )}
                {item.status === 'booked' && (
                  <Button size="small" danger ghost style={{ borderRadius: '4px', fontSize: '12px' }} icon={<CloseCircleOutlined />} onClick={() => handleCancelAppt(item.id!)}>
                    取消
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </Card>

      {/* 📱 手机端常驻悬浮“快速新增客约”大药丸按钮 (单手握持黄金触控热区) */}
      <Button type="primary" size="large" icon={<PlusOutlined />} className="mobile-float-btn" onClick={() => setIsCreateModalOpen(true)}>
        快速新增客约
      </Button>

      {/* 弹窗 1：新建预约 */}
      <Modal 
        title={`新建云端预约 - ${selectedDate.format('YYYY-MM-DD')}`} 
        open={isCreateModalOpen} 
        onOk={handleCreateSubmit} 
        onCancel={() => setIsCreateModalOpen(false)} 
        okText="确认创建" 
        cancelText="取消" 
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" initialValues={{ duration: 60, serviceFee: 0 }}>
          <Form.Item label="顾客姓名/称呼" name="customerName" rules={[{ required: true, message: '请输入顾客姓名' }]}>
            <Input placeholder="张先生" />
          </Form.Item>
          <Form.Item label="预约具体时段" name="timeString" rules={[{ required: true, message: '请选择时间' }]}>
            <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder="选择时间" />
          </Form.Item>
          <Form.Item label="选择服务项目" name="serviceId" rules={[{ required: true, message: '请选择项目' }]}>
            <Select placeholder="选择项目" style={{ width: '100%' }} onChange={(val) => handleServiceChange(val, createForm)} options={services.map(s => ({ value: s.id, label: `${s.name} (${s.price}元)` }))} />
          </Form.Item>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item label="项目时长 (分钟)" name="duration" style={{ flex: 1 }}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="预期费用 (元)" name="serviceFee" style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item label="指派服务技师" name="staffId" rules={[{ required: true, message: '请选择技师' }]}>
            <Select placeholder="选择技师" style={{ width: '100%' }} options={staffList.filter(s => s.status === 'active').map(s => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item label="预约备注" name="remark"><Input.TextArea rows={2} placeholder="给技师的特别交代..." /></Form.Item>
        </Form>
      </Modal>

      {/* 弹窗 2：修改预约 */}
      <Modal 
        title="修改云端预约信息" 
        open={isEditModalOpen} 
        onOk={handleEditSubmit} 
        onCancel={() => { setIsEditModalOpen(false); setEditingAppt(null); }} 
        okText="保存修改" 
        cancelText="取消" 
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="顾客姓名/称呼" name="customerName" rules={[{ required: true, message: '请输入顾客姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="修改预约时间" name="timeString" rules={[{ required: true, message: '请选择时间' }]}>
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="变更服务项目" name="serviceId" rules={[{ required: true, message: '请选择项目' }]}>
            <Select style={{ width: '100%' }} onChange={(val) => handleServiceChange(val, editForm)} options={services.map(s => ({ value: s.id, label: `${s.name} (${s.price}元)` }))} />
          </Form.Item>
          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item label="调整时长 (分钟)" name="duration" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="调整费用 (元)" name="serviceFee" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item label="重指派技师" name="staffId" rules={[{ required: true, message: '请选择技师' }]}>
            <Select style={{ width: '100%' }} options={staffList.filter(s => s.status === 'active').map(s => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item label="预约备注" name="remark"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}