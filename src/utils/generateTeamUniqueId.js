const Counter = require("./Counter");
const Team = require("../models/Team");

/**
 * Team "Unique ID Number" — RC + 5 digits (RC10001 … RC99999).
 *
 * - Allocated from the shared `counters` collection with an atomic $inc,
 *   so two teams created at the same moment can never get the same number.
 * - Must be called INSIDE the create-team transaction (pass its session):
 *   if the team or its admin fails to save, the transaction rolls back and
 *   the counter goes back too — the number is only "used" once the team is
 *   really created (no gaps from failed attempts).
 * - Concurrent creates both write the same counter document; MongoDB turns
 *   that into a write conflict and session.withTransaction() retries the
 *   loser automatically, so numbers are handed out one at a time.
 * - The unique index on Team.uniqueIdNumber is the final safety net. If a
 *   number is already taken (e.g. set by hand in the DB), it is skipped.
 */
const PREFIX = "RC";
const START_FROM = 10000; // first ID = RC10001
const MAX_NUMBER = 99999; // last ID  = RC99999 (5 digits)
const COUNTER_ID = "teamUniqueId";
const MAX_SKIPS = 20;

const TEAM_UNIQUE_ID_PATTERN = /^RC\d{5}$/;

async function generateTeamUniqueId({ session } = {}) {
  for (let attempt = 0; attempt < MAX_SKIPS; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { _id: COUNTER_ID },
      { $inc: { sequence_value: 1 } },
      { new: true, upsert: true, session },
    );

    const number = START_FROM + counter.sequence_value;
    if (number > MAX_NUMBER) {
      const err = new Error(
        "Team Unique ID range is exhausted (RC99999). Please contact support.",
      );
      err.code = "TEAM_ID_EXHAUSTED";
      throw err;
    }

    const uniqueId = `${PREFIX}${number}`;
    const taken = await Team.exists({ uniqueIdNumber: uniqueId }).session(
      session || null,
    );
    if (!taken) return uniqueId;
  }

  throw new Error("Could not allocate a free Team Unique ID");
}

module.exports = { generateTeamUniqueId, TEAM_UNIQUE_ID_PATTERN };