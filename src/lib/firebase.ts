import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistence
// We use a try-catch because persistentLocalCache can fail in certain environments (like some private modes or restricted contexts)
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ 
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (error) {
  console.warn("Firestore persistence failed to initialize, falling back to memory cache:", error);
  firestore = initializeFirestore(app, {});
}

export const db = firestore;
let firebaseAuth;
try {
  firebaseAuth = getAuth(app);
} catch (error) {
  console.error("Firebase Auth failed to initialize. Please check your VITE_FIREBASE_API_KEY in .env.local:", error);
  // Provide a dummy proxy to prevent immediate crashes if auth is used, or let it be null.
  // We'll export null so the app can at least render the ErrorBoundary or offline state.
  firebaseAuth = null;
}

export const auth = firebaseAuth;
