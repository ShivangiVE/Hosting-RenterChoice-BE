const Counter = require("./Counter");

const PENDING_NUMBER = "PENDING";

const getNextSequence = async (sequenceName) => {
  const counter = await Counter.findByIdAndUpdate(
    sequenceName,
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true },
  );
  return counter.sequence_value;
};

const createWithSequence = async (
  Model,
  data,
  { sequenceName, assignNumber, afterValidate },
) => {
  const doc = new Model(data);
  await doc.validate();
  if (afterValidate) await afterValidate(doc);
  const sequence = await getNextSequence(sequenceName);
  assignNumber(doc, sequence);
  await doc.save();
  return doc;
};

module.exports = { PENDING_NUMBER, getNextSequence, createWithSequence };
