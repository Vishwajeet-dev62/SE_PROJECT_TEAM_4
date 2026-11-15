const assert = require("node:assert/strict");
const test = require("node:test");
const { AuditLogRepository } = require("../src/repositories/auditLogRepository");
const { AUDIT_EVENTS } = require("../src/services/auditLog");
const { AuditRetentionService, RETENTION_DAYS } = require("../src/services/auditRetentionService");
const { startAuditRetentionScheduler } = require("../src/services/auditRetentionScheduler");

test("retention keeps security events for one year", () => {
  assert.equal(RETENTION_DAYS, 365);
  const service = new AuditRetentionService({ auditLogRepository: {} });
  assert.equal(service.retentionDays, 365);
  assert.deepEqual(service.eventTypes, Object.values(AUDIT_EVENTS));
  for (const activityType of ["TASK_CREATED", "TASK_UPDATED", "TASK_ASSIGNED"]) {
    assert.equal(service.eventTypes.includes(activityType), false, activityType);
  }
});

test("the repository deletes only listed event types older than the cutoff, in a bounded batch", async () => {
  const calls = [];
  const repository = new AuditLogRepository({
    execute: async (sql, params) => {
      calls.push([sql.replace(/\s+/g, " ").trim(), params]);
      return [{ affectedRows: 7 }];
    },
  });
  const removed = await repository.purgeOlderThan({
    eventTypes: ["LOGIN_FAILED", "ROLE_CHANGED"],
    retentionDays: 365,
    limit: 500,
  });
  assert.equal(removed, 7);
  assert.match(calls[0][0], /^DELETE FROM audit_logs WHERE event_type IN \(\?, \?\)/);
  assert.match(calls[0][0], /created_at < DATE_SUB\(UTC_TIMESTAMP\(3\), INTERVAL \? DAY\)/);
  assert.match(calls[0][0], /ORDER BY id LIMIT 500$/);
  assert.deepEqual(calls[0][1], ["LOGIN_FAILED", "ROLE_CHANGED", 365]);
});

test("the repository rejects unsafe arguments before touching the database", async () => {
  const repository = new AuditLogRepository({ execute: async () => assert.fail("must not run") });
  for (const args of [
    { eventTypes: [], retentionDays: 365, limit: 10 },
    { eventTypes: ["X"], retentionDays: 0, limit: 10 },
    { eventTypes: ["X"], retentionDays: 365, limit: 0 },
    { eventTypes: ["X"], retentionDays: 365, limit: "10; DROP TABLE users" },
    { eventTypes: ["X"], retentionDays: 365, limit: 99999 },
  ]) {
    await assert.rejects(repository.purgeOlderThan(args), Error, JSON.stringify(args));
  }
});

test("a purge run deletes in batches until a short batch signals the end", async () => {
  const batches = [3, 3, 1];
  const seen = [];
  const service = new AuditRetentionService({
    auditLogRepository: {
      purgeOlderThan: async (args) => { seen.push(args); return batches.shift(); },
    },
    batchSize: 3,
  });
  assert.equal(await service.purgeExpired(), 7);
  assert.equal(seen.length, 3);
  assert.equal(seen[0].retentionDays, 365);
  assert.equal(seen[0].limit, 3);
});

test("a purge run stops at the batch cap even if rows keep coming", async () => {
  let calls = 0;
  const service = new AuditRetentionService({
    auditLogRepository: { purgeOlderThan: async () => { calls += 1; return 5; } },
    batchSize: 5,
    maxBatches: 4,
  });
  assert.equal(await service.purgeExpired(), 20);
  assert.equal(calls, 4);
});

test("the scheduler runs at startup, logs the count and never logs row details on failure", async () => {
  const logs = [];
  const errors = [];
  const stop = startAuditRetentionScheduler({
    auditRetentionService: { purgeExpired: async () => 4 },
    intervalMs: 60000,
    logger: { info: (m) => logs.push(m), error: (m) => errors.push(m) },
  });
  await new Promise((resolve) => setImmediate(resolve));
  stop();
  assert.deepEqual(logs, ["Removed 4 expired audit log row(s)"]);

  const stopFailing = startAuditRetentionScheduler({
    auditRetentionService: { purgeExpired: async () => { throw new Error("secret detail"); } },
    intervalMs: 60000,
    logger: { info: () => {}, error: (m) => errors.push(m) },
  });
  await new Promise((resolve) => setImmediate(resolve));
  stopFailing();
  assert.deepEqual(errors, ["Audit log retention run failed"]);
});

test("the scheduler never overlaps runs and stop() cancels the timer", async () => {
  let active = 0;
  let maxActive = 0;
  let runs = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const stop = startAuditRetentionScheduler({
    auditRetentionService: {
      purgeExpired: async () => {
        runs += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        await gate;
        active -= 1;
        return 0;
      },
    },
    intervalMs: 5,
    logger: { info: () => {}, error: () => {} },
  });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(maxActive, 1);
  assert.equal(runs, 1);
  release();
  stop();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const after = runs;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(runs, after);
});
