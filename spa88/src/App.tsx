// src/App.tsx
import { useEffect, useState } from 'react';
import { Layout, Menu, Typography, ConfigProvider, Card, Input, Button, message } from 'antd';
import { CalendarOutlined, FileTextOutlined, BarChartOutlined, LockOutlined, LogoutOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN'; // 引入中文包，让日历变成中文显示
import CalendarView from './pages/CalendarView';
import { initMockDataIfEmpty } from './db/mockData';
import LedgerView from './pages/LedgerView';
import StatisticsView from './pages/StatisticsView';
import { useStore, getAdminToken } from './store/useStore';

// 初始化本地数据
initMockDataIfEmpty();

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

// 管理员口令登录界面（口令只保存在当前标签页，关闭标签页即失效）
function LoginGate() {
  const verifyAdminToken = useStore((s) => s.verifyAdminToken);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const token = pwd.trim();
    if (!token) return;
    setBusy(true);
    const ok = await verifyAdminToken(token);
    setBusy(false);
    if (ok) {
      message.success('登录成功');
      setPwd('');
    } else {
      message.error('口令不正确，请重试');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', padding: 16 }}>
      <Card title="后台管理登录" style={{ width: 360 }}>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 12 }}>
          请输入管理员口令（找店长获取）。口令只保存在当前标签页，关闭标签页后自动失效。
        </p>
        <Input.Password
          prefix={<LockOutlined />}
          placeholder="管理员口令"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onPressEnter={submit}
          style={{ marginBottom: 12 }}
        />
        <Button type="primary" block loading={busy} onClick={submit}>
          进入后台
        </Button>
      </Card>
    </div>
  );
}

export default function App() {

  const [currentMenu, setCurrentMenu] = useState('calendar');
  const fetchInitData = useStore((state) => state.fetchInitData);
  const authRequired = useStore((state) => state.authRequired);
  const setAuthRequired = useStore((state) => state.setAuthRequired);
  const logout = useStore((state) => state.logout);

  useEffect(() => {
    // 有口令直接拉数据，没有则弹出登录界面
    if (!getAdminToken()) {
      setAuthRequired(true);
    } else {
      fetchInitData();
    }
  }, [fetchInitData, setAuthRequired]);

  // 导航菜单配置
  const menuItems = [
    { key: 'calendar', icon: <CalendarOutlined />, label: '预约日历看板' },
    { key: 'ledger', icon: <FileTextOutlined />, label: '记账流水明细' },
    { key: 'statistics', icon: <BarChartOutlined />, label: '查账与报表统计' },
  ];

  // 渲染不同的页面
  const renderContent = () => {
    switch (currentMenu) {
      case 'calendar':
        return <CalendarView />;
      case 'ledger':
        return <LedgerView />;
      case 'statistics':
        return <StatisticsView/>;
      default:
        return <CalendarView />;
    }
  };

  if (authRequired) {
    return (
      <ConfigProvider locale={zhCN}>
        <LoginGate />
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ display: 'flex', alignItems: 'center', backgroundColor: '#001529', padding: '0 20px' }}>
          <Title level={4} style={{ color: '#fff', margin: '0 20px 0 0', whiteSpace: 'nowrap' }}>
            💆‍♂️ 简易本地按摩记账系统
          </Title>
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[currentMenu]}
            onClick={(e) => setCurrentMenu(e.key)}
            items={menuItems}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button
            ghost
            icon={<LogoutOutlined />}
            onClick={logout}
            style={{ marginLeft: 12, color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
          >
            退出
          </Button>
        </Header>

        <Content style={{ padding: '24px', backgroundColor: '#f0f2f5' }}>
          {renderContent()}
        </Content>

        <Footer style={{ textAlign: 'center', color: '#bfbfbf' }}>
          本地记账系统 - 数据完全存储在您的浏览器中 (IndexedDB)
        </Footer>
      </Layout>
    </ConfigProvider>
  );
}
