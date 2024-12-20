import React from 'react';
import { Layout, List, Avatar, Input, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import './App.css';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

const dummyChats = [
    {
        id: 1,
        name: 'John Doe',
        message: 'Hey, how are you?',
        time: '10:45 AM',
        avatar: 'https://via.placeholder.com/40',
    },
    {
        id: 2,
        name: 'Jane Smith',
        message: 'Meeting tomorrow at 10?',
        time: '9:30 AM',
        avatar: 'https://via.placeholder.com/40',
    },
    {
        id: 3,
        name: 'Group Chat',
        message: 'Let’s catch up this weekend!',
        time: 'Yesterday',
        avatar: 'https://via.placeholder.com/40',
    },
];

function App() {
    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Header style={{ backgroundColor: '#075E54', padding: '0 16px' }}>
                <Title level={3} style={{ color: '#fff', lineHeight: '64px', margin: 0 }}>
                    OzyeginChat
                </Title>
            </Header>
            <Content style={{ backgroundColor: '#EFEFEF', padding: '16px' }}>
                <Input
                    placeholder="Search or start new chat"
                    prefix={<SearchOutlined />}
                    style={{ marginBottom: '16px', borderRadius: '8px' }}
                />
                <List
                    itemLayout="horizontal"
                    dataSource={dummyChats}
                    renderItem={(chat) => (
                        <List.Item
                            style={{
                                backgroundColor: '#fff',
                                borderRadius: '8px',
                                marginBottom: '8px',
                                padding: '10px',
                            }}
                        >
                            <List.Item.Meta
                                avatar={<Avatar src={chat.avatar} />}
                                title={
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>{chat.name}</span>
                                        <span style={{ fontSize: '12px', color: '#888' }}>{chat.time}</span>
                                    </div>
                                }
                                description={chat.message}
                            />
                        </List.Item>
                    )}
                />
            </Content>
            <Footer style={{ textAlign: 'center', backgroundColor: '#075E54', color: '#fff' }}>
                OzyeginChat ©2024 
            </Footer>
        </Layout>
    );
}

export default App;
