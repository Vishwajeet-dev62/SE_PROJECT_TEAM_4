"use strict";

class TaskReminderService {
  constructor({ taskReminderRepository }) {
    this.taskReminderRepository = taskReminderRepository;
  }

  async sendDueReminders() {
    return this.taskReminderRepository.sendDueReminders();
  }
}

module.exports = { TaskReminderService };
