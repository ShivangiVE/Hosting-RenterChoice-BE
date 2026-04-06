const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('RESEND_API_KEY ',RESEND_API_KEY)
// Base email sender function
const sendEmail = async (to, subject, text, html) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "onboarding@resend.dev", // temporary until you verify domain
      to,
      subject,
      text,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message);
    }

    console.log(`Email sent to ${to}`, data);
  } catch (error) {
    console.error("Email sending failed:", error);
    throw new Error("Email sending failed");
  }
};

// Send OTP email
const sendForgotPasswordOTPEmail = async (email, otp) => {
  const subject = "Password Reset Verification Code";
  const text = `
Hi,
We received a request to reset your password. Please use the following One-Time Password (OTP) to proceed:
OTP Code: ${otp}
This code will expire in 10 minutes.
If you did not request a password reset, please ignore this message or contact support.
  `;
  const html = `
    <p>Hi,</p>
    <p>We received a request to reset your password. Please use the following One-Time Password (OTP) to proceed:</p>
    <h2 style="letter-spacing: 2px;">${otp}</h2>
    <p><strong>This code will expire in 10 minutes.</strong></p>
    <p>If you did not request this, you can safely ignore this message or contact support.</p>
  `;
  await sendEmail(email, subject, text, html);
};

module.exports = {
  sendEmail,
  sendForgotPasswordOTPEmail,
};