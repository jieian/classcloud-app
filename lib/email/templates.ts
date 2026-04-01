import resend from "./transporter";

const FROM = "ClassCloud <noreply@classcloudph.app>";

interface PasswordResetEmailParams {
  to: string;
  resetLink: string;
}

export async function sendPasswordResetEmail({
  to,
  resetLink,
}: PasswordResetEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset Your ClassCloud Password",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4EAE4A; margin: 0;">ClassCloud</h1>
        </div>

        <h2 style="color: #333;">Password Reset Request</h2>
        <p style="color: #555; font-size: 16px;">
          We received a request to reset your ClassCloud account password. Click the button below to set a new password:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #4EAE4A; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>

        <p style="color: #555; font-size: 14px;">
          If the button above doesn't work, copy and paste this link into your browser:
        </p>
        <p style="color: #4EAE4A; font-size: 13px; word-break: break-all;">${resetLink}</p>

        <p style="color: #e74c3c; font-size: 14px; font-weight: bold;">
          This link will expire shortly. If you did not request a password reset, you can safely ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from ClassCloud. Please do not reply to this email.
        </p>
      </div>
    `,
  });
}

interface VerificationEmailParams {
  to: string;
  verificationLink: string;
  firstName: string;
}

export async function sendVerificationEmail({
  to,
  verificationLink,
  firstName,
}: VerificationEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Verify Your ClassCloud Email",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4EAE4A; margin: 0;">ClassCloud</h1>
        </div>

        <h2 style="color: #333;">Hello, ${firstName}!</h2>
        <p style="color: #555; font-size: 16px;">
          Thank you for signing up. Please verify your email address by clicking the button below:
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="background-color: #4EAE4A; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: bold; display: inline-block;">
            Verify Email Address
          </a>
        </div>

        <p style="color: #555; font-size: 14px;">
          If the button above doesn't work, copy and paste this link into your browser:
        </p>
        <p style="color: #4EAE4A; font-size: 13px; word-break: break-all;">${verificationLink}</p>

        <p style="color: #555; font-size: 14px;">
          Once verified, your account will be reviewed by an administrator before you can log in.
        </p>

        <p style="color: #e74c3c; font-size: 14px; font-weight: bold;">
          If you did not create a ClassCloud account, you can safely ignore this email.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from ClassCloud. Please do not reply to this email.
        </p>
      </div>
    `,
  });
}

interface ApprovalEmailParams {
  to: string;
  firstName: string;
}

export async function sendApprovalEmail({
  to,
  firstName,
}: ApprovalEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your ClassCloud Account Has Been Approved",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4EAE4A; margin: 0;">ClassCloud</h1>
        </div>

        <h2 style="color: #333;">Hello, ${firstName}!</h2>
        <p style="color: #555; font-size: 16px;">
          Great news — your ClassCloud account has been reviewed and approved by an administrator.
          You can now log in and start using the platform.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from ClassCloud. Please do not reply to this email.
        </p>
      </div>
    `,
  });
}

interface RejectionEmailParams {
  to: string;
  firstName: string;
  reason: string;
}

export async function sendRejectionEmail({
  to,
  firstName,
  reason,
}: RejectionEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your ClassCloud Registration Has Been Rejected",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4EAE4A; margin: 0;">ClassCloud</h1>
        </div>

        <h2 style="color: #333;">Hello, ${firstName}!</h2>
        <p style="color: #555; font-size: 16px;">
          We regret to inform you that your ClassCloud registration request has been reviewed and rejected for the following reason:
        </p>

        <div style="background-color: #fff3f3; border-left: 4px solid #e74c3c; padding: 14px 18px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; color: #333; font-size: 15px;">${reason}</p>
        </div>

        <p style="color: #555; font-size: 14px;">
          If you believe this is a mistake, please contact your school administrator.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from ClassCloud. Please do not reply to this email.
        </p>
      </div>
    `,
  });
}

interface WelcomeEmailParams {
  to: string;
  firstName: string;
  lastName: string;
  password: string;
}

