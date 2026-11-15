"use strict";

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Same shape as the task reminder scheduler: one run at startup, then every
// interval, never overlapping, and never keeping the process alive.
function startAuditRetentionScheduler({
  auditRetentionService,
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
      const removed = await auditRetentionService.purgeExpired();
      if (removed > 0) {
        logger.info(`Removed ${removed} expired audit log row(s)`);
      }
    } catch {
      // Never log row contents; the failure itself is enough to investigate.
      logger.error("Audit log retention run failed");
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

module.exports = { DEFAULT_INTERVAL_MS, startAuditRetentionScheduler };
