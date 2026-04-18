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
    subject: "[ClassCloud] Password Reset Request",
    html: `
      <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600"
          style="background-color: #ffffff; border: 1px solid #e0e0e0; border-collapse: collapse;">

          <!-- Header -->
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
                <span style="color: #45903B;">Class</span><span style="color: #076E3F;">Cloud</span>
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Password Reset Request</h2>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
                We received a request to reset your <strong>ClassCloud</strong> account password.
                Click the button below to set a new secure password.
              </p>
            </td>
          </tr>

          <!-- Button -->
          <tr>
            <td align="center" style="padding: 30px 40px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" bgcolor="#45903B" style="padding: 14px 28px;">
                    <a href="${resetLink}" target="_blank"
                      style="font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; white-space: nowrap;">
                      Reset My Password
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security note -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left: 4px solid #e74c3c; border-collapse: collapse;">
                <tr>
                  <td bgcolor="#fff9f9" style="padding: 15px;">
                    <p style="color: #c0392b; font-size: 14px; margin: 0; line-height: 1.5;">
                      <strong>Security Note:</strong> This link will expire in 1 hour.
                      If you didn't request this, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetLink}" style="color: #45903B; word-break: break-all;">${resetLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
                This is an automated message, please do not reply.
              </p>
            </td>
          </tr>

        </table>
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
    subject: "[ClassCloud] Verify Email Address",
    html: `
      <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600"
          style="background-color: #ffffff; border: 1px solid #e0e0e0; border-collapse: collapse;">

          <tr>
            <td align="center" style="padding: 40px 20px;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
                <span style="color: #45903B;">Class</span><span style="color: #076E3F;">Cloud</span>
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Hello, ${firstName}!</h2>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
                Thank you for signing up for ClassCloud. To get started, please <strong>verify your email address</strong> by clicking the button below:
              </p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 30px 40px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" bgcolor="#45903B" style="padding: 14px 28px;">
                    <a href="${verificationLink}" target="_blank"
                      style="font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; white-space: nowrap;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left: 4px solid #45903B; border-collapse: collapse;">
                <tr>
                  <td bgcolor="#f0f7ef" style="padding: 15px;">
                    <p style="color: #2e5c2a; font-size: 14px; margin: 0; line-height: 1.5;">
                      <strong>Note:</strong> Once verified, your account will be reviewed by an administrator. You will be notified once you are approved to log in.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${verificationLink}" style="color: #45903B; word-break: break-all;">${verificationLink}</a>
              </p>
              <p style="color: #b0b0b0; font-size: 12px; margin-top: 20px; margin-bottom: 0;">
                If you did not create a ClassCloud account, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
                This is an automated message, please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </div>
    `,
  });
}

interface EmailVerifiedEmailParams {
  to: string;
  firstName: string;
}

export async function sendEmailVerifiedEmail({
  to,
  firstName,
}: EmailVerifiedEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "[ClassCloud] Email Verified Successfully",
    html: `
      <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600"
          style="background-color: #ffffff; border: 1px solid #e0e0e0; border-collapse: collapse;">

          <tr>
            <td align="center" style="padding: 40px 20px;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
                <span style="color: #45903B;">Class</span><span style="color: #076E3F;">Cloud</span>
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Email Verified!</h2>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
                Hello ${firstName}, your email address has been <strong>successfully verified</strong>. Your ClassCloud registration has now been queued for administrative review.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                <tr>
                  <td bgcolor="#f0f7ef" style="padding: 25px;">
                    <h3 style="color: #2e5c2a; font-size: 18px; margin: 0 0 10px 0;">What happens next?</h3>
                    <ul style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0; padding-left: 20px;">
                      <li>An administrator will review your registration details to ensure security and eligibility.</li>
                      <li><strong>You will receive an email once a decision has been made regarding your request.</strong></li>
                    </ul>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 40px 40px; text-align: center;">
              <p style="color: #888; font-size: 14px; line-height: 1.5; margin: 0;">
                No further action is required from you at this time.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
                This is an automated message, please do not reply.
              </p>
            </td>
          </tr>

        </table>
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
    subject: "[ClassCloud] Account Approved",
    html: `
      <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" 
        style="background-color: #ffffff; border: 1px solid #e0e0e0; border-collapse: collapse;">
        
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
              <span style="color: #45903B;">Class</span><span style="color: #076E3F;">Cloud</span>
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 40px 10px 40px;">
            <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Hello, ${firstName}!</h2>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
              Welcome to ClassCloud! Your account has been <strong>reviewed and approved</strong> by an administrator. You now have full access to the platform.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding: 30px 40px;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="#45903B" style="padding: 14px 28px;">
                  <a href="https://classcloudph.app/login" target="_blank"
                    style="font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; white-space: nowrap;">
                    Log In to Your Account
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 40px 40px 40px;">
            <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
              If you have any questions about getting started, feel free to reach out to an administrator.
            </p>
          </td>
        </tr>

        <tr>
          <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
              &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
              This is an automated message, please do not reply.
            </p>
          </td>
        </tr>

      </table>
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
    subject: "[ClassCloud] Account Registration Rejected",
    html: `
      <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" 
        style="background-color: #ffffff; border: 1px solid #e0e0e0; border-collapse: collapse;">
        
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
              <span style="color: #45903B;">Class</span><span style="color: #076E3F;">Cloud</span>
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 40px 20px 40px;">
            <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Hello, ${firstName}!</h2>
            <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
              We regret to inform you that your ClassCloud registration request has been <strong>reviewed and declined</strong> for the following reason:
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding: 10px 40px 30px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left: 4px solid #e74c3c; border-collapse: collapse;">
              <tr>
                <td bgcolor="#fff3f3" style="padding: 15px;">
                  <p style="color: #333333; font-size: 15px; margin: 0; line-height: 1.5;">
                    ${reason}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding: 0 40px 40px 40px;">
            <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
              If you believe this was a mistake, or if you wish to provide more information, please contact your school administrator.
            </p>
          </td>
        </tr>

        <tr>
          <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
              &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
              This is an automated message, please do not reply.
            </p>
          </td>
        </tr>

      </table>
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
    subject: "[ClassCloud] Your Account Credentials",
    html: `
      <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" 
          style="background-color: #ffffff; border: 1px solid #e0e0e0; border-collapse: collapse;">
          
          <tr>
            <td align="center" style="padding: 40px 20px;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
                <span style="color: #45903B;">Class</span><span style="color: #076E3F;">Cloud</span>
              </h1>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Welcome, ${firstName} ${lastName}!</h2>
              <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
                An account has been created for you on <strong>ClassCloud</strong>. You can use the temporary credentials below to access your account:
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 20px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
                <tr>
                  <td bgcolor="#f5f5f5" style="padding: 20px;">
                    <p style="margin: 0 0 10px 0; font-size: 15px; color: #333;">
                      <strong>Email:</strong> <span style="color: #4a4a4a;">${to}</span>
                    </p>
                    <p style="margin: 0; font-size: 15px; color: #333;">
                      <strong>Temporary Password:</strong> <span style="color: #4a4a4a;">${password}</span>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left: 4px solid #e74c3c; border-collapse: collapse;">
                <tr>
                  <td bgcolor="#fff3f3" style="padding: 12px 15px;">
                    <p style="color: #c0392b; font-size: 14px; margin: 0; font-weight: bold; line-height: 1.4;">
                      Important: This is a temporary password. For your security, you will be required to change it immediately after your first login.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding: 0 40px 40px 40px;">
              <table border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" bgcolor="#45903B" style="padding: 14px 28px; border-radius: 4px;">
                    <a href="https://classcloudph.app/login" target="_blank" 
                      style="font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; white-space: nowrap; display: inline-block;">
                      Log In to Your Account
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <tr>
            <td style="padding: 0 40px 40px 40px;">
              <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
                If you encounter any problem, please contact an administrator.
              </p>
            </td>
          </tr>

          <tr>
            <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
                This is an automated message, please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </div>
    `,
  });
}

