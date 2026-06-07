import admin from 'firebase-admin';

async function updatePassword() {
  try {
    admin.initializeApp({
      projectId: "gen-lang-client-0904823075"
    });

    const userRecord = await admin.auth().getUserByEmail("malviya.pratyush26@gmail.com");
    await admin.auth().updateUser(userRecord.uid, {
      password: "Admin@123"
    });
    console.log("Successfully updated user password!");
  } catch (err) {
    console.error("Error updating user:", err);
  }
}

updatePassword();
