const nodemailer = require("nodemailer");
const User = require("../models/User");

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Base email sender function
const sendEmail = async (to, subject, text, html) => {
  try {
    const mailOptions = {
      from: `"Renters Choice" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Email sending failed:", error);
    throw new Error("Email sending failed");
  }
};

// Forgot password email
const sendForgotPasswordEmail = async (user, token) => {
  const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${token}`;
  const subject = "Reset Your Password";

  const text = `
    Hi ${user.preferredName || user.firstName || "User"},
    
    You requested to reset your password. Click the link below:
    ${resetUrl}
    
    If you didn’t request this, you can ignore this email.
  `;

  const html = `
    <p>Hi ${user.preferredName || user.firstName || "User"},</p>
    <p>You requested to reset your password.</p>
    <p>
      <a href="${resetUrl}" style="color: white; background: #007bff; padding: 10px 15px; border-radius: 4px; text-decoration: none;">
        Reset Password
      </a>
    </p>
    <p>If you didn’t request this, you can safely ignore this email.</p>
  `;

  await sendEmail(user.email, subject, text, html);
};

module.exports = {
  sendEmail,
  sendForgotPasswordEmail,
};