// ─── Shared layout helpers ────────────────────────────────────────────────────
function startEmailLayout(): string {
  return `
    <div style="background-color: #f9f9f9; padding: 40px 0; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="600"
        style="background-color: #ffffff; border: 1px solid #e0e0e0; border-collapse: collapse;">
        <tr>
          <td align="center" style="padding: 40px 20px;">
            <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">
              <span style="color: #45903B;">Class</span><span style="color: #076E3F;">Cloud</span>
            </h1>
          </td>
        </tr>`;
}

function endEmailLayout(): string {
  return `
        <tr>
          <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
            <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
              &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
              This is an automated message, please do not reply.
            </p>
          </td>
        </tr>
      </table>
    </div>`;
}

function infoBox(rows: { label: string; value: string }[]): string {
  const cells = rows
    .map(({ label, value }) => `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 13px; width: 40%; vertical-align: top;"><strong>${label}</strong></td>
                <td style="padding: 8px 0; color: #222; font-size: 14px; font-weight: 500;">${value}</td>
              </tr>`)
    .join("");
  return `
        <tr>
          <td style="padding: 0 40px 20px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
              <tr>
                <td bgcolor="#f8f9fa" style="padding: 20px;">
                  <table border="0" cellpadding="0" cellspacing="0" width="100%">
                    ${cells}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function notesBox(notes: string, isAlert = false): string {
  const borderColor = isAlert ? "#e74c3c" : "#45903B";
  const bgColor = isAlert ? "#fff3f3" : "#f0f7ef";
  return `
        <tr>
          <td style="padding: 0 40px 20px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-left: 4px solid ${borderColor}; border-collapse: collapse;">
              <tr>
                <td bgcolor="${bgColor}" style="padding: 15px;">
                  <p style="color: #333; font-size: 14px; margin: 0; line-height: 1.5;">${notes}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function ctaButton(label: string, href: string): string {
  return `
        <tr>
          <td align="center" style="padding: 0 40px 30px 40px;">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="#45903B" style="padding: 14px 28px;">
                  <a href="${href}" target="_blank"
                    style="font-size: 16px; font-weight: bold; color: #ffffff; text-decoration: none; white-space: nowrap;">
                    ${label}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
}

function emailDate(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// ─── Admin Invitation ─────────────────────────────────────────────────────────

interface InvitationEmailParams {
  to: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  roles: string[];
  tempPassword: string;
  activationLink: string;
  isResend?: boolean;
}

export async function sendInvitationEmail({
  to,
  firstName,
  middleName,
  lastName,
  roles,
  tempPassword,
  activationLink,
  isResend = false,
}: InvitationEmailParams) {
  const nameRows: { label: string; value: string }[] = [
    { label: "First Name", value: firstName },
  ];
  if (middleName?.trim()) {
    nameRows.push({ label: "Middle Name", value: middleName.trim() });
  }
  nameRows.push({ label: "Last Name", value: lastName });

  const roleRows =
    roles.length > 0
      ? roles.map((r, i) => `[${i + 1}] ${r}`).join("<br>")
      : "No roles assigned";
  nameRows.push({ label: roles.length === 1 ? "Role" : "Roles", value: roleRows });

  const resendNote = isResend
    ? notesBox(
        "<strong>Note:</strong> Your previous invitation link has been invalidated. Please use this new link only.",
      )
    : "";

  await resend.emails.send({
    from: FROM,
    to,
    subject: isResend
      ? "[ClassCloud] New ClassCloud Invitation — Activate Your Account"
      : "[ClassCloud] ClassCloud Invitation — Activate Your Account",
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Hello, ${firstName}!</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            An account has been created for you on <strong>ClassCloud</strong>. Please activate your account by clicking the button below.
          </p>
        </td>
      </tr>
      ${resendNote}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <p style="color: #1a1a1a; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Account Information</p>
          ${infoBox(nameRows)}
        </td>
      </tr>
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <p style="color: #1a1a1a; font-size: 14px; font-weight: 600; margin: 0 0 8px 0;">Account Credentials</p>
          ${infoBox([
            { label: "Email", value: to },
            { label: "Temporary Password", value: `<code style="background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:14px;">${tempPassword}</code>` },
          ])}
        </td>
      </tr>
      ${notesBox(
        "<strong>Important:</strong> This is a temporary password. You will be required to change it upon first login.",
        true,
      )}
      ${ctaButton("Activate Your Account", activationLink)}
      <tr>
        <td style="padding: 0 40px 40px 40px;">
          <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${activationLink}" style="color: #45903B; word-break: break-all;">${activationLink}</a>
          </p>
        </td>
      </tr>
      ${endEmailLayout()}
    `,
  });
}

