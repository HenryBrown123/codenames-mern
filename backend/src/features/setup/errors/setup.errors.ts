/**
 * Custom error class for handling unexpected errors in the setup feature
 * Used to differentiate setup-specific errors from other application errors
 */

export class UnexpectedSetupError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "UnexpectedSetupError";
    Object.setPrototypeOf(this, UnexpectedSetupError.prototype);
  }
}
