/**
 * Runs once when the Node server starts. Authentication must not fall back
 * to a built-in secret, so a missing JWT_SECRET stops the process here.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.JWT_SECRET?.trim()) {
    throw new Error(
      "JWT_SECRET is not set. Refusing to start until it is set in the environment."
    );
  }
}