interface InviteActivatedEmailParams {
  to: string;
  firstName: string;
}

export async function sendInviteActivatedEmail({
  to,
  firstName,
}: InviteActivatedEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "[ClassCloud] Account Activated Successfully",
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Account Activated!</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            Hello ${firstName}, you have successfully activated your <strong>ClassCloud</strong> account. Welcome!
          </p>
        </td>
      </tr>
      ${notesBox(
        "<strong>Reminder:</strong> You will be prompted to change your temporary password upon first login.",
      )}
      ${ctaButton("Go to ClassCloud", "https://classcloudph.app/login")}
      ${endEmailLayout()}
    `,
  });
}

interface InviteCancelledEmailParams {
  to: string;
  firstName: string;
}

export async function sendInviteCancelledEmail({
  to,
  firstName,
}: InviteCancelledEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "[ClassCloud] Invitation Cancelled",
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 40px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Hello, ${firstName}!</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            Your <strong>ClassCloud</strong> invitation has been cancelled by an administrator.
            Any previously sent invitation links are no longer valid.
          </p>
          <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin-top: 16px;">
            If you believe this was a mistake, please contact your school administrator.
          </p>
        </td>
      </tr>
      ${endEmailLayout()}
    `,
  });
}

// ─── Account Deactivation ─────────────────────────────────────────────────────

