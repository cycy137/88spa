// src/pages/LedgerView.tsx
import React, { useState } from 'react';
import { Table, Card, Button, Space, Input, Select, DatePicker, Tag, Modal, Form, InputNumber, message, Popconfirm } from 'antd';
import { DownloadOutlined, UploadOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import type { Appointment } from '../type';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

export default function LedgerView() {
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  
  // 各种状态控制
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Appointment | null>(null);

  // 纯前端筛选条件状态
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 实时读取本地数据库所有的基础表和流水表
  const appointments = useLiveQuery(() => db.appointments.toArray()) || [];
  const services = useLiveQuery(() => db.services.toArray()) || [];
  const staffList = useLiveQuery(() => db.staff.toArray()) || [];
  // ==========================================
  // 1. 纯前端高级多条件过滤逻辑
  // ==========================================
  const filteredData = appointments.filter(item => {
    // 姓名/备注检索
    const matchText = item.customerName.toLowerCase().includes(searchText.toLowerCase()) || 
                      (item.remark && item.remark.toLowerCase().includes(searchText.toLowerCase()));
    
    // 状态过滤
    const matchStatus = statusFilter === 'all' ? true : item.status === statusFilter;
    
    // 时间范围过滤
    let matchDate = true;
    if (dateRange && dateRange[0] && dateRange[1]) {
      const itemTime = dayjs(item.appointmentTime);
      const start = dateRange[0].startOf('day');
      const end = dateRange[1].endOf('day');
      // isSameOrAfter / isSameOrBefore 需要等值判断，我们直接用毫秒值判断最安全
      matchDate = itemTime.valueOf() >= start.valueOf() && itemTime.valueOf() <= end.valueOf();
    }

    return matchText && matchStatus && matchDate;
  }).sort((a, b) => dayjs(b.appointmentTime).valueOf() - a.appointmentTime.valueOf()); // 按时间倒序

  // ==========================================
  // 2. 散客直接记账逻辑（跳过预约，直接完成）
  // ==========================================
  const handleServiceChange = (serviceId: number) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      form.setFieldsValue({ duration: service.duration, serviceFee: service.price });
    }
  };

  const handleQuickAddSubmit = async () => {
    try {
      const values = await form.validateFields();
      const selectedService = services.find(s => s.id === values.serviceId);
      const selectedStaff = staffList.find(s => s.id === values.staffId);

      if (!selectedService || !selectedStaff) return;

      await db.appointments.add({
        customerName: values.customerName || '散客',
        staffId: values.staffId,
        staffName: selectedStaff.name,
        serviceId: values.serviceId,
        serviceName: selectedService.name,
        appointmentTime: new Date(), // 直接记当下的时间
        duration: values.duration,
        serviceFee: values.serviceFee,
        tip: values.tip || 0,
        status: 'completed', // 直接是完成入账状态
        remark: values.remark || '散客直接现付'
      });

      message.success('散客现付账目已成功入账！');
      setIsQuickAddOpen(false);
      form.resetFields();
    } catch (err) {
      console.error(err);
    }
  };

  // ==========================================
  // 3. 修改和删除账目逻辑
  // ==========================================
  const handleEditClick = (record: Appointment) => {
    setEditingRecord(record);
    editForm.setFieldsValue({
      serviceFee: record.serviceFee,
      tip: record.tip,
      remark: record.remark
    });
    setIsEditOpen(true);
  };

  const handleEditSubmit = async () => {
    if (!editingRecord || !editingRecord.id) return;
    try {
      const values = await editForm.validateFields();
      await db.appointments.update(editingRecord.id, {
        serviceFee: values.serviceFee,
        tip: values.tip,
        remark: values.remark
      });
      message.success('账目信息已成功更新');
      setIsEditOpen(false);
      setEditingRecord(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    await db.appointments.delete(id);
    message.success('该账目已被彻底删除');
  };

  // ==========================================
  // 4. 数据一键备份与恢复 (JSON 文件导出/导入)
  // ==========================================
  const exportBackupJson = async () => {
    try {
      const allAppointments = await db.appointments.toArray();
      const allServices = await db.services.toArray();
      const allStaff = await db.staff.toArray();

      const backupData = {
        version: 1,
        exportAt: new Date().toISOString(),
        data: { appointments: allAppointments, services: allServices, staff: allStaff }
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `massage_store_backup_${dayjs().format('YYYYMMDD')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('备份导出成功！请妥善保存下载的 JSON 文件。');
    } catch (err) {
      message.error('导出备份失败');
    }
  };

  const importBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.data || !json.data.appointments) {
          message.error('错误的备份文件格式');
          return;
        }

        Modal.confirm({
          title: '重要提示：确定导入备份吗？',
          content: '导入备份会覆盖本地浏览器当前的全部数据，此操作不可逆！',
          okText: '确认导入并覆盖',
          okType: 'danger',
          onOk: async () => {
            await db.appointments.clear();
            await db.services.clear();
            await db.staff.clear();

            // 将恢复的日期字符串转回 Date 对象
            const parsedAppts = json.data.appointments.map((a: any) => ({
              ...a,
              appointmentTime: new Date(a.appointmentTime)
            }));

            await db.appointments.bulkAdd(parsedAppts);
            await db.services.bulkAdd(json.data.services || []);
            await db.staff.bulkAdd(json.data.staff || []);

            message.success('本地数据全部恢复成功，页面已同步刷新！');
            // 清空上传控件
            e.target.value = '';
          }
        });
      } catch (err) {
        message.error('解析备份文件失败，请确保文件未损坏。');
      }
    };
    reader.readAsText(file);
  };

  // Antd 表格列头定义
  const columns = [
    {
      title: '服务时间',
      dataIndex: 'appointmentTime',
      key: 'appointmentTime',
      render: (t: Date) => dayjs(t).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '顾客',
      dataIndex: 'customerName',
      key: 'customerName',
    },
    {
      title: '服务技师',
      dataIndex: 'staffName',
      key: 'staffName',
    },
    {
      title: '服务项目',
      dataIndex: 'serviceName',
      key: 'serviceName',
    },
    {
      title: '应收项目费',
      dataIndex: 'serviceFee',
      key: 'serviceFee',
      render: (fee: number) => <span style={{ fontWeight: 'bold' }}>{fee} 元</span>,
    },
    {
      title: '顾客小费',
      dataIndex: 'tip',
      key: 'tip',
      render: (tip: number) => <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{tip > 0 ? `+${tip} 元` : '0 元'}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'booked') return <Tag color="blue">已预约未服务</Tag>;
        if (status === 'completed') return <Tag color="green">服务完成入账</Tag>;
        return <Tag color="red">已取消</Tag>;
      }
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Appointment) => (
        <Space size="middle">
          <Button type="link" size="small" onClick={() => handleEditClick(record)}>修改</Button>
          <Popconfirm
            title="确定要彻底删除该笔流水吗？"
            description="删除后无法恢复，且会扣减对应的流水与小费统计。"
            onConfirm={() => handleDelete(record.id!)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card 
      title="记账与流水明细" 
      extra={
        <Space flex-wrap="wrap">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsQuickAddOpen(true)}>散客直接现付记账</Button>
          <Button icon={<DownloadOutlined />} onClick={exportBackupJson}>导出JSON备份</Button>
          <Button icon={<UploadOutlined />} style={{ position: 'relative' }}>
            导入备份恢复
            <input 
              type="file" 
              accept=".json" 
              onChange={importBackupJson} 
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} 
            />
          </Button>
        </Space>
      }
    >
      {/* 顶部纯前端高级筛选过滤器工具栏 */}
      <div style={{ marginBottom: 20, display: 'flex', gap: '16px', flexWrap: 'wrap', backgroundColor: '#fafafa', padding: '16px', borderRadius: '6px' }}>
        <Input 
          placeholder="搜索 顾客姓名 / 备注" 
          value={searchText} 
          onChange={e => setSearchText(e.target.value)} 
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          style={{ width: 220 }}
        />
        
        <Select 
          value={statusFilter} 
          onChange={setStatusFilter} 
          style={{ width: 160 }}
          options={[{ value: 'all', label: '全部状态' },{ value: 'booked', label: '仅看已预约' },
          { value: 'completed', label: '仅看已完成入账' },
          { value: 'cancelled', label: '仅看已取消' }]}
         />

        <RangePicker onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}placeholder={['流水开始日期', '结束日期']}/>
            {/* 数据明细大表格 */}
      <Table 
        columns={columns} 
        dataSource={filteredData} 
        rowKey="id"
        pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条明细` }}
      />

        {/* 弹窗 A：散客记账 */}
        <Modal
            title="散客直接现付记账"
            open={isQuickAddOpen}
            onOk={handleQuickAddSubmit}
            onCancel={() => setIsQuickAddOpen(false)}
            okText="确认入账"
            cancelText="取消"
            destroyOnClose
        >
            <Form form={form} layout="vertical" initialValues={{ duration: 60, serviceFee: 0, tip: 0, customerName: '散客' }}>
            <Form.Item label="顾客称呼" name="customerName">
                <Input placeholder="散客" />
            </Form.Item>
            <Form.Item label="选择服务项目" name="serviceId" rules={[{ required: true, message: '请选择服务项目' }]}>
                <Select 
                placeholder="选择项目" 
                onChange={handleServiceChange}
                options={services.map(s => ({ value: s.id, label: `${s.name} (${s.price}元)` }))}
                />
            </Form.Item>
            <div style={{ display: 'flex', gap: '16px' }}>
                <Form.Item label="项目时长 (分钟)" name="duration" style={{ flex: 1 }}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
                <Form.Item label="实收项目费 (元)" name="serviceFee" style={{ flex: 1 }}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            </div>
            <Form.Item label="指派服务技师" name="staffId" rules={[{ required: true, message: '请指定服务的技师' }]}>
                <Select placeholder="选择技师" options={staffList.filter(s => s.status === 'active').map(s => ({ value: s.id, label: s.name }))} />
            </Form.Item>
            <Form.Item label="当时给的小费金额 (元)" name="tip"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
            <Form.Item label="账目备注" name="remark"><Input placeholder="选填" /></Form.Item>
            </Form>
        </Modal>

        {/* 弹窗 B：修改流水明细 */}
        <Modal
            title="修改账目流水明细"
            open={isEditOpen}
            onOk={handleEditSubmit}
            onCancel={() => { setIsEditOpen(false); setEditingRecord(null); }}
            okText="确认修改"
            cancelText="取消"
            destroyOnClose
        >
            <Form form={editForm} layout="vertical"> 
            <Form.Item label="修正项目费 (元)" name="serviceFee" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="修正小费 (元)" name="tip" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="修改备注" name="remark">
                <Input />
            </Form.Item>
            </Form>
            </Modal>
        </div>
    </Card>
     );
}
