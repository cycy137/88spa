// src/pages/LedgerView.tsx
import { useState } from 'react';
import { Table, Card, Button, Space, Input, Select, DatePicker, Tag, Modal, Form, InputNumber, message, Popconfirm, Typography, Row, Col } from 'antd';
import { SearchOutlined, PlusOutlined, DollarOutlined } from '@ant-design/icons';
import { useStore } from '../store/useStore';
import type { Appointment } from '../type';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

export default function LedgerView() {
  const [form] = Form.useForm();
  const [checkoutForm] = Form.useForm();
  const [editForm] = Form.useForm();
  
  // 各种状态控制
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  
  const [currentRecord, setCurrentRecord] = useState<Appointment | null>(null);

  // 纯前端筛选条件状态
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 从 Zustand Store 实时拉取云端数据流与核心操作
  const appointments = useStore((state) => state.appointments);
  const services = useStore((state) => state.services);
  const staffList = useStore((state) => state.staffList);
  const loading = useStore((state) => state.loading);
  
  const addAppointment = useStore((state) => state.addAppointment);
  const updateAppointment = useStore((state) => state.updateAppointment);
  const deleteAppointment = useStore((state) => state.deleteAppointment);
  const fetchInitData = useStore((state) => state.fetchInitData);
  // ==========================================
  // 1. 多条件、多维度纯前端精准过滤逻辑
  // ==========================================
  const filteredData = appointments.filter(item => {
    // 文本模糊检索
    const matchText = item.customerName.toLowerCase().includes(searchText.toLowerCase()) || 
                      (item.remark && item.remark.toLowerCase().includes(searchText.toLowerCase()));
    
    // 服务状态过滤 (已预约 / 已完成 / 已取消)
    const matchStatus = statusFilter === 'all' ? true : item.status === statusFilter;
    
    // 【新加入】财务结算状态过滤 (已结账包含小费 / 待结账)
    // 逻辑：只有服务完成了（completed）且小费有记录（哪怕为0，只要录入过）才算财务闭环。
    // 这里我们用一个备注或逻辑标识，或者只要是 completed 且没有经过“去结算”按钮确认的统一算待结
    // 为了简单直观：我们将 status==='completed' 且标记了已核算的算已结。也可以根据小费是否为 0 辅助判断。
    // 我们这里用更严谨的判断：如果单子是 completed，且 remark 里包含 [已结账] 则是已结，否则是待结。
    const isCheckedOut = item.status === 'completed' && (item.remark?.includes('[已对账结单]') || false);
    let matchPayment: boolean = true;

    if (paymentStatusFilter === 'pending') {
      matchPayment = item.status === 'completed' && !isCheckedOut;
    } else if (paymentStatusFilter === 'paid') {
      matchPayment = isCheckedOut; 
    }

    // 时间范围安全解构过滤
    let matchDate = true;
    if (dateRange) {
      const itemTime = dayjs(item.appointmentTime);
      const [startDate, endDate] = dateRange;
      const start = startDate.startOf('day');
      const end = endDate.endOf('day');
      matchDate = itemTime.valueOf() >= start.valueOf() && itemTime.valueOf() <= end.valueOf();
    }

    return matchText && matchStatus && matchPayment && matchDate;
  }).sort((a, b) => dayjs(b.appointmentTime).valueOf() - a.appointmentTime.valueOf());

  // 散客选择服务项目自动联动
  const handleServiceChange = (serviceId: number) => {
    const service = services.find(s => s.id === serviceId);
    if (service) {
      form.setFieldsValue({ duration: service.duration, serviceFee: service.price });
    }
  };

  // ==========================================
  // 2. 核心：散客直接现付记账（一步到位直接变已结账）
  // ==========================================
  // ==========================================
  // 【新规则对齐版】散客组合记账提交：支持多渠道混付与 Punch Card 减免
  // ==========================================
  const handleQuickAddSubmit = async () => {
    try {
      const values = await form.validateFields();
      const selectedService = services.find(s => s.id === values.serviceId);
      const selectedStaff = staffList.find(s => s.id === values.staffId);
      if (!selectedService || !selectedStaff) {
        message.error('选中的项目或技师数据不存在');
        return;
      }

      const isPunchCardChecked = values.usePunchCard || false;
      const discount = isPunchCardChecked ? 30 : 0;
      
      // 计算减免后必须实收的金额
      const baseFee = values.serviceFee || 0;
      const finalRequired = Math.max(0, baseFee - discount);

      // 数值净化与保底
      const cash = Number(values.payCash || 0);
      const card = Number(values.payCard || 0);
      const gift = Number(values.payGiftCard || 0);
      const totalPaid = cash + card + gift;

      // 智能配平防御
      let finalCash = cash;
      if (totalPaid === 0 && finalRequired > 0) {
        finalCash = finalRequired; // 没拆分，默认全填现金
      } else if (totalPaid !== finalRequired) {
        message.error(`付款金额不匹配！扣除减免后应收 ${finalRequired} 元，当前输入组合总计 ${totalPaid} 元。`);
        return;
      }

      // 提交到 Cloudflare D1 云数据库，新字段独立落库
      await addAppointment({
        customerName: values.customerName || '散客',
        staffId: values.staffId,
        staffName: selectedStaff.name,
        serviceId: values.serviceId,
        serviceName: selectedService.name,
        appointmentTime: new Date(), // 直接记当下的时间
        duration: values.duration,
        serviceFee: baseFee, // 存储项目的原价费用
        tip: Number(values.tip || 0),
        payCash: finalCash,
        payCard: card,
        payGiftCard: gift,
        usePunchCard: isPunchCardChecked ? 1 : 0,
        status: 'completed', // 散客直接现付，状态一步到位完成
        remark: `[已对账结单] ${values.remark || ''}`.trim()
      });

      // 主动重新抓取最新云端流水，强制刷新大表格
      await fetchInitData();

      message.success('散客现场组合付款账目已成功存入云端 D1 数据库！');
      setIsQuickAddOpen(false);
      form.resetFields();
    } catch (err) { 
      console.error(err); 
    }
  };

  // ==========================================
  // 3. 核心：点击「去结算」按钮，录入小费完成财务闭环
  // ==========================================
  const handleCheckoutClick = (record: Appointment) => {
    setCurrentRecord(record);
    checkoutForm.setFieldsValue({ tip: 0, remark: record.remark || '' });
    setIsCheckoutOpen(true);
  };

  // ==========================================
  // 【真数据分离版】服务订单 - 财务组合结算提交
  // ==========================================
  const handleCheckoutSubmit = async () => {
    if (!currentRecord || !currentRecord.id) return;
    try {
      const values = await checkoutForm.validateFields();
      
      const isPunchCardChecked = values.usePunchCard || false;
      const discount = isPunchCardChecked ? 30 : 0;
      
      // 计算减免后应该收到的金额
      const baseFee = currentRecord.serviceFee || 0;
      const finalRequired = Math.max(0, baseFee - discount);

      // 数值纯化
      const cash = Number(values.payCash || 0);
      const card = Number(values.payCard || 0);
      const gift = Number(values.payGiftCard || 0);
      const totalPaid = cash + card + gift;

      // 智能配平防御
      let finalCash = cash;
      if (totalPaid === 0 && finalRequired > 0) {
        finalCash = finalRequired; // 老板没拆分，默认全算现金
      } else if (totalPaid !== finalRequired) {
        message.error(`付款金额不匹配！扣除减免后应收 ${finalRequired} 元，当前输入组合总计 ${totalPaid} 元。`);
        return;
      }

      // ✨【真正的高级改动】将每种支付渠道的真实数字、Punch Card状态独立打包传给云端
      await updateAppointment(currentRecord.id, {
        status: 'completed',
        tip: Number(values.tip || 0),
        payCash: finalCash,
        payCard: card,
        payGiftCard: gift,
        usePunchCard: isPunchCardChecked ? 1 : 0, // 存入 1 或 0
        remark: `[已对账结单] ${values.remark || ''}`.trim() // 备注恢复纯粹的备注
      });
      
      // 强行刷新大列表
      await fetchInitData();

      message.success('多渠道独立资金流水已安全入库云端 D1 数据库！');
      setIsCheckoutOpen(false);
      setCurrentRecord(null);
      checkoutForm.resetFields();
    } catch (err) { 
      console.error(err); 
    }
  };


  // ==========================================
  // 4. 后台更正：全面修改与彻底删除
  // ==========================================
  const handleEditClick = (record: Appointment) => {
    setCurrentRecord(record);
    // 提取纯净备注
    const cleanRemark = record.remark?.replace('[已对账结单]', '').trim() || '';
    
    // 将云端 D1 里的各个渠道金额和打卡状态回显到修改表单中
    editForm.setFieldsValue({
      serviceFee: record.serviceFee,
      usePunchCard: record.usePunchCard === 1, // 转换为布尔值
      payCash: record.payCash || 0,
      payCard: record.payCard || 0,
      payGiftCard: record.payGiftCard || 0,
      tip: record.tip,
      remark: cleanRemark
    });
    setIsEditOpen(true);
  };

  // ==========================================
  // 【新规则对齐版】提交修正：多渠道数据严密同步
  // ==========================================
  const handleEditSubmit = async () => {
    if (!currentRecord || !currentRecord.id) return;
    try {
      const values = await editForm.validateFields();
      
      const isPunchCardChecked = values.usePunchCard || false;
      const discount = isPunchCardChecked ? 30 : 0;
      
      // 计算修正后【必须实收】的总金额
      const baseFee = values.serviceFee || 0;
      const finalRequired = Math.max(0, baseFee - discount);

      // 数值纯化
      const cash = Number(values.payCash || 0);
      const card = Number(values.payCard || 0);
      const gift = Number(values.payGiftCard || 0);
      const totalPaid = cash + card + gift;

      // 智能配平防御：如果老板动手改了渠道分摊，必须算平
      let finalCash = cash;
      if (totalPaid === 0 && finalRequired > 0) {
        finalCash = finalRequired; // 没手动拆，保底全算现金
      } else if (totalPaid !== finalRequired) {
        message.error(`修正失败！更正后的项目费扣除减免应收 ${finalRequired} 元，当前输入组合支付总计 ${totalPaid} 元，请配平。`);
        return;
      }

      // 保持账目结单标记不变，拼装新备注
      const paymentBreakdown = `[已对账结单] 支付构成: (现金:${finalCash}元 | 刷卡:${card}元 | 礼品卡:${gift}元)${isPunchCardChecked ? ' [使用Punch Card减免30元]' : ''}`;
      const finalRemark = values.remark ? `${paymentBreakdown} | 备注: ${values.remark}` : paymentBreakdown;

      // 原子级同步推送到云端 D1 数据库
      await updateAppointment(currentRecord.id, {
        serviceFee: baseFee, // 项目面原价
        tip: Number(values.tip || 0),
        payCash: finalCash,
        payCard: card,
        payGiftCard: gift,
        usePunchCard: isPunchCardChecked ? 1 : 0,
        remark: finalRemark
      });

      // 强刷大列表
      await fetchInitData();

      message.success('云端历史对账账目已成功精准修正！');
      setIsEditOpen(false);
      setCurrentRecord(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    await deleteAppointment(id);
    message.success('该流水已从云端永久抹去');
  };

  // Ant Design 表格列头定义 (重新洗牌财务核心)
  const columns = [
    {
      title: '时间',
      dataIndex: 'appointmentTime',
      key: 'appointmentTime',
      width: 100, // 锁死宽度，防止时间换行
      render: (t: Date) => <span style={{ color: '#595959' }}>{dayjs(t).format('MM-DD HH:mm')}</span>,
    },
    { 
      title: '顾客', 
      dataIndex: 'customerName', 
      key: 'customerName',
      ellipsis: true,
    },
    { 
      title: '服务技师', 
      dataIndex: 'staffName', 
      key: 'staffName',
      width: 110,
    },
    { 
      title: '服务项目', 
      dataIndex: 'serviceName', 
      key: 'serviceName',
      ellipsis: true,
    },
    {
      title: '应收项目费',
      dataIndex: 'serviceFee',
      key: 'serviceFee',
      align: 'right' as const, // 金额右对齐，更符合财务规范
      width: 110,
      render: (fee: number) => <Text strong style={{ fontSize: '14px' }}>{fee} 元</Text>,
    },
    {
      title: '实收小费',
      dataIndex: 'tip',
      key: 'tip',
      align: 'right' as const,
      width: 100,
      render: (tip: number, record: Appointment) => {
        // 判断是否已经结单（通过备注标记判断）
        const isPaid = record.remark?.includes('[已对账结单]') || false;
        
        // 如果服务做完了但是没对账，显示亮眼橙色小角标提示查账
        if (!isPaid && record.status === 'completed') {
          return <Tag color="orange" style={{ margin: 0 }}>待核算</Tag>;
        }
        // 如果是纯预约或者取消单，没有小费概念
        if (record.status !== 'completed') {
          return <span style={{ color: '#bfbfbf' }}>-</span>;
        }
        return <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{tip > 0 ? `+${tip} 元` : '0 元'}</span>;
      },
    },
    {
      title: '账目状态', // 缩短表头，腾出宝贵的横向像素
      key: 'paymentStatus',
      align: 'center' as const,
      width: 140,
      render: (_: any, record: Appointment) => {
        if (record.status === 'cancelled') return <Tag color="red" style={{ borderRadius: '4px' }}>已取消预约</Tag>;
        if (record.status === 'booked') return <Tag color="blue" style={{ borderRadius: '4px' }}>仅预约未到店</Tag>;
        
        const isPaid = record.remark?.includes('[已对账结单]') || false;
        return isPaid 
          ? <Tag color="green" style={{ borderRadius: '4px', fontWeight: '500' }}>✅ 已对账结单</Tag> 
          : <Tag color="gold" style={{ borderRadius: '4px', fontWeight: '500' }}>⚠️ 待对账结算</Tag>;
      }
    },
    {
      title: '账目备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true, // 开启省略号，防止多渠道长字符串撑爆表格
      render: (text: string) => {
        if (!text) return <span style={{ color: '#bfbfbf' }}>-</span>;
        // 把后台的核心标记符号过滤掉，只把最纯净、老板手写的备注字样展示在列表上
        return text.replace('[已对账结单]', '').replace('支付构成:', '明细:').trim() || '-';
      }
    },
    {
      title: '财务操作', // 缩短表头，拒绝换行挤压
      key: 'action',
      align: 'center' as const,
      width: 180, // 给足按钮空间
      render: (_: any, record: Appointment) => {
        const isPaid = record.remark?.includes('[已对账结单]') || false;
        
        // 【关键修复】只有状态是“服务完成（completed）”且“还未结账”的单子，才允许冒出「去结算」
        const showCheckoutBtn = record.status === 'completed' && !isPaid;

        return (
          <Space size="middle">
            {showCheckoutBtn ? (
              <Button 
                type="primary" 
                size="small" 
                style={{ backgroundColor: '#1890ff', borderColor: '#1890ff', borderRadius: '4px', fontSize: '12px' }} 
                icon={<DollarOutlined />} 
                onClick={() => handleCheckoutClick(record)}
              >
                去结算
              </Button>
            ) : (
              // 🔴【核心提升点】如果已经付过钱或者仅仅是预约，去结算按钮彻底消失，改用一个清爽的扁平化微型按钮，维持排版高度一致
              <div style={{ width: '68px' }} /> // 用隐形占位符保持横向对齐，表格不抖动
            )}
            
            <Button 
              type="text" 
              size="small" 
              style={{ color: '#595959', backgroundColor: '#f5f5f5', borderRadius: '4px' }} 
              onClick={() => handleEditClick(record)}
            >
              修正
            </Button>
            
            <Popconfirm 
              title="确定删除该笔流水吗？" 
              description="删除后将永久扣减全部图表和核算数据。"
              onConfirm={() => handleDelete(record.id!)}
              okText="确定删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger style={{ borderRadius: '4px' }}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Card 
          title="财务记账与流水明细" 
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsQuickAddOpen(true)}>散客直接现付记账</Button>}
        >
          {/* 顶部多条件高级搜索过滤器栏 */}
          <div style={{ marginBottom: 20, display: 'flex', gap: '12px', flexWrap: 'wrap', backgroundColor: '#fafafa', padding: '16px', borderRadius: '6px' }}>
            <Input 
              placeholder="搜索 顾客姓名 / 备注" 
              value={searchText} 
              onChange={e => setSearchText(e.target.value)} 
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              style={{ width: 200 }}
            />
            
            <Select 
              value={statusFilter} 
              onChange={setStatusFilter}
      
              style={{ width: 140 }}
              options={[{ value: 'all', label: '全部服务状态' },{ value: 'booked', label: '日历已预约' },{ value: 'completed', label: '到店服务完成' },{ value: 'cancelled', label: '客户已取消' }]}
              />
            <Select value={paymentStatusFilter}onChange={setPaymentStatusFilter}
            style={{ width: 140 }}
            options={[{ value: 'all', label: '全部账目状态' },{ value: 'pending', label: '⚠️ 待核算结账' },{ value: 'paid', label: '✅ 已对账结单' },]}
            />
        <RangePicker onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs] | null)}placeholder={['流水开始日期', '结束日期']}/>
        </div>
            {/* 数据明细大表格 */}
    <Table 
        loading={loading}
        columns={columns} 
        dataSource={filteredData} 
        rowKey="id"
        pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 笔资金明细` }}
      />

      {/* 弹窗 A：散客直接现付记账 */}
      <Modal
        title="散客直接现付记账 (多渠道与自动减免)"
        open={isQuickAddOpen}
        onOk={handleQuickAddSubmit}
        onCancel={() => setIsQuickAddOpen(false)}
        okText="确认入账"
        cancelText="取消"
        destroyOnClose
      >
        <Form 
          form={form} 
          layout="vertical" 
          initialValues={{ duration: 60, serviceFee: 0, tip: 0, customerName: '散客', usePunchCard: false, payCash: 0, payCard: 0, payGiftCard: 0 }}
        >
          <Form.Item label="顾客称呼" name="customerName">
            <Input placeholder="散客" />
          </Form.Item>

          <Form.Item label="选择服务项目" name="serviceId" rules={[{ required: true, message: '请选择项目' }]}>
            <Select 
              placeholder="选择项目" 
              style={{ width: '100%' }} 
              onChange={handleServiceChange} 
              options={services.map(s => ({ value: s.id, label: `${s.name} (${s.price}元)` }))} 
            />
          </Form.Item>

          {/* 实时动态核算看板 (当散客选了项目或点打卡时，这里实时算给老板看) */}
          <Form.Item shouldUpdate={(prev, curr) => prev.serviceId !== curr.serviceId || prev.usePunchCard !== curr.usePunchCard || prev.serviceFee !== curr.serviceFee}>
            {({ getFieldValue }) => {
              const baseFee = getFieldValue('serviceFee') || 0;
              const checked = getFieldValue('usePunchCard');
              const discount = checked ? 30 : 0;
              const finalNeeded = Math.max(0, baseFee - discount);

              return (
                <div style={{ marginBottom: 16, backgroundColor: '#f9f9f9', padding: '14px', borderRadius: '8px', border: '1px solid #d9d9d9' }}>
                  <p style={{ margin: '0 0 4px 0', color: '#595959' }}>项目定价: {baseFee} 元</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #d9d9d9', paddingTop: '8px', marginTop: '4px' }}>
                    <span>打卡券扣减: <span style={{ color: '#ff4d4f' }}>-{discount} 元</span></span>
                    <span>✨ 现场实收总金额: <b style={{ color: '#52c41a', fontSize: '18px' }}>{finalNeeded} 元</b></span>
                  </div>
                </div>
              );
            }}
          </Form.Item>

          <div style={{ display: 'flex', gap: '16px' }}>
            <Form.Item label="时长 (分钟)" name="duration" style={{ flex: 1 }}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item>
            {/* 允许老板手动修改基本价格 (比如给散客打折) */}
            <Form.Item label="实收项目基本价格 (元)" name="serviceFee" style={{ flex: 1 }}>
              <InputNumber 
                min={0} 
                style={{ width: '100%' }} 
                onChange={(val) => {
                  // 价格手动改动时，自动联动把新的实收金额铺满现金输入框，省去重复手输
                  const checked = form.getFieldValue('usePunchCard');
                  const finalNeeded = checked ? Math.max(0, Number(val || 0) - 30) : Number(val || 0);
                  form.setFieldsValue({ payCash: finalNeeded, payCard: 0, payGiftCard: 0 });
                }}
              />
            </Form.Item>
          </div>

          <Form.Item label="指派服务技师" name="staffId" rules={[{ required: true, message: '请指定技师' }]}>
            <Select placeholder="选择技师" style={{ width: '100%' }} options={staffList.filter(s => s.status === 'active').map(s => ({ value: s.id, label: s.name }))} />
          </Form.Item>

          {/* 选项：是否使用打卡减免 */}
          <Form.Item name="usePunchCard" valuePropName="checked" style={{ marginBottom: 16 }}>
            <Select 
              placeholder="是否使用 Punch Card 减免"
              options={[
                { value: false, label: '不使用 Punch Card (按项目定价结算)' },
                { value: true, label: '🎟️ 使用 Punch Card (现场立减 30 元)' }
              ]}
              onChange={(val) => {
                const baseFee = form.getFieldValue('serviceFee') || 0;
                const finalNeeded = val ? Math.max(0, baseFee - 30) : baseFee;
                form.setFieldsValue({ payCash: finalNeeded, payCard: 0, payGiftCard: 0 });
              }}
            />
          </Form.Item>

          {/* 三种混合付款通道拆分栏 */}
          <Card title="混合付款方式拆分" size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item label="💵 现金支付" name="payCash">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="💳 刷卡支付" name="payCard">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="🎁 礼品卡" name="payGiftCard">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item label="顾客现场给予的小费 (元)" name="tip">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="账目备注" name="remark">
            <Input placeholder="备注说明" />
          </Form.Item>
        </Form>
      </Modal>
 {/* 弹窗 B：高级混合付款与自动减免结算 Modal */}
      <Modal
        title="服务订单 - 财务组合对账结算"
        open={isCheckoutOpen}
        onOk={handleCheckoutSubmit}
        onCancel={() => { setIsCheckoutOpen(false); setCurrentRecord(null); }}
        okText="确认结单入账"
        cancelText="取消"
        destroyOnClose
      >
        {/* Form 增加 onValuesChange 监听，当老板勾选打卡时，下面实时重新计算账目数字 */}
        <Form 
          form={checkoutForm} 
          layout="vertical" 
          initialValues={{ tip: 0, usePunchCard: false, payCash: 0, payCard: 0, payGiftCard: 0 }}
        >
          {/* 实时动态核算看板 */}
          <Form.Item shouldUpdate={(prev, curr) => prev.usePunchCard !== curr.usePunchCard}>
            {({ getFieldValue }) => {
              const checked = getFieldValue('usePunchCard');
              const baseFee = currentRecord?.serviceFee || 0;
              const discount = checked ? 30 : 0;
              const finalNeeded = Math.max(0, baseFee - discount);

              return (
                <div style={{ marginBottom: 16, backgroundColor: '#f9f9f9', padding: '16px', borderRadius: '8px', border: '1px solid #d9d9d9' }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: '14px' }}>顾客姓名: <b>{currentRecord?.customerName}</b> | 技师: <b>{currentRecord?.staffName}</b></p>
                  <p style={{ margin: '0 0 8px 0', color: '#595959' }}>原定项目费: {baseFee} 元</p>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #d9d9d9', paddingTop: '8px', marginTop: '4px' }}>
                    <span>打卡减免: <span style={{ color: '#ff4d4f' }}>-{discount} 元</span></span>
                    <span>✨ 实收项目款总额: <b style={{ color: '#52c41a', fontSize: '18px' }}>{finalNeeded} 元</b></span>
                  </div>
                </div>
              );
            }}
          </Form.Item>

          {/* 选项：是否使用打卡减免 */}
          <Form.Item name="usePunchCard" valuePropName="checked" style={{ marginBottom: 16 }}>
            <Select 
              placeholder="是否使用 Punch Card 减免"
              options={[
                { value: false, label: '不使用 Punch Card (按原价结算)' },
                { value: true, label: '🎟️ 使用 Punch Card (立减 30 元)' }
              ]}
              onChange={(val) => {
                // 当切换选项时，自动帮老板把现金默认填入应收金额，减少二次输入
                const baseFee = currentRecord?.serviceFee || 0;
                const finalNeeded = val ? Math.max(0, baseFee - 30) : baseFee;
                checkoutForm.setFieldsValue({ payCash: finalNeeded, payCard: 0, payGiftCard: 0 });
              }}
            />
          </Form.Item>

          {/* 核心改动：三种混合付款通道拆分栏 */}
          <Card title="混合付款方式拆分 (请确保总和等于上方实收总额)" size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item label="💵 现金支付" name="payCash">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="💳 刷卡支付" name="payCard">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="🎁 礼品卡" name="payGiftCard">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          {/* 独立于项目款的小费录入通道 */}
          <Form.Item 
            label="顾客最终给的额外小费 (元)" 
            name="tip" 
            rules={[{ required: true, message: '若无小费请填 0' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} placeholder="没有小费填 0" />
          </Form.Item>

          <Form.Item label="补充对账备注" name="remark">
            <Input placeholder="可记录微信单号、支票号等" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 弹窗 C：历史对账流水多渠道修正子系统 Modal */}
      <Modal
        title="修正历史对账流水 (多渠道与自动减免)"
        open={isEditOpen}
        onOk={handleEditSubmit}
        onCancel={() => { setIsEditOpen(false); setCurrentRecord(null); }}
        okText="确认修正"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={editForm} layout="vertical"> 
          {/* 实时动态核算看板 */}
          <Form.Item shouldUpdate={(prev, curr) => prev.usePunchCard !== curr.usePunchCard || prev.serviceFee !== curr.serviceFee}>
            {({ getFieldValue }) => {
              const baseFee = getFieldValue('serviceFee') || 0;
              const checked = getFieldValue('usePunchCard');
              const discount = checked ? 30 : 0;
              const finalNeeded = Math.max(0, baseFee - discount);

              return (
                <div style={{ marginBottom: 16, backgroundColor: '#f9f9f9', padding: '14px', borderRadius: '8px', border: '1px solid #d9d9d9' }}>
                  <p style={{ margin: '0 0 4px 0', color: '#595959' }}>当前更正项目原价: {baseFee} 元</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #d9d9d9', paddingTop: '8px', marginTop: '4px' }}>
                    <span>打卡券扣减: <span style={{ color: '#ff4d4f' }}>-{discount} 元</span></span>
                    <span>✨ 更正后实收总金额: <b style={{ color: '#52c41a', fontSize: '18px' }}>{finalNeeded} 元</b></span>
                  </div>
                </div>
              );
            }}
          </Form.Item>

          <Form.Item label="更正项目账面原价 (元)" name="serviceFee" rules={[{ required: true }]}>
            <InputNumber 
              min={0} 
              style={{ width: '100%' }} 
              onChange={(val) => {
                const checked = editForm.getFieldValue('usePunchCard');
                const finalNeeded = checked ? Math.max(0, Number(val || 0) - 30) : Number(val || 0);
                editForm.setFieldsValue({ payCash: finalNeeded, payCard: 0, payGiftCard: 0 });
              }}
            />
          </Form.Item>

          {/* 选项：是否使用打卡减免 */}
          <Form.Item name="usePunchCard" valuePropName="checked" style={{ marginBottom: 16 }}>
            <Select 
              placeholder="是否使用 Punch Card 减免"
              options={[
                { value: false, label: '不使用 Punch Card (按更正原价结算)' },
                { value: true, label: '🎟️ 使用 Punch Card (现场立减 30 元)' }
              ]}
              onChange={(val) => {
                const baseFee = editForm.getFieldValue('serviceFee') || 0;
                const finalNeeded = val ? Math.max(0, baseFee - 30) : baseFee;
                editForm.setFieldsValue({ payCash: finalNeeded, payCard: 0, payGiftCard: 0 });
              }}
            />
          </Form.Item>

          {/* 三种混合付款通道拆分栏 */}
          <Card title="更正付款方式拆分" size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
            <Row gutter={12}>
              <Col span={8}>
                <Form.Item label="💵 现金支付" name="payCash">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="💳 刷卡支付" name="payCard">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item label="🎁 礼品卡" name="payGiftCard">
                  <InputNumber min={0} style={{ width: '100%' }} precision={2} />
                </Form.Item>
              </Col>
            </Row>
          </Card>

          <Form.Item label="更正小费金额 (元)" name="tip" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item label="修改备注" name="remark">
            <Input placeholder="修正原因说明" />
          </Form.Item>
        </Form>
      </Modal>

    </Card>
  );
}
