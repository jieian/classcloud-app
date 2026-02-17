import transporter from "./transporter";

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
