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
// const sendForgotPasswordEmail = async (user, token) => {
//   const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${token}`;
//   const subject = "Reset Your Password";

//   const text = `
//     Hi ${user.preferredName || user.firstName || "User"},

//     You requested to reset your password. Click the link below:
//     ${resetUrl}

//     If you didn’t request this, you can ignore this email.
//   `;

//   const html = `
//     <p>Hi ${user.preferredName || user.firstName || "User"},</p>
//     <p>You requested to reset your password.</p>
//     <p>
//       <a href="${resetUrl}" style="color: white; background: #007bff; padding: 10px 15px; border-radius: 4px; text-decoration: none;">
//         Reset Password
//       </a>
//     </p>
//     <p>If you didn’t request this, you can safely ignore this email.</p>
//   `;

//   await sendEmail(user.email, subject, text, html);
// };

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

const escapeHtml = (str = "") =>
  String(str).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );

const sendPortfolioDeactivatedNotice = async ({
  admins,
  owner,
  portfolios,
}) => {
  const adminEmails = admins.map((a) => a.email).filter(Boolean);
  if (adminEmails.length === 0) return;

  const ownerName =
    owner.preferredName ||
    `${owner.firstName || ""} ${owner.lastName || ""}`.trim() ||
    owner.email;

  const portfolioNames = portfolios.map((p) => p.portfolioName).filter(Boolean);
  const nameList = portfolioNames.join(", ");
  const isPlural = portfolioNames.length > 1;

  const subject = `Owner login attempt on deactivated portfolio${isPlural ? "s" : ""}: ${nameList}`;

  const text = `
Hi,

${ownerName} (${owner.email}) attempted to log in to the Owner Portal but was blocked because ${isPlural ? "these portfolios are" : "this portfolio is"} deactivated:

${portfolioNames.map((n) => `- ${n}`).join("\n")}

If access should be restored, reactivate ${isPlural ? "them" : "it"} from the Portfolio list.
  `;

  const html = `
    <p>Hi,</p>
    <p><strong>${escapeHtml(ownerName)}</strong> (${escapeHtml(owner.email)}) attempted to log in to the Owner Portal but was blocked because ${isPlural ? "these portfolios are" : "this portfolio is"} deactivated:</p>
    <ul>
      ${portfolioNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}
    </ul>
    <p>If access should be restored, reactivate ${isPlural ? "them" : "it"} from the Portfolio list.</p>
  `;

  await sendEmail(adminEmails.join(","), subject, text, html);
};

// Invitation for a newly created Brokerage Admin / Team Admin
// (link is single-use and expires in 72 hours)
const sendTeamAdminInviteEmail = async ({
  to,
  name,
  teamName,
  roleLabel,
  link,
}) => {
  const subject = `You're invited to Renters Choice as ${roleLabel}`;

  const text = `
Hi ${name},

You have been added as ${roleLabel} for ${teamName} on Renters Choice.

Set your password using the link below (valid for 72 hours, can be used once):
${link}

If you weren't expecting this email, you can ignore it.
  `;

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;color:#282932;line-height:1.5">
      <p>Hi ${escapeHtml(name)},</p>
      <p>You have been added as <strong>${escapeHtml(roleLabel)}</strong> for
        <strong>${escapeHtml(teamName)}</strong> on Renters Choice.</p>
      <p>Click the button below to set your password. This link is valid for 72 hours and can be used once.</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(link)}"
           style="background:#018898;color:#ffffff;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:600">
          Set my password
        </a>
      </p>
      <p style="font-size:13px;color:#6B7280">If the button doesn't work, copy this link into your browser:<br/>${escapeHtml(link)}</p>
      <p style="font-size:13px;color:#6B7280">If you weren't expecting this email, you can ignore it.</p>
    </div>
  `;

  await sendEmail(to, subject, text, html);
};

module.exports = {
  sendEmail,
  sendForgotPasswordOTPEmail,
  sendPortfolioDeactivatedNotice,
  sendTeamAdminInviteEmail,
};