export async function sendWelcomeEmail({
  to,
  firstName,
  lastName,
  password,
}: WelcomeEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "Your ClassCloud Account Has Been Created",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4EAE4A; margin: 0;">ClassCloud</h1>
        </div>

        <h2 style="color: #333;">Welcome, ${firstName} ${lastName}!</h2>
        <p style="color: #555; font-size: 16px;">
          An account has been created for you on ClassCloud. Below are your login credentials:
        </p>

        <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 8px 0; font-size: 15px;">
            <strong>Email:</strong> ${to}
          </p>
          <p style="margin: 8px 0; font-size: 15px;">
            <strong>Password:</strong> ${password}
          </p>
        </div>

        <p style="color: #e74c3c; font-size: 14px; font-weight: bold;">
          Please change your password after your first login.
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #999; font-size: 12px; text-align: center;">
          This is an automated message from ClassCloud. Please do not reply to this email.
        </p>
      </div>
    `,
  });
}

// ─── Shared layout helpers (transfer request / direct move emails) ─────────────

const NOTIF_HEADER = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;"><div style="text-align: center; margin-bottom: 30px;"><h1 style="color: #4EAE4A; margin: 0;">ClassCloud</h1></div>`;
const NOTIF_FOOTER = `<hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" /><p style="color: #999; font-size: 12px; text-align: center;">This is an automated notification from ClassCloud. Please do not reply to this email.</p></div>`;

function infoBox(rows: { label: string; value: string }[]): string {
  const cells = rows
    .map(({ label, value }) => `<tr><td style="padding:5px 0;color:#666;font-size:13px;white-space:nowrap;padding-right:16px;vertical-align:top;">${label}</td><td style="padding:5px 0;color:#222;font-size:13px;font-weight:500;">${value}</td></tr>`)
    .join("");
  return `<div style="background-color:#f8f9fa;border:1px solid #e0e0e0;border-radius:6px;padding:16px 20px;margin:20px 0;"><table style="width:100%;border-collapse:collapse;">${cells}</table></div>`;
}

function ctaButton(label: string, href: string): string {
  return `<div style="text-align:center;margin:28px 0;"><a href="${href}" style="background-color:#4EAE4A;color:#ffffff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;display:inline-block;">${label}</a></div>`;
}

function notesBox(notes: string): string {
  return `<div style="background-color:#fff3f3;border-left:4px solid #e74c3c;padding:14px 18px;margin:20px 0;border-radius:4px;"><p style="margin:0;color:#333;font-size:14px;font-style:italic;">${notes}</p></div>`;
}

function emailDate(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ─── Transfer Request — Created ───────────────────────────────────────────────

export async function sendTransferRequestCreatedToFromAdviser({
  to,
  firstName,
  studentName,
  fromSection,
  toSection,
  requestedByName,
}: {
  to: string; firstName: string; studentName: string;
  fromSection: string; toSection: string; requestedByName: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Notice of Section Transfer Request — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">This is to inform you that a section transfer request has been submitted for one of your students. The request is currently pending administrator review.</p>${infoBox([{ label: "Student", value: studentName }, { label: "Current Section", value: fromSection }, { label: "Requested Section", value: toSection }, { label: "Requested By", value: requestedByName }, { label: "Date", value: emailDate() }])}<p style="color:#555;font-size:14px;">No further action is required from you at this time. You will be notified once a decision has been made.</p>${NOTIF_FOOTER}`,
  });
}

export async function sendTransferRequestCreatedToAdmin({
  to,
  firstName,
  studentName,
  fromSection,
  toSection,
  requestedByName,
  actionUrl,
}: {
  to: string; firstName: string; studentName: string;
  fromSection: string; toSection: string; requestedByName: string; actionUrl: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `New Section Transfer Request Requires Your Review — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">A new section transfer request has been submitted and requires your review and approval.</p>${infoBox([{ label: "Student", value: studentName }, { label: "From Section", value: fromSection }, { label: "To Section", value: toSection }, { label: "Requested By", value: requestedByName }, { label: "Date", value: emailDate() }])}${ctaButton("Review Request", actionUrl)}<p style="color:#555;font-size:14px;">Please log in to ClassCloud to approve or decline this request.</p>${NOTIF_FOOTER}`,
  });
}

