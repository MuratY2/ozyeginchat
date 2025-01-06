// App.js
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

// -------------------
// Helper functions
// -------------------
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function exportPublicKey(pubKey) {
  const spki = await window.crypto.subtle.exportKey('spki', pubKey);
  return arrayBufferToBase64(spki);
}

async function importPublicKey(base64Key) {
  const buffer = base64ToArrayBuffer(base64Key);
  return window.crypto.subtle.importKey(
    'spki',
    buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
}

async function exportPrivateKey(privKey) {
  const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', privKey);
  return arrayBufferToBase64(pkcs8);
}

async function importPrivateKey(base64Key) {
  const buffer = base64ToArrayBuffer(base64Key);
  return window.crypto.subtle.importKey(
    'pkcs8',
    buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );
}

async function encryptRSA(publicKey, plaintext) {
  const enc = new TextEncoder();
  const encoded = enc.encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    encoded
  );
  return arrayBufferToBase64(ciphertext);
}

async function decryptRSA(privateKey, base64Cipher) {
  const cipherArrayBuffer = base64ToArrayBuffer(base64Cipher);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    cipherArrayBuffer
  );
  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

function App() {
  // Firebase auth
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
  const publicChatRef = useRef(null);

  // Private chat (two-ciphertext approach)
  const [privateChatList, setPrivateChatList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [privateMessage, setPrivateMessage] = useState('');
  const privateChatRef = useRef(null);

  // E2EE keys
  const [publicKey, setPublicKey] = useState(null);   
  const [privateKey, setPrivateKey] = useState(null); 
  const [cachedPubKeys, setCachedPubKeys] = useState({}); 

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // ---------------------------------------------------
  // 1) Firebase Auth Listener
  // ---------------------------------------------------
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        // Check Firestore for username
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', currentUser.email));
        const querySnap = await getDocs(q);

        if (querySnap.empty) {
          setShowUsernameModal(true);
        } else {
          const docData = querySnap.docs[0].data();
          setUsername(docData.username);
        }
      } else {
        setUsername('');
      }
    });
    return () => unsubscribe();
  }, []);

  // ---------------------------------------------------
  // 2) Load or Generate RSA Key Pair (localStorage)
  // ---------------------------------------------------
  useEffect(() => {
    async function initKeys() {
      try {
        const storedPub = localStorage.getItem('myPubKey');
        const storedPriv = localStorage.getItem('myPrivKey');

        if (storedPub && storedPriv) {
          // Import them
          const importedPub = await importPublicKey(storedPub);
          const importedPriv = await importPrivateKey(storedPriv);
          setPublicKey(importedPub);
          setPrivateKey(importedPriv);
          console.log('Loaded existing RSA keys from localStorage');
        } else {
          // Generate new pair
          console.log('Generating new RSA key pair...');
          const keyPair = await window.crypto.subtle.generateKey(
            {
              name: 'RSA-OAEP',
              modulusLength: 2048,
              publicExponent: new Uint8Array([1, 0, 1]),
              hash: 'SHA-256',
            },
            true,
            ['encrypt', 'decrypt']
          );
          setPublicKey(keyPair.publicKey);
          setPrivateKey(keyPair.privateKey);

          // Export & store
          const pubB64 = await exportPublicKey(keyPair.publicKey);
          const privB64 = await exportPrivateKey(keyPair.privateKey);
          localStorage.setItem('myPubKey', pubB64);
          localStorage.setItem('myPrivKey', privB64);
          console.log('Generated & stored new RSA key pair');
        }
      } catch (err) {
        console.error('Key init error:', err);
      }
    }
    initKeys();
  }, []);

  // ---------------------------------------------------
  // 3) Connect WebSocket once we have user, username, keys
  // ---------------------------------------------------
  useEffect(() => {
    if (!user || !username || !publicKey || !privateKey) return;

    const socket = new WebSocket('https://828a-178-237-51-195.ngrok-free.app');
    // For production: use wss://<your-ngrok-url> if needed

    socket.onopen = async () => {
      console.log('WebSocket connected.');

      // 1) register-username
      socket.send(JSON.stringify({
        type: 'register-username',
        username: username
      }));

      // 2) register-publickey
      const pubB64 = await exportPublicKey(publicKey);
      socket.send(JSON.stringify({
        type: 'register-publickey',
        username: username,
        publicKey: pubB64
      }));
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      // a) init-public
      if (data.type === 'init-public') {
        setPublicChatList(data.messages);
      }
      // b) new public message (plaintext)
      else if (data.type === 'public-chat') {
        setPublicChatList((prev) => [...prev, data.message]);
      }
      // c) init-private => includes two ciphertext fields
      else if (data.type === 'init-private') {
        const decryptedAll = [];
        for (let pm of data.messages) {
          // We'll store a local copy to not mutate pm
          let localCopy = { ...pm };
          // If I'm the recipient, decrypt text_for_recipient
          if (pm.to === username) {
            try {
              const plain = await decryptRSA(privateKey, pm.text_for_recipient);
              localCopy.text_for_recipient = plain;
            } catch {}
          }
          // If I'm the sender, decrypt text_for_sender
          if (pm.from === username) {
            try {
              const plain = await decryptRSA(privateKey, pm.text_for_sender);
              localCopy.text_for_sender = plain;
            } catch {}
          }
          decryptedAll.push(localCopy);
        }
        setPrivateChatList(decryptedAll);
      }
      // d) private-chat => a new message with 2 ciphertext fields
      else if (data.type === 'private-chat') {
        const pm = data.message;
        let localCopy = { ...pm };

        if (pm.to === username) {
          try {
            const plain = await decryptRSA(privateKey, pm.text_for_recipient);
            localCopy.text_for_recipient = plain;
          } catch {
            console.log('Could not decrypt text_for_recipient');
          }
        }
        if (pm.from === username) {
          try {
            const plain = await decryptRSA(privateKey, pm.text_for_sender);
            localCopy.text_for_sender = plain;
          } catch {
            console.log('Could not decrypt text_for_sender');
          }
        }
        setPrivateChatList((prev) => [...prev, localCopy]);
      }
      // e) response-publickey => the server gives me someone's pub key
      else if (data.type === 'response-publickey') {
        const otherUser = data.username;
        const pubKeyB64 = data.publicKey;
        if (pubKeyB64) {
          const imported = await importPublicKey(pubKeyB64);
          setCachedPubKeys((prev) => ({ ...prev, [otherUser]: imported }));
          console.log(`Fetched & cached public key of ${otherUser}`);
        } else {
          console.log(`No public key found for ${otherUser}`);
        }
      }
    };

    socket.onclose = () => {
      console.log('WebSocket closed.');
    };
    socket.onerror = (err) => {
      console.error('WebSocket error:', err);
    };

    setWs(socket);
    return () => {
      socket.close();
    };
  }, [user, username, publicKey, privateKey]);

  // ---------------------------------------------------
  // 4) Auto-scroll to bottom on new messages
  // ---------------------------------------------------
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

  // ---------------------------------------------------
  // 5) Google Auth
  // ---------------------------------------------------
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

  // ---------------------------------------------------
  // 6) Username Flow
  // ---------------------------------------------------
  const handleCreateUsername = async () => {
    if (!newUsername.trim()) return;
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

  // ---------------------------------------------------
  // 7) Public Chat (plaintext)
  // ---------------------------------------------------
  const handleSendPublicMessage = () => {
    if (!ws || !publicMessage.trim()) return;
    ws.send(JSON.stringify({
      type: 'public-chat',
      username: username,
      text: publicMessage.trim()
    }));
    setPublicMessage('');
  };

  // ---------------------------------------------------
  // 8) Private Chat with Two Ciphertexts
  // ---------------------------------------------------
  const handleSendPrivateMessage = async () => {
    if (!ws || !selectedUser || !privateMessage.trim()) return;

    // 1) Check if we have recipient's key
    let theirKey = cachedPubKeys[selectedUser];
    if (!theirKey) {
      alert(`No public key for user: ${selectedUser}. Try re-selecting them.`);
      return;
    }

    try {
      // 2) Encrypt for recipient
      const cipher_for_recipient = await encryptRSA(theirKey, privateMessage.trim());

      // 3) Encrypt for sender (myself), using my own public key
      const cipher_for_sender = await encryptRSA(publicKey, privateMessage.trim());

      // 4) Send both fields
      ws.send(JSON.stringify({
        type: 'private-chat',
        from: username,
        to: selectedUser,
        text_for_recipient: cipher_for_recipient,
        text_for_sender: cipher_for_sender
      }));

      // Clear input
      setPrivateMessage('');
    } catch (err) {
      console.error('Encryption error:', err);
    }
  };

  // We display whichever field we can decrypt in the UI
  // For convenience, let's unify them as "displayText" in the render
  const privateMessagesWithSelected = privateChatList.filter((pm) =>
    (pm.from === username && pm.to === selectedUser) ||
    (pm.to === username && pm.from === selectedUser)
  );

  function getDisplayText(pm) {
    // If I'm the sender, show text_for_sender if it exists
    if (pm.from === username) {
      return pm.text_for_sender || '...cipher...';
    }
    // If I'm the recipient, show text_for_recipient if it exists
    if (pm.to === username) {
      return pm.text_for_recipient || '...cipher...';
    }
    // else not my message
    return '...cipher...';
  }

  // ---------------------------------------------------
  // 9) Search for users & fetch their key
  // ---------------------------------------------------
  const handleSearch = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (!val.trim()) {
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
      const snap = await getDocs(q);

      const results = [];
      snap.forEach((doc) => {
        const d = doc.data();
        if (d.username !== username) {
          results.push(d);
        }
      });

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    }
  };

  // When we pick a user, request their pubkey
  const handleSelectUser = (uname) => {
    setSelectedUser(uname);
    setSearchResults([]);
    setSearchQuery('');

    if (!cachedPubKeys[uname] && ws) {
      ws.send(JSON.stringify({
        type: 'request-publickey',
        from: username,
        forUser: uname
      }));
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{
        backgroundColor: '#075E54',
        padding: '0 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
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
          <div style={{
            maxWidth: '400px',
            margin: '0 auto',
            padding: '16px',
            background: '#fff',
            borderRadius: '8px',
            boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
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
            {/* Left side: search + public chat */}
            <div style={{ flex: 1 }}>
              <div style={{ position: 'relative' }}>
                <Input
                  placeholder="Search users by username..."
                  prefix={<SearchOutlined />}
                  style={{ marginBottom: '16px', borderRadius: '8px' }}
                  value={searchQuery}
                  onChange={handleSearch}
                />
                {searchResults.length > 0 && (
                  <div style={{
                    position: 'absolute',
                    top: '50px',
                    left: 0,
                    width: '100%',
                    background: '#fff',
                    border: '1px solid #ccc',
                    borderRadius: '8px',
                    zIndex: 10
                  }}>
                    {searchResults.map((res, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '8px',
                          cursor: 'pointer',
                          borderBottom: '1px solid #eee'
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
              <div
                ref={publicChatRef}
                style={{
                  maxHeight: '300px',
                  overflowY: 'auto',
                  marginBottom: '16px',
                  background: '#fff',
                  padding: '8px',
                  borderRadius: '8px'
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
                        padding: '10px'
                      }}
                    >
                      <List.Item.Meta
                        avatar={
                          <Avatar style={{ backgroundColor: '#87d068' }}>
                            {chatItem.username?.charAt(0).toUpperCase()}
                          </Avatar>
                        }
                        title={
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between'
                          }}>
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
              </div>

              <div style={{ display: 'flex' }}>
                <Input
                  placeholder="Type a public message..."
                  style={{ marginRight: '8px' }}
                  value={publicMessage}
                  onChange={(e) => setPublicMessage(e.target.value)}
                />
                <Button type="primary" onClick={handleSendPublicMessage}>
                  Send
                </Button>
              </div>
            </div>

            {/* Right side: private chat (two-ciphertext) */}
            <div style={{ flex: 1 }}>
              {selectedUser ? (
                <>
                  <Title level={4}>Private Chat with {selectedUser}</Title>
                  <div
                    ref={privateChatRef}
                    style={{
                      maxHeight: '300px',
                      overflowY: 'auto',
                      marginBottom: '16px',
                      background: '#fff',
                      padding: '8px',
                      borderRadius: '8px'
                    }}
                  >
                    <List
                      itemLayout="horizontal"
                      dataSource={privateMessagesWithSelected}
                      renderItem={(msg, idx) => {
                        const displayText = getDisplayText(msg);
                        return (
                          <List.Item
                            key={idx}
                            style={{
                              backgroundColor: '#fefefe',
                              borderRadius: '8px',
                              marginBottom: '8px',
                              padding: '10px'
                            }}
                          >
                            <List.Item.Meta
                              avatar={
                                <Avatar style={{ backgroundColor: '#1890ff' }}>
                                  {msg.from.charAt(0).toUpperCase()}
                                </Avatar>
                              }
                              title={
                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between'
                                }}>
                                  <span>{msg.from}</span>
                                  <span style={{ fontSize: '12px', color: '#888' }}>
                                    {msg.timestamp}
                                  </span>
                                </div>
                              }
                              description={displayText}
                            />
                          </List.Item>
                        );
                      }}
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
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '8px',
                  minHeight: '300px',
                  padding: '16px'
                }}>
                  <Text>Select a user to start a private chat</Text>
                </div>
              )}
            </div>
          </div>
        )}
      </Content>

      <Footer style={{
        textAlign: 'center',
        backgroundColor: '#075E54',
        color: '#fff'
      }}>
        OzyeginChat ©2024
      </Footer>

      {/* Modal for creating username */}
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
