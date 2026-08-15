/**
 * Runs before the test framework is installed.
 *
 * Sets NODE_ENV=test so the Pino logger drops to `silent` — otherwise every
 * request emits a full JSON log line and the actual assertion failure scrolls
 * off the top of the output.
 *
 * The environment schema accepts 'test' as a valid NODE_ENV, so this does not
 * disturb config validation.
 */
process.env.NODE_ENV = 'test';