interface AccountDeactivationEmailParams {
  to: string;
  firstName: string;
}

export async function sendAccountDeactivationEmail({
  to,
  firstName,
}: AccountDeactivationEmailParams) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: "[ClassCloud] Account Deactivation Notice",
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Sorry to see you go!</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            Hello ${firstName}, we're reaching out to let you know that your ClassCloud account has been <strong>officially deleted</strong> by an administrator.
          </p>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 15px 0 0 0;">
            We've truly appreciated your time with us. While your journey with ClassCloud ends here for now, we want to thank you for being part of our community.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 40px 30px 40px;">
          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fff5f5; border-left: 4px solid #e53e3e; border-collapse: collapse;">
            <tr>
              <td style="padding: 15px;">
                <p style="color: #c53030; font-size: 14px; margin: 0; line-height: 1.5;">
                  <strong>Note:</strong> Your login access has been disabled, and any personal configurations have been removed from your active profile.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding: 0 40px 40px 40px;">
          <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6; margin: 0;">
            If you believe this was a mistake, please contact your school administrator.
          </p>
        </td>
      </tr>
      <tr>
        <td bgcolor="#f4f4f4" style="padding: 20px; text-align: center;">
          <p style="color: #999; font-size: 12px; margin: 0; line-height: 1.5;">
            &copy; ${new Date().getFullYear()} ClassCloud. All rights reserved.<br>
            This is an automated security notification.
          </p>
        </td>
      </tr>
    </table>
  </div>
    `,
  });
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            A section transfer request has been submitted for one of your students. The request is currently pending administrator review.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "Current Section", value: fromSection },
        { label: "Requested Section", value: toSection },
        { label: "Requested By", value: requestedByName },
        { label: "Date", value: emailDate() },
      ])}
      <tr>
        <td style="padding: 0 40px 40px 40px;">
          <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
            No further action is required from you at this time. You will be notified once a decision has been made.
          </p>
        </td>
      </tr>
      ${endEmailLayout()}
    `,
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            A new section transfer request has been submitted and requires your review and approval.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "From Section", value: fromSection },
        { label: "To Section", value: toSection },
        { label: "Requested By", value: requestedByName },
        { label: "Date", value: emailDate() },
      ])}
      ${ctaButton("Review Request", actionUrl)}
      ${endEmailLayout()}
    `,
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            Your section transfer request has been reviewed and approved. The student has been officially transferred to the requested section.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "From Section", value: fromSection },
        { label: "To Section", value: toSection },
        { label: "Date", value: emailDate() },
      ])}
      ${endEmailLayout()}
    `,
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            The section transfer request for one of your students has been approved by an administrator. The student has been officially transferred to another section.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "Transferred To", value: toSection },
        { label: "Date", value: emailDate() },
      ])}
      ${endEmailLayout()}
    `,
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            Your section transfer request has been reviewed and declined by an administrator.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "From Section", value: fromSection },
        { label: "Requested Section", value: toSection },
        { label: "Date", value: emailDate() },
      ])}
      ${notes ? notesBox(notes, true) : ""}
      <tr>
        <td style="padding: 0 40px 40px 40px;">
          <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
            If you have questions, please contact your school administrator.
          </p>
        </td>
      </tr>
      ${endEmailLayout()}
    `,
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            The section transfer request for <strong>${studentName}</strong>, a student in your class, has been reviewed and declined by an administrator. The student remains enrolled in your section.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "Date", value: emailDate() },
      ])}
      ${endEmailLayout()}
    `,
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            A student from your class has been transferred to another section by an administrator.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "From Section", value: fromSection },
        { label: "Transferred To", value: toSection },
        { label: "Date", value: emailDate() },
      ])}
      <tr>
        <td style="padding: 0 40px 40px 40px;">
          <p style="color: #888; font-size: 13px; line-height: 1.5; margin: 0;">
            If you have questions regarding this transfer, please contact your school administrator.
          </p>
        </td>
      </tr>
      ${endEmailLayout()}
    `,
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
    html: `
      ${startEmailLayout()}
      <tr>
        <td style="padding: 0 40px 20px 40px;">
          <h2 style="color: #1a1a1a; font-size: 22px; margin-top: 0;">Dear ${firstName},</h2>
          <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 0;">
            A student has been transferred to your class by an administrator.
          </p>
        </td>
      </tr>
      ${infoBox([
        { label: "Student", value: studentName },
        { label: "From Section", value: fromSection },
        { label: "Your Section", value: toSection },
        { label: "Date", value: emailDate() },
      ])}
      ${endEmailLayout()}
    `,
  });
}
