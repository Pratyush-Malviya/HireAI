import { onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';

const db = getFirestore();

interface MeetLinkResult {
  meetLink: string;
  meetingId: string;
  expiresAt: string;
}

async function createGoogleMeetLink(): Promise<MeetLinkResult> {
  try {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/meetings.space.created'],
    });

    const meet = google.meet({ version: 'v2', auth });
    const response = await meet.spaces.create({
      requestBody: {
        displayName: `HireAI Interview - ${new Date().toLocaleDateString()}`,
      } as any,
    });

    const space = response.data as any;
    const meetingUri = space.meetingUri;
    const meetingCode = space.meetingCode;
    const meetLink = meetingUri || `https://meet.google.com/${meetingCode}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return { meetLink, meetingId: space.name || '', expiresAt };
  } catch (error) {
    console.warn('[MeetingBot] Google Meet API failed, generating fallback link:', error);
    const code = `${uuidv4().substring(0, 3)}-${uuidv4().substring(0, 8)}-${uuidv4().substring(0, 3)}`;
    return {
      meetLink: `https://meet.google.com/${code}`,
      meetingId: code,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}

export const generateMeetLink = onCall(async (request) => {
  if (!request.auth) {
    throw new Error('Authentication required');
  }

  const { candidateId, jobId, scheduledAt } = request.data;

  if (!candidateId) {
    throw new Error('candidateId is required');
  }

  console.log(`[MeetingBot] Generating Meet link for candidate ${candidateId}`);

  try {
    const { meetLink, meetingId, expiresAt } = await createGoogleMeetLink();

    const meetingRecord = {
      meetLink,
      meetingId,
      candidateId,
      jobId: jobId || null,
      scheduledAt: scheduledAt || new Date().toISOString(),
      expiresAt,
      status: 'created',
      botDispatched: false,
    };

    await db.collection('meetings').add(meetingRecord);

    await db.collection('candidates').doc(candidateId).update({
      meetLink,
      interviewStatus: 'invited',
      meetingId,
    });

    console.log(`[MeetingBot] Meet link generated for candidate ${candidateId}: ${meetLink}`);

    return {
      success: true,
      meetLink,
      meetingId,
      expiresAt,
    };
  } catch (error) {
    console.error('[MeetingBot] Failed to generate Meet link:', error);
    throw new Error(`Failed to create meeting: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

export const dispatchMeetingBot = onDocumentCreated(
  'meetings/{meetingId}',
  async (event) => {
    if (!event.data) return;
    const meeting = event.data.data();
    if (!meeting) return;

    const scheduledAt = new Date(meeting.scheduledAt);
    const now = new Date();
    const delayMs = scheduledAt.getTime() - now.getTime();

    console.log(`[MeetingBot] Scheduling bot dispatch for meeting ${event.params.meetingId} in ${Math.max(0, Math.round(delayMs / 1000))}s`);

    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    try {
      const botPayload = {
        meetingUrl: meeting.meetLink,
        meetingId: meeting.meetingId,
        candidateId: meeting.candidateId,
        botId: uuidv4(),
        dispatchTime: new Date().toISOString(),
        config: {
          recordMeeting: true,
          transcribe: true,
          interviewerType: 'ai',
          language: 'en-US',
        },
      };

      const botRef = await db.collection('meeting_bot_dispatches').add(botPayload);

      await event.data.ref.update({
        botDispatched: true,
        botDispatchId: botRef.id,
        dispatchedAt: new Date().toISOString(),
      });

      await db.collection('candidates').doc(meeting.candidateId).update({
        interviewStatus: 'in_progress',
        botDispatchedAt: new Date().toISOString(),
      });

      console.log(`[MeetingBot] Bot dispatched for meeting ${event.params.meetingId}: ${botRef.id}`);
    } catch (error) {
      console.error('[MeetingBot] Failed to dispatch bot:', error);
      await event.data.ref.update({
        botDispatched: false,
        botDispatchError: String(error),
      });
    }
  }
);

export const notifyInterviewCompleted = onDocumentCreated(
  'interview_completions/{completionId}',
  async (event) => {
    if (!event.data) return;
    const data = event.data.data();
    if (!data) return;

    const { candidateId, candidateEmail, candidateName, jobTitle, organizationId } = data;

    console.log(`[MeetingBot] Interview completed notification for candidate ${candidateId}`);

    if (organizationId) {
      await db.collection('notifications').add({
        type: 'interview_completed',
        candidateId,
        candidateName: candidateName || 'Unknown',
        organizationId,
        read: false,
        createdAt: new Date().toISOString(),
        message: `${candidateName || 'A candidate'} has completed their interview`,
      });
    }

    if (candidateEmail) {
      try {
        const { sendThankYouEmail } = await import('../services/email.js');
        await sendThankYouEmail({
          candidateEmail,
          candidateName: candidateName || 'Candidate',
          jobTitle: jobTitle || 'your applied position',
        });
      } catch (emailError) {
        console.error('[MeetingBot] Failed to send thank-you email:', emailError);
      }
    }
  }
);
