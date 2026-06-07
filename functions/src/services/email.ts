import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!resendClient) {
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendClient = new Resend(resendApiKey);
  }
  return resendClient;
}

interface SendInterviewInviteParams {
  candidateEmail: string;
  candidateName: string;
  meetLink: string;
  jobTitle: string;
  scheduledTime: string;
  organizationName?: string;
}

export async function sendInterviewInviteEmail(params: SendInterviewInviteParams) {
  const client = getResendClient();

  const {
    candidateEmail,
    candidateName,
    meetLink,
    jobTitle,
    scheduledTime,
    organizationName = 'HireAI',
  } = params;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table style="max-width: 560px; width: 100%; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="padding: 32px 32px 0;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #d946ef); border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
            <span style="color: white; font-size: 24px; font-weight: 800;">H</span>
          </div>
          <h1 style="font-size: 22px; font-weight: 800; color: #111827; margin: 0; letter-spacing: -0.02em;">You're Invited to Interview</h1>
          <p style="font-size: 14px; color: #6b7280; margin: 8px 0 0;">with <strong style="color: #111827;">${organizationName}</strong></p>
        </div>
      </td></tr>
      <tr><td style="padding: 0 32px;">
        <div style="background: #f3f4f6; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 16px; font-size: 15px; color: #374151; line-height: 1.6;">
            Hi <strong>${candidateName}</strong>,
          </p>
          <p style="margin: 0 0 16px; font-size: 15px; color: #374151; line-height: 1.6;">
            You have been invited to interview for the position of <strong>${jobTitle}</strong>.
            This interview will be conducted via Google Meet with our AI interviewer.
          </p>
          <div style="background: #ffffff; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
            <p style="margin: 0 0 6px; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">Meeting Details</p>
            <p style="margin: 0; font-size: 14px; color: #111827; font-weight: 600;"><span style="color: #6366f1;">Meeting Link:</span> <a href="${meetLink}" style="color: #6366f1;">${meetLink}</a></p>
            <p style="margin: 4px 0 0; font-size: 14px; color: #111827; font-weight: 600;"><span style="color: #6366f1;">Scheduled:</span> ${scheduledTime}</p>
          </div>
          <p style="margin: 0 0 6px; font-size: 13px; color: #6b7280;">
            Please join the meeting at your scheduled time. The AI interviewer will guide you through the process.
            Make sure you have a working microphone and camera.
          </p>
        </div>
      </td></tr>
      <tr><td style="padding: 0 32px 32px; text-align: center;">
        <a href="${meetLink}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6366f1, #d946ef); color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; box-shadow: 0 4px 14px rgba(99,102,241,0.35);">Join Google Meet</a>
        <p style="margin: 16px 0 0; font-size: 12px; color: #9ca3af;">No account needed. Click the link to join.</p>
      </td></tr>
      <tr><td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Powered by <strong style="color: #6366f1;">HireAI</strong> &mdash; Autonomous Talent Orchestration</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

  const { data, error } = await client.emails.send({
    from: `HireAI <${process.env.RESEND_FROM_EMAIL || 'noreply@hireai.dev'}>`,
    to: candidateEmail,
    subject: `Interview Invitation: ${jobTitle} - ${organizationName}`,
    html,
  });

  if (error) {
    console.error('[Email Service] Failed to send interview invite:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log(`[Email Service] Interview invite sent to ${candidateEmail}: ${data?.id}`);
  return { success: true, emailId: data?.id };
}

interface SendThankYouParams {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  organizationName?: string;
}

export async function sendThankYouEmail(params: SendThankYouParams) {
  const client = getResendClient();

  const {
    candidateEmail,
    candidateName,
    jobTitle,
    organizationName = 'HireAI',
  } = params;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table style="max-width: 560px; width: 100%; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="padding: 32px 32px 0; text-align: center;">
        <div style="width: 64px; height: 64px; background: #d1fae5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <span style="font-size: 32px;">&#10003;</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 800; color: #111827; margin: 0;">Thank You!</h1>
        <p style="font-size: 15px; color: #6b7280; margin: 8px 0 0;">Your interview has been completed.</p>
      </td></tr>
      <tr><td style="padding: 24px 32px 32px;">
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 16px;">
          Hi <strong>${candidateName}</strong>,
        </p>
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
          Thank you for taking the time to interview for the <strong>${jobTitle}</strong> position with <strong>${organizationName}</strong>.
        </p>
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
          We truly appreciate your participation. Our team will review your interview and get back to you with next steps shortly.
        </p>
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0;">
          If you have any questions in the meantime, please don't hesitate to reach out.
        </p>
      </td></tr>
      <tr><td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Powered by <strong style="color: #6366f1;">HireAI</strong></p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

  const { data, error } = await client.emails.send({
    from: `HireAI <${process.env.RESEND_FROM_EMAIL || 'noreply@hireai.dev'}>`,
    to: candidateEmail,
    subject: `Thank You for Interviewing with ${organizationName}`,
    html,
  });

  if (error) {
    console.error('[Email Service] Failed to send thank-you email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log(`[Email Service] Thank-you email sent to ${candidateEmail}: ${data?.id}`);
  return { success: true, emailId: data?.id };
}

interface SendDecisionLetterParams {
  candidateEmail: string;
  candidateName: string;
  jobTitle: string;
  decision: 'offer' | 'rejection';
  organizationName?: string;
  offerDetails?: string;
}

export async function sendDecisionLetter(params: SendDecisionLetterParams) {
  const client = getResendClient();

  const {
    candidateEmail,
    candidateName,
    jobTitle,
    decision,
    organizationName = 'HireAI',
    offerDetails,
  } = params;

  const isOffer = decision === 'offer';
  const subject = isOffer
    ? `Offer from ${organizationName} - ${jobTitle}`
    : `Update on your application for ${jobTitle} - ${organizationName}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table style="max-width: 560px; width: 100%; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
      <tr><td style="padding: 32px 32px 0; text-align: center;">
        <div style="width: 64px; height: 64px; ${isOffer ? 'background: #d1fae5;' : 'background: #fee2e2;'} border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          <span style="font-size: 32px;">${isOffer ? '&#10003;' : '&#9679;'}</span>
        </div>
        <h1 style="font-size: 22px; font-weight: 800; color: #111827; margin: 0;">${isOffer ? 'Congratulations!' : 'Application Update'}</h1>
      </td></tr>
      <tr><td style="padding: 24px 32px 32px;">
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 16px;">
          Hi <strong>${candidateName}</strong>,
        </p>
        ${isOffer ? `
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
          We are delighted to inform you that we would like to extend an offer for the <strong>${jobTitle}</strong> position at <strong>${organizationName}</strong>!
        </p>
        ${offerDetails ? `<div style="background: #f3f4f6; border-radius: 10px; padding: 16px; margin-bottom: 16px;"><p style="margin: 0; font-size: 14px; color: #374151; white-space: pre-wrap;">${offerDetails}</p></div>` : ''}
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
          A member of our team will be in touch shortly to discuss the next steps and details.
        </p>
        ` : `
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
          Thank you for your interest in the <strong>${jobTitle}</strong> position at <strong>${organizationName}</strong> and for taking the time to interview with us.
        </p>
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
          After careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.
        </p>
        <p style="font-size: 15px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
          We sincerely appreciate your effort and wish you the best in your job search.
        </p>
        `}
      </td></tr>
      <tr><td style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">Powered by <strong style="color: #6366f1;">HireAI</strong></p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

  const { data, error } = await client.emails.send({
    from: `HireAI <${process.env.RESEND_FROM_EMAIL || 'noreply@hireai.dev'}>`,
    to: candidateEmail,
    subject,
    html,
  });

  if (error) {
    console.error('[Email Service] Failed to send decision letter:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }

  console.log(`[Email Service] Decision letter (${decision}) sent to ${candidateEmail}: ${data?.id}`);
  return { success: true, emailId: data?.id };
}
