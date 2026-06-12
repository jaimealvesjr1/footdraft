import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCGekU3GD6UC2FT2o4jVRsL7yJgJeWzbTM",
  authDomain: "footdraftbr.firebaseapp.com",
  projectId: "footdraftbr",
  storageBucket: "footdraftbr.firebasestorage.app",
  messagingSenderId: "1033776162956",
  appId: "1:1033776162956:web:dc38245e49d851fee5b3a9"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
