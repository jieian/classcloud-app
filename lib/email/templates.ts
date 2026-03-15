import transporter from "./transporter";

interface PasswordResetEmailParams {
  to: string;
  resetLink: string;
}

export async function sendPasswordResetEmail({
  to,
  resetLink,
}: PasswordResetEmailParams) {
  await transporter.sendMail({
    from: `"ClassCloud" <${process.env.GMAIL_USER}>`,
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
  await transporter.sendMail({
    from: `"ClassCloud" <${process.env.GMAIL_USER}>`,
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
  await transporter.sendMail({
    from: `"ClassCloud" <${process.env.GMAIL_USER}>`,
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
