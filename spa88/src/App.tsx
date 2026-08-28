// src/App.tsx
import { useState } from 'react';
import { Layout, Menu, Typography, ConfigProvider } from 'antd';
import { CalendarOutlined, FileTextOutlined, BarChartOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN'; // 引入中文包，让日历变成中文显示
import CalendarView from './pages/CalendarView';
import { initMockDataIfEmpty } from './db/mockData';
import LedgerView from './pages/LedgerView';
import StatisticsView from './pages/StatisticsView';

// 初始化本地数据
initMockDataIfEmpty();

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

export default function App() {
  const [currentMenu, setCurrentMenu] = useState('calendar');

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
