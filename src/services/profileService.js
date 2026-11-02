const EXTERNAL_PROFILE_ROLES = ["Owner", "Tenant", "Vendor", "InspectionClerk"];

const PROFILE_SELECT =
  "email role preferredName technicianName firstName lastName fullName alternateEmail profileImage";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LIMITS = {
  preferredName: 60,
  fullName: 120,
  alternateEmail: 120,
};

const str = (v) => (v === undefined || v === null ? "" : String(v).trim());

/** What the client receives — never the raw user document. */
function toProfileDTO(u) {
  return {
    _id: u._id,
    email: u.email,
    role: u.role,
    preferredName: u.preferredName || "",
    technicianName: u.technicianName || "",
    fullName: u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" "),
    alternateEmail: u.alternateEmail || "",
    profileImage: u.profileImage || "",
  };
}

function validateProfileUpdate(body = {}, user) {
  const errors = [];
  const set = {};

  const checkLength = (value, key, label) => {
    if (value.length > LIMITS[key])
      errors.push(`${label} must be ${LIMITS[key]} characters or less`);
  };

  if (body.preferredName !== undefined) {
    const v = str(body.preferredName);
    if (!v) errors.push("Preferred Name is required");
    checkLength(v, "preferredName", "Preferred Name");
    // Vendors display technicianName as their preferred name
    set[user.role === "Vendor" ? "technicianName" : "preferredName"] = v;
  }

  if (body.fullName !== undefined) {
    const v = str(body.fullName);
    checkLength(v, "fullName", "Full Name");
    set.fullName = v;
  }

  if (body.alternateEmail !== undefined) {
    const v = str(body.alternateEmail).toLowerCase();
    checkLength(v, "alternateEmail", "Alternate Email Address");
    if (v && !EMAIL_RE.test(v))
      errors.push("Enter a valid alternate email address");
    if (v && v === user.email)
      errors.push("Alternate email must be different from your login email");
    set.alternateEmail = v;
  }

  return { set, errors };
}

module.exports = {
  EXTERNAL_PROFILE_ROLES,
  PROFILE_SELECT,
  toProfileDTO,
  validateProfileUpdate,
};
