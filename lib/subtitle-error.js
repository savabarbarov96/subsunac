class SubtitleError extends Error {
  constructor(status, message, cause) {
    super(message, { cause });
    this.status = status;
  }
}
module.exports = { SubtitleError };
