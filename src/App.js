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

/** 
 * Convert array buffer to base64 string 
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Convert base64 string to array buffer
 */
function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Export a public key as base64 (SPKI)
 */
async function exportPublicKey(pubKey) {
  const spki = await window.crypto.subtle.exportKey('spki', pubKey);
  return arrayBufferToBase64(spki);
}

/**
 * Import a public key from base64 (SPKI)
 */
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

/**
 * Export a private key as base64 (PKCS8)
 */
async function exportPrivateKey(privKey) {
  const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', privKey);
  return arrayBufferToBase64(pkcs8);
}

/**
 * Import a private key from base64 (PKCS8)
 */
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

/**
 * Encrypt plaintext using someone’s public key
 */
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

/**
 * Decrypt ciphertext using our private key
 */
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
  // Firebase
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

  // Private chat
  const [privateChatList, setPrivateChatList] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [privateMessage, setPrivateMessage] = useState('');
  const privateChatRef = useRef(null);

  // Encryption keys
  const [publicKey, setPublicKey] = useState(null);   // CryptoKey
  const [privateKey, setPrivateKey] = useState(null); // CryptoKey
  const [cachedPubKeys, setCachedPubKeys] = useState({}); 
  // e.g., { alice: CryptoKey, bob: CryptoKey }

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  // ---------------------------
  // 1) Auth listener
  // ---------------------------
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

  // ---------------------------
  // 2) On mount, load or generate key pair
  //    We'll store them in localStorage so we don't lose them on refresh
  // ---------------------------
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
          console.log('Loaded RSA keys from localStorage');
        } else {
          // Generate a new key pair
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

          // Export & store in localStorage
          const pubB64 = await exportPublicKey(keyPair.publicKey);
          const privB64 = await exportPrivateKey(keyPair.privateKey);
          localStorage.setItem('myPubKey', pubB64);
          localStorage.setItem('myPrivKey', privB64);
          console.log('Generated and stored RSA key pair');
        }
      } catch (err) {
        console.error('Key initialization error:', err);
      }
    }
    initKeys();
  }, []);

  // ---------------------------
  // 3) Once user+username+publicKey+privateKey are all set, connect WS
  // ---------------------------
  useEffect(() => {
    if (!user || !username || !publicKey || !privateKey) {
      return;
    }

    const socket = new WebSocket('https://a7b2-178-237-51-195.ngrok-free.app');
    // If deploying via ngrok or HTTPS, use wss://<your-ngrok-url>

    socket.onopen = async () => {
      console.log('WebSocket connected.');

      // 1) register-username
      socket.send(
        JSON.stringify({
          type: 'register-username',
          username: username,
        })
      );

      // 2) register-publickey
      const exportedPub = await exportPublicKey(publicKey);
      socket.send(
        JSON.stringify({
          type: 'register-publickey',
          username: username,
          publicKey: exportedPub,
        })
      );
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      // a) init-public => load existing public messages
      if (data.type === 'init-public') {
        setPublicChatList(data.messages);
      }
      // b) public-chat => incoming plaintext
      else if (data.type === 'public-chat') {
        setPublicChatList((prev) => [...prev, data.message]);
      }
      // c) init-private => we have a bunch of ciphertext messages relevant to us
      else if (data.type === 'init-private') {
        const decryptedList = [];
        for (let pm of data.messages) {
          // If I'm the recipient, decrypt
          if (pm.to === username) {
            try {
              const plain = await decryptRSA(privateKey, pm.text);
              decryptedList.push({ ...pm, text: plain });
            } catch {
              // if decryption fails, keep ciphertext
              decryptedList.push(pm);
            }
          } else {
            // I'm the sender or not involved
            decryptedList.push(pm);
          }
        }
        setPrivateChatList(decryptedList);
      }
      // d) private-chat => new ciphertext for me or from me
      else if (data.type === 'private-chat') {
        const pm = data.message;
        // If I'm the recipient, decrypt
        if (pm.to === username) {
          try {
            const plain = await decryptRSA(privateKey, pm.text);
            pm.text = plain;
          } catch {
            console.log('Could not decrypt private message');
          }
        }
        setPrivateChatList((prev) => [...prev, pm]);
      }
      // e) response-publickey => server giving me someone else's pub key
      else if (data.type === 'response-publickey') {
        const otherUser = data.username;
        const pubKeyB64 = data.publicKey;
        if (pubKeyB64) {
          const imported = await importPublicKey(pubKeyB64);
          setCachedPubKeys((prev) => ({ ...prev, [otherUser]: imported }));
          console.log(`Cached public key of ${otherUser}`);
        } else {
          console.log(`No public key for ${otherUser}`);
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

  // ---------------------------
  // 4) Auto-scroll for public + private
  // ---------------------------
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

  // ---------------------------
  // 5) Google Login / Logout
  // ---------------------------
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

  // ---------------------------
  // 6) Create Username
  // ---------------------------
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

  // ---------------------------
  // 7) Public Chat (plaintext)
  // ---------------------------
  const handleSendPublicMessage = () => {
    if (!ws || publicMessage.trim() === '') return;
    ws.send(
      JSON.stringify({
        type: 'public-chat',
        username: username,
        text: publicMessage.trim(), // not encrypted
      })
    );
    setPublicMessage('');
  };

  // ---------------------------
  // 8) Private Chat (encrypted)
  // ---------------------------
  const handleSendPrivateMessage = async () => {
    if (!ws || !selectedUser || privateMessage.trim() === '') return;

    // Ensure we have the recipient's public key
    let theirKey = cachedPubKeys[selectedUser];
    if (!theirKey) {
      // Request from server
      ws.send(
        JSON.stringify({
          type: 'request-publickey',
          from: username,
          forUser: selectedUser,
        })
      );
      // We'll wait a bit for the response
      setTimeout(async () => {
        theirKey = cachedPubKeys[selectedUser];
        if (!theirKey) {
          alert("Could not fetch public key for " + selectedUser);
          return;
        }
        await encryptAndSend(theirKey);
      }, 500);
    } else {
      await encryptAndSend(theirKey);
    }

    setPrivateMessage('');
  };

  async function encryptAndSend(pubKey) {
    try {
      const cipher = await encryptRSA(pubKey, privateMessage.trim());
      ws.send(
        JSON.stringify({
          type: 'private-chat',
          from: username,
          to: selectedUser,
          text: cipher, // ciphertext
        })
      );
    } catch (err) {
      console.error('Encryption error:', err);
    }
  }

  const privateMessagesWithSelected = privateChatList.filter(
    (pm) =>
      (pm.from === username && pm.to === selectedUser) ||
      (pm.from === selectedUser && pm.to === username)
  );

  // ---------------------------
  // 9) Search for users
  // ---------------------------
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

  // Loading
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
          OzyeginChat (E2EE for Private)
        </Title>
        {user && (
          <Button type="primary" onClick={handleLogout}>
            Logout
          </Button>
        )}
      </Header>

      <Content style={{ padding: '16px', backgroundColor: '#EFEFEF' }}>
        {/* If not logged in, show login prompt */}
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

              <Title level={4}>Global Chat (Plaintext)</Title>
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
                  renderItem={(item, index) => (
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
                            {item.username.charAt(0).toUpperCase()}
                          </Avatar>
                        }
                        title={
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{item.username}</span>
                            <span style={{ fontSize: '12px', color: '#888' }}>
                              {item.timestamp}
                            </span>
                          </div>
                        }
                        description={item.text}
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

            {/* Right side: private chat (encrypted) */}
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
                                <span style={{ fontSize: '12px', color: '#888' }}>
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
