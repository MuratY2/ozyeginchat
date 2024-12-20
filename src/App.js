import React, { useEffect, useState } from 'react';
import { Layout, List, Avatar, Typography, Button, Input } from 'antd';
import { SearchOutlined, GoogleOutlined } from '@ant-design/icons';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
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
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleGoogleLogin = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            alert('Login successful!');
        } catch (error) {
            alert(error.message);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            alert('Logout successful!');
        } catch (error) {
            alert(error.message);
        }
    };

    if (loading) {
        return <div>Loading...</div>;
    }

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Header style={{ backgroundColor: '#075E54', padding: '0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title level={3} style={{ color: '#fff', margin: 0 }}>
                    OzyeginChat
                </Title>
                {user && (
                    <Button type="primary" onClick={handleLogout}>
                        Logout
                    </Button>
                )}
            </Header>
            <Content style={{ padding: '16px', backgroundColor: '#EFEFEF' }}>
                {!user ? (
                    <div
                        style={{
                            maxWidth: '400px',
                            margin: '0 auto',
                            padding: '16px',
                            background: '#fff',
                            borderRadius: '8px',
                            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                            textAlign: 'center',
                        }}
                    >
                        <Title level={3} style={{ marginBottom: '16px' }}>
                            Welcome to OzyeginChat
                        </Title>
                        <Button
                            type="primary"
                            icon={<GoogleOutlined />}
                            onClick={handleGoogleLogin}
                            style={{ width: '100%' }}
                        >
                            Sign in with Google
                        </Button>
                    </div>
                ) : (
                    <div>
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
                    </div>
                )}
            </Content>
            <Footer style={{ textAlign: 'center', backgroundColor: '#075E54', color: '#fff' }}>
                OzyeginChat ©2024
            </Footer>
        </Layout>
    );
}

export default App;
