import { vi } from "vitest";

vi.mock("server-only", () => ({}));

// revalidatePath needs an active Next.js request-scoped store that doesn't
// exist when a server action is called directly from a test process. Its
// actual behavior is exercised by the Puppeteer E2E run against the real
// server, not here — these tests are about data/business-rule correctness.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));
