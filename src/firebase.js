import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCeXYzZPfXQZS_8EdSQujMzC8o4GBvMID0",
  authDomain: "ozyeginchat.firebaseapp.com",
  projectId: "ozyeginchat",
  storageBucket: "ozyeginchat.appspot.com", 
  messagingSenderId: "246402583164",
  appId: "1:246402583164:web:dcdacce93f985b227a57f9",
  measurementId: "G-DYFGKTKF0V",
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const firestore = getFirestore(app);
const analytics = getAnalytics(app);
const googleProvider = new GoogleAuthProvider();

export { app, auth, firestore, analytics, googleProvider };
