"use strict";

const { AUDIT_EVENTS } = require("./auditLog");

const RETENTION_DAYS = 365; // SRS TM-SR-007: retained for 1 year
const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 100;

// Removes security audit events older than the retention period.
class AuditRetentionService {
  constructor({
    auditLogRepository,
    retentionDays = RETENTION_DAYS,
    batchSize = BATCH_SIZE,
    maxBatches = MAX_BATCHES_PER_RUN,
  }) {
    this.auditLogRepository = auditLogRepository;
    this.retentionDays = retentionDays;
    this.batchSize = batchSize;
    this.maxBatches = maxBatches;
    this.eventTypes = Object.values(AUDIT_EVENTS);
  }

  // Deletes in small batches so a large backlog never holds long locks.
  // Returns how many rows were removed.
  async purgeExpired() {
    let total = 0;
    for (let batch = 0; batch < this.maxBatches; batch += 1) {
      const deleted = await this.auditLogRepository.purgeOlderThan({
        eventTypes: this.eventTypes,
        retentionDays: this.retentionDays,
        limit: this.batchSize,
      });
      total += deleted;
      if (deleted < this.batchSize) {
        break;
      }
    }
    return total;
  }
}

module.exports = {
  AuditRetentionService,
  BATCH_SIZE,
  MAX_BATCHES_PER_RUN,
  RETENTION_DAYS,
};
