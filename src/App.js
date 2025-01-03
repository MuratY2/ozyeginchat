// App.js 
import React, { useEffect, useState } from 'react';
import { Layout, List, Avatar, Typography, Button, Input } from 'antd';
import { SearchOutlined, GoogleOutlined } from '@ant-design/icons';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from './firebase'; 
import './App.css';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

function App() {
  // States for WebSocket
  const [ws, setWs] = useState(null);
  const [message, setMessage] = useState('');
  const [messageList, setMessageList] = useState([]);

  // States for Firebase Auth
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Connect to Firebase Auth once
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Connect to WebSocket after we know our auth state
  // (so that we know who the user is before we start chatting)
  useEffect(() => {
    // Only connect if user is logged in
    if (!user) return;

    const socket = new WebSocket('https://9d35-178-237-50-147.ngrok-free.app');

    socket.onopen = () => {
      console.log('Connected to WebSocket server.');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'init') {
        setMessageList(data.messages);
      } else if (data.type === 'chat') {
        setMessageList((prev) => [...prev, data.message]);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket connection closed.');
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(socket);

    // Cleanup on component unmount
    return () => {
      socket.close();
    };
  }, [user]);

  // Auth button handlers
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

  // Send message with the user’s email or displayName if user is logged in
  const handleSendMessage = () => {
    if (!ws || !message.trim()) return;
    ws.send(
      JSON.stringify({
        type: 'chat',
        id: user?.email || user?.displayName || 'UnknownUser',
        text: message.trim(),
      })
    );
    setMessage('');
  };

  // Show "Loading" while we check auth status
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          backgroundColor: '#075E54',
          padding: '0 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Title level={3} style={{ color: '#fff', margin: 0 }}>
          OzyeginChat
        </Title>
        {/* If logged in, show Logout button; otherwise hide */}
        {user && (
          <Button type="primary" onClick={handleLogout}>
            Logout
          </Button>
        )}
      </Header>

      <Content style={{ padding: '16px', backgroundColor: '#EFEFEF' }}>
        {/* If not logged in, show Google Sign In. Otherwise, show the chat. */}
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
            {/* Search bar (still just for visual) */}
            <Input
              placeholder="Search or start new chat"
              prefix={<SearchOutlined />}
              style={{ marginBottom: '16px', borderRadius: '8px' }}
            />

            {/* Chat messages (from WebSocket) */}
            <List
              itemLayout="horizontal"
              dataSource={messageList}
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
                    avatar={<Avatar style={{ backgroundColor: '#87d068' }}>{chat.id.charAt(0).toUpperCase()}</Avatar>}
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{chat.id}</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>{chat.timestamp}</span>
                      </div>
                    }
                    description={chat.text}
                  />
                </List.Item>
              )}
            />

            {/* Send message input */}
            <div style={{ display: 'flex', marginTop: '16px' }}>
              <Input
                placeholder="Type your message..."
                style={{ marginRight: '8px' }}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button type="primary" onClick={handleSendMessage}>
                Send
              </Button>
            </div>
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
