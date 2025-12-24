import { os } from "@orpc/server";
import { z } from "zod";

/**
 * Shared oRPC "base" instance with type-safe error definitions.
 *
 * IMPORTANT:
 * - `data` is sent to the client; keep it non-sensitive.
 * - Prefer throwing `errors.XYZ()` over `throw new Error(...)` so clients can
 *   distinguish error types.
 */
export const orpc = os.errors({
  BAD_REQUEST: {
    data: z
      .object({
        field: z.string().optional(),
        reason: z.string().optional(),
      })
      .optional(),
  },
  NOT_FOUND: {
    data: z
      .object({
        resource: z.string().optional(),
        id: z.string().optional(),
      })
      .optional(),
  },
  CONFLICT: {
    data: z
      .object({
        reason: z.string().optional(),
      })
      .optional(),
  },
  INVALID_STATE: {
    data: z
      .object({
        expected: z.string().optional(),
        actual: z.string().optional(),
      })
      .optional(),
  },
  RATE_LIMITED: {
    data: z
      .object({
        retryAfter: z.number().int().min(1),
      })
      .optional(),
  },
  INTERNAL_SERVER_ERROR: {},
  UNAUTHORIZED: {},
  FORBIDDEN: {},
});
