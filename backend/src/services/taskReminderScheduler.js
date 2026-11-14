"use strict";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

function startTaskReminderScheduler({
  taskReminderService,
  intervalMs = DEFAULT_INTERVAL_MS,
  logger = console,
}) {
  let running = false;

  async function run() {
    if (running) {
      return;
    }

    running = true;

    try {
      const sentCount = await taskReminderService.sendDueReminders();

      if (sentCount > 0) {
        logger.info(`Sent ${sentCount} task reminder(s)`);
      }
    } catch (error) {
      logger.error("Task reminder scheduler failed:", error);
    } finally {
      running = false;
    }
  }

  void run();

  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return function stop() {
    clearInterval(timer);
  };
}

module.exports = {
  startTaskReminderScheduler,
  DEFAULT_INTERVAL_MS,
};
