const jobs = [];

function registerJob({ name, cronExpression, task }) {
  if (!name || !cronExpression || !task) {
    throw new Error(
      "[JobRegistry] name, cronExpression, and task are all required",
    );
  }
  if (jobs.some((j) => j.name === name)) {
    throw new Error(`[JobRegistry] Duplicate job name: ${name}`);
  }
  jobs.push({ name, cronExpression, task });
}

function getJobs() {
  return jobs;
}

module.exports = { registerJob, getJobs };
