
require("dotenv").config();
const mongoose = require("mongoose");
const {
  generateTeamUniqueId,
  TEAM_UNIQUE_ID_PATTERN,
} = require("../src/utils/generateTeamUniqueId");

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const replaceLegacy = args.includes("--replace-legacy");
  const confirm = (args.find((a) => a.startsWith("--confirm=")) || "").split(
    "=",
  )[1];

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  // Native collection: bypasses the schema's "immutable" rule on purpose
  const teams = db.collection("teams");

  const all = await teams
    .find(
      {},
      { projection: { businessLegalName: 1, teamType: 1, uniqueIdNumber: 1 } },
    )
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  const missing = all.filter((t) => !t.uniqueIdNumber);
  const legacy = all.filter(
    (t) => t.uniqueIdNumber && !TEAM_UNIQUE_ID_PATTERN.test(t.uniqueIdNumber),
  );
  const todo = replaceLegacy ? [...missing, ...legacy] : missing;

  console.log(`Database: "${dbName}" — ${all.length} team(s)\n`);
  console.log(`Without a Unique ID: ${missing.length}`);
  missing.forEach((t) =>
    console.log(`   - [${t.teamType}] ${t.businessLegalName}`),
  );
  console.log(`\nWith an old (non-RC) value: ${legacy.length}`);
  legacy.forEach((t) =>
    console.log(
      `   - [${t.teamType}] ${t.businessLegalName}: ${t.uniqueIdNumber}`,
    ),
  );
  if (legacy.length && !replaceLegacy) {
    console.log("   (left as-is — add --replace-legacy to replace them)");
  }

  if (!apply) {
    console.log(
      `\nPreview only — ${todo.length} team(s) would get an RC number.`,
    );
    console.log(
      `To assign: node scripts/backfillTeamUniqueIds.js --apply --confirm=${dbName}`,
    );
    return;
  }
  if (confirm !== dbName) {
    throw new Error(`--confirm must be exactly "${dbName}"`);
  }

  for (const t of todo) {
    const id = await generateTeamUniqueId();
    await teams.updateOne({ _id: t._id }, { $set: { uniqueIdNumber: id } });
    console.log(`   ${id}  ←  [${t.teamType}] ${t.businessLegalName}`);
  }
  console.log(`\nDone: ${todo.length} team(s) updated.`);
}

main()
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
