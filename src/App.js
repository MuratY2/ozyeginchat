// App.js (Part 1: Scrollable Chat UI)
import React, { useEffect, useState, useRef } from 'react';
import { Layout, List, Avatar, Typography, Button, Input, Modal } from 'antd';
import { SearchOutlined, GoogleOutlined } from '@ant-design/icons';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  getDocs,
  query,
  where,
  addDoc,
  orderBy,
  startAt,
  endAt,
} from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';
import './App.css';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

function App() {
  // Firebase Auth
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Username
  const [username, setUsername] = useState('');
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // WebSocket
  const [ws, setWs] = useState(null);

  // Public chat
  const [publicMessage, setPublicMessage] = useState('');
  const [publicChatList, setPublicChatList] = useState([]);
  const publicChatRef = useRef(null); // For auto-scrolling

  // Private chat
  const [privateChatList, setPrivateChatList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [privateMessage, setPrivateMessage] = useState('');
  const privateChatRef = useRef(null); // For auto-scrolling

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // ----------------------------------
  // 1) Firebase Auth listener
  // ----------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Check if user exists in Firestore
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', currentUser.email));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
          // user not found => ask for username
          setShowUsernameModal(true);
        } else {
          // found => set local username
          const docData = querySnap.docs[0].data();
          setUsername(docData.username);
        }
      } else {
        setUsername('');
      }
    });

    return () => unsubscribe();
  }, []);

  // ----------------------------------
  // 2) Connect WebSocket after username is known
  // ----------------------------------
  useEffect(() => {
    if (!user || !username) return;

    const socket = new WebSocket('https://a7b2-178-237-51-195.ngrok-free.app');
    // For production / Firebase + ngrok 

    socket.onopen = () => {
      console.log('WebSocket connected.');
      // Register your username with the server
      socket.send(
        JSON.stringify({
          type: 'register-username',
          username: username,
        })
      );
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Public init
      if (data.type === 'init-public') {
        setPublicChatList(data.messages);
      }
      // New public message
      else if (data.type === 'public-chat') {
        setPublicChatList((prev) => [...prev, data.message]);
      }
      // Private init
      else if (data.type === 'init-private') {
        setPrivateChatList(data.messages);
      }
      // New private message
      else if (data.type === 'private-chat') {
        setPrivateChatList((prev) => [...prev, data.message]);
      }
    };

    socket.onclose = () => {
      console.log('WebSocket closed.');
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(socket);

    // Cleanup
    return () => {
      socket.close();
    };
  }, [user, username]);

  // ----------------------------------
  // 3) Auto-scroll to bottom when public/private chat updates
  // ----------------------------------
  useEffect(() => {
    if (publicChatRef.current) {
      publicChatRef.current.scrollTop = publicChatRef.current.scrollHeight;
    }
  }, [publicChatList]);

  useEffect(() => {
    if (privateChatRef.current) {
      privateChatRef.current.scrollTop = privateChatRef.current.scrollHeight;
    }
  }, [privateChatList, selectedUser]);

  // ----------------------------------
  // 4) Google Login / Logout
  // ----------------------------------
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      alert('Logout successful!');
      setSelectedUser(null);
      setPrivateChatList([]);
    } catch (error) {
      alert(error.message);
    }
  };

  // ----------------------------------
  // 5) Create Username Flow
  // ----------------------------------
  const handleCreateUsername = async () => {
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

  // ----------------------------------
  // 6) Public Chat
  // ----------------------------------
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

  // ----------------------------------
  // 7) Private Chat
  // ----------------------------------
  const handleSendPrivateMessage = () => {
    if (!ws || !selectedUser || privateMessage.trim() === '') return;

    ws.send(
      JSON.stringify({
        type: 'private-chat',
        from: username,
        to: selectedUser,
        text: privateMessage.trim(),
      })
    );
    setPrivateMessage('');
  };

  const privateMessagesWithSelected = privateChatList.filter(
    (pm) =>
      (pm.from === username && pm.to === selectedUser) ||
      (pm.from === selectedUser && pm.to === username)
  );

  // ----------------------------------
  // 8) Search for other users
  // ----------------------------------
  const handleSearch = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (val.trim() === '') {
      setSearchResults([]);
      return;
    }

    try {
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        orderBy('username'),
        startAt(val),
        endAt(val + '\uf8ff')
      );
      const querySnap = await getDocs(q);

      const results = [];
      querySnap.forEach((doc) => {
        const data = doc.data();
        // Skip yourself
        if (data.username !== username) {
          results.push(data);
        }
      });

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  const handleSelectUser = (uname) => {
    setSelectedUser(uname);
    setSearchResults([]);
    setSearchQuery('');
  };

  if (loading) return <div>Loading...</div>;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Header */}
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

      {/* Content */}
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
          <div style={{ display: 'flex', gap: '16px' }}>
            {/* Left side: Search + Global Chat */}
            <div style={{ flex: '1' }}>
              <div style={{ position: 'relative' }}>
                <Input
                  placeholder="Search users by username..."
                  prefix={<SearchOutlined />}
                  style={{ marginBottom: '16px', borderRadius: '8px' }}
                  value={searchQuery}
                  onChange={handleSearch}
                />
                {searchResults.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '50px',
                      left: 0,
                      width: '100%',
                      background: '#fff',
                      border: '1px solid #ccc',
                      borderRadius: '8px',
                      zIndex: 10,
                    }}
                  >
                    {searchResults.map((res, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '8px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #eee',
                        }}
                        onClick={() => handleSelectUser(res.username)}
                      >
                        {res.username}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Title level={4}>Global Chat</Title>
              {/* Scrollable container for public messages */}
              <div
                ref={publicChatRef}
                style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  marginBottom: '16px',
                  background: '#fff',
                  padding: '8px',
                  borderRadius: '8px',
                }}
              >
                <List
                  itemLayout="horizontal"
                  dataSource={publicChatList}
                  renderItem={(chatItem, index) => (
                    <List.Item
                      key={index}
                      style={{
                        backgroundColor: '#fefefe',
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
                            <span
                              style={{ fontSize: '12px', color: '#888' }}
                            >
                              {chatItem.timestamp}
                            </span>
                          </div>
                        }
                        description={chatItem.text}
                      />
                    </List.Item>
                  )}
                />
              </div>

              <div style={{ display: 'flex' }}>
                <Input
                  placeholder="Type your public message..."
                  style={{ marginRight: '8px' }}
                  value={publicMessage}
                  onChange={(e) => setPublicMessage(e.target.value)}
                />
                <Button type="primary" onClick={handleSendPublicMessage}>
                  Send
                </Button>
              </div>
            </div>

            {/* Right side: Private Chat */}
            <div style={{ flex: '1' }}>
              {selectedUser ? (
                <>
                  <Title level={4}>Private Chat with {selectedUser}</Title>
                  {/* Scrollable container for private messages */}
                  <div
                    ref={privateChatRef}
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      marginBottom: '16px',
                      background: '#fff',
                      padding: '8px',
                      borderRadius: '8px',
                    }}
                  >
                    <List
                      itemLayout="horizontal"
                      dataSource={privateMessagesWithSelected}
                      renderItem={(msg, idx) => (
                        <List.Item
                          key={idx}
                          style={{
                            backgroundColor: '#fefefe',
                            borderRadius: '8px',
                            marginBottom: '8px',
                            padding: '10px',
                          }}
                        >
                          <List.Item.Meta
                            avatar={
                              <Avatar style={{ backgroundColor: '#1890ff' }}>
                                {msg.from.charAt(0).toUpperCase()}
                              </Avatar>
                            }
                            title={
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span>{msg.from}</span>
                                <span
                                  style={{ fontSize: '12px', color: '#888' }}
                                >
                                  {msg.timestamp}
                                </span>
                              </div>
                            }
                            description={msg.text}
                          />
                        </List.Item>
                      )}
                    />
                  </div>

                  <div style={{ display: 'flex' }}>
                    <Input
                      placeholder={`Message @${selectedUser}`}
                      style={{ marginRight: '8px' }}
                      value={privateMessage}
                      onChange={(e) => setPrivateMessage(e.target.value)}
                    />
                    <Button type="primary" onClick={handleSendPrivateMessage}>
                      Send
                    </Button>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: '8px',
                    minHeight: '300px',
                    padding: '16px',
                  }}
                >
                  <Text>Select a user to start a private chat</Text>
                </div>
              )}
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

      {/* Modal for new username */}
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
