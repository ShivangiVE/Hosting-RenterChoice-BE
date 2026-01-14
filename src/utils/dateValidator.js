exports.validateFutureOrTodayDate = (date, fieldName = "date") => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inputDate = new Date(date);
  inputDate.setHours(0, 0, 0, 0);

  if (isNaN(inputDate.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }

  if (inputDate < today) {
    throw new Error(`${fieldName} cannot be in the past`);
  }
};
