const User = require("../models/User");

const LIMITS = {
  legalName: 100,
  preferredName: 100,
  fullName: 150,
  contactInfo: 30,
  emailSignature: 500,
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PHONE_RE = /^\+?[0-9\s().-]{7,30}$/;

const clean = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const parseNewUserInput = (body = {}) => {
  const legalName = clean(body.legalName);
  const preferredName = clean(body.preferredName);
  const fullName = clean(body.fullName);
  const contactInfo = clean(body.contactInfo);
  const emailSignature = clean(body.emailSignature);
  const email = clean(body.email).toLowerCase();
  const password = body.password === undefined ? "" : String(body.password);

  if (!legalName) return { error: "Legal name is required" };
  if (!preferredName) return { error: "Preferred name is required" };
  if (!email) return { error: "Email is required" };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address" };
  if (!password) return { error: "Password is required" };
  if (contactInfo && !PHONE_RE.test(contactInfo)) {
    return { error: "Enter a valid work / contact number" };
  }

  const values = {
    legalName,
    preferredName,
    fullName,
    contactInfo,
    emailSignature,
  };
  for (const [field, max] of Object.entries(LIMITS)) {
    if (values[field].length > max) {
      return { error: `${field} must be ${max} characters or fewer` };
    }
  }

  return {
    data: {
      legalName,
      preferredName,
      email,
      password,

      ...(fullName && { fullName }),
      ...(contactInfo && { contactInfo }),
      ...(emailSignature && { emailSignature }),
    },
  };
};

const toCreatedUser = (user) => ({
  _id: user._id,
  legalName: user.legalName,
  preferredName: user.preferredName,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  contactInfo: user.contactInfo,
  emailSignature: user.emailSignature,
});

const createUserAccount = async (body, { role, createdBy } = {}) => {
  const { error, data } = parseNewUserInput(body);
  if (error) return { error, status: 400 };

  if (await User.exists({ email: data.email })) {
    return { error: "User already exists", status: 409 };
  }

  try {
    const user = await User.create({
      ...data,
      role,
      ...(createdBy && { createdBy }),
    });
    return { user };
  } catch (err) {
    if (err?.code === 11000) {
      return { error: "User already exists", status: 409 };
    }
    if (err?.name === "ValidationError") {
      return { error: err.message, status: 400 };
    }
    throw err;
  }
};

module.exports = {
  createUserAccount,
  parseNewUserInput,
  toCreatedUser,
};
