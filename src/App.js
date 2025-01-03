// App.js (Part 1: Username flow + public chat)
import React, { useEffect, useState } from 'react';
import { Layout, List, Avatar, Typography, Button, Input, Modal } from 'antd';
import { SearchOutlined, GoogleOutlined } from '@ant-design/icons';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';
import './App.css';

const { Header, Content, Footer } = Layout;
const { Title } = Typography;

function App() {
  // Firebase user states
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Username states
  const [username, setUsername] = useState('');
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // WebSocket states
  const [ws, setWs] = useState(null);
  const [publicMessage, setPublicMessage] = useState('');
  const [publicChatList, setPublicChatList] = useState([]);

  // -----------------------------
  // 1) Listen for auth changes
  // -----------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Check if user is in Firestore
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', currentUser.email));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
          // User does not exist => ask for username
          setShowUsernameModal(true);
        } else {
          // If found, set local `username` and proceed
          const docData = querySnap.docs[0].data();
          setUsername(docData.username);
        }
      } else {
        // Not logged in
        setUsername('');
      }
    });

    return () => unsubscribe();
  }, []);

  // -----------------------------
  // 2) Create WebSocket after we know our auth state & username
  //    We'll connect only if user is logged in.
  // -----------------------------
  useEffect(() => {
    if (!user || !username) return;

    const socket = new WebSocket('https://a7b2-178-237-51-195.ngrok-free.app'); 
    // If you're using ngrok or hosting the client, change above to wss://<your_ngrok_url>

    socket.onopen = () => {
      console.log('WebSocket connected (public chat).');
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Initialize chat with existing public messages
      if (data.type === 'init-public') {
        setPublicChatList(data.messages);
      }
      // New public message
      else if (data.type === 'public-chat') {
        setPublicChatList((prev) => [...prev, data.message]);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket closed.');
    };

    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    setWs(socket);

    // Cleanup
    return () => {
      socket.close();
    };
  }, [user, username]);

  // -----------------------------
  // 3) Google Login / Logout
  // -----------------------------
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      // The onAuthStateChanged listener will handle the rest
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

  // -----------------------------
  // 4) Handle new username creation
  // -----------------------------
  const handleCreateUsername = async () => {
    // Save to Firestore => users collection
    if (newUsername.trim() === '') return;

    try {
      const usersRef = collection(db, 'users');
      await addDoc(usersRef, {
        email: user.email,
        username: newUsername.trim(),
      });
      setUsername(newUsername.trim());
      setShowUsernameModal(false);
      setNewUsername('');
    } catch (err) {
      console.error('Error creating username:', err);
      alert('Error creating username.');
    }
  };

  // -----------------------------
  // 5) Public chat message
  // -----------------------------
  const handleSendPublicMessage = () => {
    if (!ws || publicMessage.trim() === '') return;

    ws.send(
      JSON.stringify({
        type: 'public-chat',
        username: username,
        text: publicMessage.trim(),
      })
    );

    setPublicMessage('');
  };

  // Show a spinner while checking auth
  if (loading) return <div>Loading...</div>;

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
          // Logged in => show public chat
          <div>
            {/* We keep the "Search or start new chat" bar for now, but no real search yet */}
            <Input
              placeholder="Search or start new chat"
              prefix={<SearchOutlined />}
              style={{ marginBottom: '16px', borderRadius: '8px' }}
            />

            {/* PUBLIC Chat messages */}
            <List
              itemLayout="horizontal"
              dataSource={publicChatList}
              renderItem={(chatItem, index) => (
                <List.Item
                  key={index}
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    padding: '10px',
                  }}
                >
                  <List.Item.Meta
                    avatar={
                      <Avatar style={{ backgroundColor: '#87d068' }}>
                        {chatItem.username?.charAt(0).toUpperCase()}
                      </Avatar>
                    }
                    title={
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{chatItem.username}</span>
                        <span style={{ fontSize: '12px', color: '#888' }}>
                          {chatItem.timestamp}
                        </span>
                      </div>
                    }
                    description={chatItem.text}
                  />
                </List.Item>
              )}
            />

            <div style={{ display: 'flex', marginTop: '16px' }}>
              <Input
                placeholder="Type your message..."
                style={{ marginRight: '8px' }}
                value={publicMessage}
                onChange={(e) => setPublicMessage(e.target.value)}
              />
              <Button type="primary" onClick={handleSendPublicMessage}>
                Send
              </Button>
            </div>
          </div>
        )}
      </Content>

      <Footer
        style={{
          textAlign: 'center',
          backgroundColor: '#075E54',
          color: '#fff',
        }}
      >
        OzyeginChat ©2024
      </Footer>

      {/* Modal to ask for new username */}
      <Modal
        title="Choose a username"
        visible={showUsernameModal}
        onOk={handleCreateUsername}
        onCancel={() => {}}
        closable={false}
        maskClosable={false}
        okText="Save"
      >
        <Input
          placeholder="Enter username"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
        />
      </Modal>
    </Layout>
  );
}

export default App;
