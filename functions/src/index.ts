import { initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';

setGlobalOptions({
  region: 'us-central1',
  memory: '512MiB',
  timeoutSeconds: 120,
});

initializeApp();

const db = getFirestore();

// Export all services
export * from './services/email.js';

// Export all webhooks
export * from './webhooks/stripe.js';

// Export all API endpoints
export * from './api/generateInterview.js';
export * from './api/meetingBotProxy.js';

// RBAC Custom Claims Management
export const setUserClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Authentication required');
  }

  const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
  const isAdmin = adminDoc.exists;

  if (!isAdmin) {
    throw new Error('Only super admins can manage user claims');
  }

  const { uid, role, organizationId } = request.data;

  if (!uid || !role) {
    throw new Error('uid and role are required');
  }

  if (!['admin', 'recruiter', 'candidate'].includes(role)) {
    throw new Error('Invalid role. Must be admin, recruiter, or candidate');
  }

  try {
    const auth = await import('firebase-admin/auth');
    await auth.getAuth().setCustomUserClaims(uid, {
      role,
      orgId: organizationId || null,
    });

    await db.collection('users').doc(uid).update({
      role,
      organizationId: organizationId || null,
      claimsUpdatedAt: new Date().toISOString(),
    });

    console.log(`[RBAC] Claims set for user ${uid}: role=${role}, orgId=${organizationId}`);

    return { success: true };
  } catch (error) {
    console.error('[RBAC] Failed to set claims:', error);
    throw new Error(`Failed to set user claims: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Organization Seat Management
export const incrementSeatUsage = onDocumentCreated(
  'users/{userId}',
  async (event) => {
    if (!event.data) return;
    const userData = event.data.data();
    if (!userData?.organizationId) return;

    const orgRef = db.collection('organizations').doc(userData.organizationId);
    const orgDoc = await orgRef.get();

    if (!orgDoc.exists) return;

    const orgData = orgDoc.data();
    const currentMembers = orgData?.memberCount || 0;
    const seatCount = orgData?.seatCount || 5;

    if (currentMembers >= seatCount) {
      console.warn(`[Seats] Organization ${userData.organizationId} has reached seat limit (${currentMembers}/${seatCount})`);
      await db.collection('notifications').add({
        type: 'seat_limit_reached',
        organizationId: userData.organizationId,
        message: `Your organization has reached its seat limit of ${seatCount}. Please upgrade to add more members.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }

    await orgRef.update({
      memberCount: currentMembers + 1,
      updatedAt: new Date().toISOString(),
    });
  }
);

export const decrementSeatUsage = onDocumentUpdated(
  'users/{userId}',
  async (event) => {
    if (!event.data) return;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (beforeData?.organizationId && beforeData.organizationId !== afterData?.organizationId) {
      const orgRef = db.collection('organizations').doc(beforeData.organizationId);
      await orgRef.update({
        memberCount: Math.max(0, (beforeData.memberCount || 1) - 1),
        updatedAt: new Date().toISOString(),
      });
    }
  }
);

// Nuclear Reset for Super Admin
export const nuclearReset = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Authentication required');
  }

  const adminDoc = await db.collection('admins').doc(request.auth.uid).get();
  if (!adminDoc.exists) {
    throw new Error('Only super admins can perform nuclear reset');
  }

  const { organizationId, confirmation } = request.data;

  if (!organizationId || !confirmation) {
    throw new Error('organizationId and confirmation are required');
  }

  const orgDoc = await db.collection('organizations').doc(organizationId).get();
  if (!orgDoc.exists) {
    throw new Error('Organization not found');
  }

  const orgData = orgDoc.data();
  if (confirmation !== orgData?.name) {
    throw new Error(`Confirmation text must match the organization name exactly: "${orgData?.name}"`);
  }

  console.log(`[Nuclear Reset] Starting reset for organization ${organizationId} (${orgData?.name})`);

  const promises: Promise<void>[] = [];

  promises.push(
    db.collection('jobs').where('organizationId', '==', organizationId).get().then((snap) => {
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      batch.commit();
    })
  );

  promises.push(
    db.collection('candidates').where('organizationId', '==', organizationId).get().then((snap) => {
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      batch.commit();
    })
  );

  promises.push(
    db.collection('users').where('organizationId', '==', organizationId).get().then((snap) => {
      const batch = db.batch();
      snap.docs.forEach((doc) => {
        batch.update(doc.ref, {
          organizationId: null,
          role: 'recruiter',
          credits: 0,
        });
      });
      batch.commit();
    })
  );

  await Promise.allSettled(promises);

  await orgDoc.ref.update({
    memberCount: 0,
    jobCount: 0,
    candidateCount: 0,
    status: 'active',
    resetAt: new Date().toISOString(),
    resetBy: request.auth.uid,
  });

  console.log(`[Nuclear Reset] Completed for organization ${organizationId}`);

  return { success: true, message: `Organization "${orgData?.name}" has been reset` };
});

// Health check endpoint
export const healthCheck = onCall(async () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };
});
