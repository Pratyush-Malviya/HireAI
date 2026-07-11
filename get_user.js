import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin
const app = admin.initializeApp({
  projectId: 'gen-lang-client-0904823075'
});

const db = getFirestore(app, 'ai-studio-21348cef-37c9-4a71-98ec-b3379889bf68');

async function run() {
  console.log("Querying users...");
  const usersSnap = await db.collection('users')
    .where('email', '==', 'malviya.pratyush26@gmail.com')
    .get();
  
  if (usersSnap.empty) {
    console.log("No user found with email malviya.pratyush26@gmail.com");
  } else {
    usersSnap.forEach(doc => {
      console.log(`User Doc ID (UID): ${doc.id}`);
      console.log("User Data:", JSON.stringify(doc.data(), null, 2));
    });
  }

  console.log("Querying admins...");
  const adminsSnap = await db.collection('admins')
    .where('email', '==', 'malviya.pratyush26@gmail.com')
    .get();
  
  if (adminsSnap.empty) {
    console.log("No admin found in admins collection.");
  } else {
    adminsSnap.forEach(doc => {
      console.log(`Admin Doc ID (UID): ${doc.id}`);
      console.log("Admin Data:", JSON.stringify(doc.data(), null, 2));
    });
  }
}

run().catch(console.error);
