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

const isConfigured = !!firebaseConfig.projectId && !!firebaseConfig.apiKey;
const app = isConfigured ? initializeApp(firebaseConfig) : ({} as any);

// The Firestore database ID for this project (named database, not the default)
const FIRESTORE_DATABASE_ID = 'ai-studio-21348cef-37c9-4a71-98ec-b3379889bf68';

// Initialize Firestore with persistence
// We use a try-catch because persistentLocalCache can fail in certain environments (like some private modes or restricted contexts)
let firestore: any;
if (isConfigured) {
  try {
    firestore = initializeFirestore(app, {
      localCache: persistentLocalCache({ 
        tabManager: persistentMultipleTabManager(),
      }),
    }, FIRESTORE_DATABASE_ID);
  } catch (error) {
    console.warn("Firestore persistence failed to initialize, falling back to memory cache:", error);
    firestore = initializeFirestore(app, {}, FIRESTORE_DATABASE_ID);
  }
} else {
  firestore = { isDummy: true };
}

export const db = firestore;
let firebaseAuth: any;
if (isConfigured) {
  try {
    firebaseAuth = getAuth(app);
  } catch (error) {
    console.error("Firebase Auth failed to initialize. Please check your VITE_FIREBASE_API_KEY in .env.local:", error);
    // Provide a dummy proxy to prevent immediate crashes if auth is used.
    firebaseAuth = { currentUser: null, isDummy: true };
  }
} else {
  firebaseAuth = { currentUser: null, isDummy: true };
}

export const auth = firebaseAuth;
