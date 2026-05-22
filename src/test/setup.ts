// Vitest setup file. Loads local environment variables so tests that touch
// the database or external APIs work the same way the Next.js runtime does.
import { config } from "dotenv";

config({ path: ".env.local" });
