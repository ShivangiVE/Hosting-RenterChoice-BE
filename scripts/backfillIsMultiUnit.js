//
// MANDATORY one-time run BEFORE deploying the isMultiUnit schema change.
//
// isMultiUnit is `required: true` with no default. Every Building document
// that already exists in the database was created before this field
// existed, so it has no value for it. The moment any of those documents
// goes through a Mongoose validation path again (e.g. updateBuilding's
// building.save()), it will fail with a required-field validation error
// until backfilled.
//
// Run once per environment: `node scripts/backfillIsMultiUnit.js`
//
// Standalone scripts don't go through your app's normal server.js/app.js
// startup, so `.env` is never loaded unless something explicitly does it
// here — that's what the require("dotenv").config() line below is for.

require("dotenv").config();

const mongoose = require("mongoose");
const Building = require("../src/models/Building");


// Matches config/db.js's connectDB — same env var, so this script connects
// exactly the way your app does.
const MONGO_URI = process.env.MONGO_URI;

(async () => {
  if (!MONGO_URI) {
    throw new Error(
      "MONGO_URI is still undefined after loading dotenv — confirm a .env file exists at your project root (same folder you run `node scripts/backfillIsMultiUnit.js` from) and that it contains a MONGO_URI= line.",
    );
  }
  await mongoose.connect(MONGO_URI);

  const result = await Building.updateMany(
    { isMultiUnit: { $exists: false } },
    { $set: { isMultiUnit: false, parentBuilding: null } },
  );

  console.log(`Backfilled ${result.modifiedCount} existing building(s).`);

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
