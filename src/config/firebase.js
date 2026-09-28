const { initializeApp, cert, getApps } = require("firebase-admin/app");

let ready = false;

const initFirebase = () => {
  if (ready) return true;

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!encoded) {

    console.warn(
      "[firebase] FIREBASE_SERVICE_ACCOUNT_BASE64 not set — push notifications disabled.",
    );
    return false;
  }

  try {
    const serviceAccount = JSON.parse(
      Buffer.from(encoded, "base64").toString("utf-8"),
    );

    if (!getApps().length) {
      initializeApp({ credential: cert(serviceAccount) });
    }

    ready = true;
    console.log(
      "[firebase] Admin SDK initialized — push notifications enabled.",
    );
  } catch (err) {
    console.error(
      "[firebase] Could not initialize (check FIREBASE_SERVICE_ACCOUNT_BASE64) — push disabled:",
      err.message,
    );
  }

  return ready;
};

const isFirebaseReady = () => ready;

module.exports = { initFirebase, isFirebaseReady };