// ─── Transfer Request — Approved ──────────────────────────────────────────────

export async function sendTransferRequestApprovedToRequester({
  to,
  firstName,
  studentName,
  fromSection,
  toSection,
}: {
  to: string; firstName: string; studentName: string;
  fromSection: string; toSection: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Section Transfer Approved — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">This is to inform you that your section transfer request has been reviewed and approved. The student has been officially transferred to the requested section.</p>${infoBox([{ label: "Student", value: studentName }, { label: "From Section", value: fromSection }, { label: "To Section", value: toSection }, { label: "Date", value: emailDate() }])}${NOTIF_FOOTER}`,
  });
}

export async function sendTransferRequestApprovedToFromAdviser({
  to,
  firstName,
  studentName,
  toSection,
}: {
  to: string; firstName: string; studentName: string; toSection: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Notice of Approved Section Transfer — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">This is to inform you that the section transfer request for one of your students has been approved by an administrator. The student has been officially transferred to another section.</p>${infoBox([{ label: "Student", value: studentName }, { label: "Transferred To", value: toSection }, { label: "Date", value: emailDate() }])}${NOTIF_FOOTER}`,
  });
}

// ─── Transfer Request — Rejected ──────────────────────────────────────────────

export async function sendTransferRequestRejectedToRequester({
  to,
  firstName,
  studentName,
  fromSection,
  toSection,
  notes,
}: {
  to: string; firstName: string; studentName: string;
  fromSection: string; toSection: string; notes: string | null;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Section Transfer Request Declined — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">This is to inform you that your section transfer request has been reviewed and declined by an administrator.</p>${infoBox([{ label: "Student", value: studentName }, { label: "From Section", value: fromSection }, { label: "Requested Section", value: toSection }, { label: "Date", value: emailDate() }])}${notes ? `<p style="color:#555;font-size:14px;margin-top:16px;"><strong>Reason for Decline:</strong></p>${notesBox(notes)}` : ""}<p style="color:#555;font-size:14px;">If you have questions, please contact your school administrator.</p>${NOTIF_FOOTER}`,
  });
}

export async function sendTransferRequestRejectedToFromAdviser({
  to,
  firstName,
  studentName,
}: {
  to: string; firstName: string; studentName: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Notice of Declined Section Transfer Request — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">This is to inform you that the section transfer request for <strong>${studentName}</strong>, a student in your class, has been reviewed and declined by an administrator. The student remains enrolled in your section.</p>${infoBox([{ label: "Student", value: studentName }, { label: "Date", value: emailDate() }])}${NOTIF_FOOTER}`,
  });
}

// ─── Direct Move ──────────────────────────────────────────────────────────────

export async function sendDirectMoveToFromAdviser({
  to,
  firstName,
  studentName,
  fromSection,
  toSection,
}: {
  to: string; firstName: string; studentName: string;
  fromSection: string; toSection: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Notice of Student Transfer — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">This is to inform you that a student from your class has been transferred to another section by an administrator.</p>${infoBox([{ label: "Student", value: studentName }, { label: "From Section", value: fromSection }, { label: "Transferred To", value: toSection }, { label: "Date", value: emailDate() }])}<p style="color:#555;font-size:14px;">If you have questions regarding this transfer, please contact your school administrator.</p>${NOTIF_FOOTER}`,
  });
}

export async function sendDirectMoveToToAdviser({
  to,
  firstName,
  studentName,
  fromSection,
  toSection,
}: {
  to: string; firstName: string; studentName: string;
  fromSection: string; toSection: string;
}) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Notice of New Student Enrollment — ${studentName}`,
    html: `${NOTIF_HEADER}<h2 style="color:#333;">Dear ${firstName},</h2><p style="color:#555;font-size:15px;">This is to inform you that a student has been transferred to your class by an administrator.</p>${infoBox([{ label: "Student", value: studentName }, { label: "From Section", value: fromSection }, { label: "Your Section", value: toSection }, { label: "Date", value: emailDate() }])}${NOTIF_FOOTER}`,
  });
}
