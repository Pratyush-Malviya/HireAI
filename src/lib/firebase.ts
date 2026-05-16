import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with persistence
// We use a try-catch because persistentLocalCache can fail in certain environments (like some private modes or restricted contexts)
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ 
      tabManager: persistentMultipleTabManager(),
    }),
  }, firebaseConfig.firestoreDatabaseId);
} catch (error) {
  console.warn("Firestore persistence failed to initialize, falling back to memory cache:", error);
  firestore = initializeFirestore(app, {}, firebaseConfig.firestoreDatabaseId);
}

export const db = firestore;
export const auth = getAuth(app);
