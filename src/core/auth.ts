import Elysia from "elysia";
import { Me } from "@/classes/me";
import { extractRequestTokenWithSource } from "@/utils/bearer-token";
import { isAllowedOrigin } from "@/utils/security";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { VIOLATION_BLOCK_LEVEL } from "@/consts/violation";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Error thrown when a request lacks valid authentication credentials.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Error thrown when a request has invalid or malformed arguments.
 */
export class BadRequestError extends Error {
  constructor(message = "Bad Request") {
    super(message);
    this.name = "BadRequestError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Elysia plugin that provides authentication verification.
 * Derives a helper function `getAuthenticatedUser(select?)` in the request context.
 */
export const auth = new Elysia({ name: "auth" })
  .use(ip({ headersFirst: true }))
  .derive({ as: "global" }, ({ headers, cookie, request, ip }) => {
    return {
      /**
       * Validates Bearer header or HttpOnly USRSS cookie and retrieves the authenticated Me instance.
       * 
       * @param select - Optional selection fields for the user query.
       * @throws {BadRequestError} If authentication credentials are missing or invalid.
       * @throws {UnauthorizedError} If the session token is invalid, expired, or fails CSRF origin check.
       */
      async getAuthenticatedUser(
        select?: any,
      ): Promise<Me & { data: any }> {
        const { token, source } = extractRequestTokenWithSource(headers as any, cookie);
        if (!token) {
          throw new BadRequestError("Bad Request");
        }
        if (source === "cookie" && MUTATION_METHODS.has(request.method)) {
          const sourceOrigin = headers.origin || headers.referer;
          if (
            headers["sec-fetch-site"] === "cross-site" ||
            (sourceOrigin && !isAllowedOrigin(sourceOrigin))
          ) {
            throw new UnauthorizedError("Invalid origin");
          }
        }
        const user = await new Me().use(token, ip, select ?? basicUserSelect);
        if (!user || !user.data) {
          throw new UnauthorizedError("Unauthorized");
        }
        if (
          MUTATION_METHODS.has(request.method) &&
          Number(user.data.violationLevel ?? 0) >= VIOLATION_BLOCK_LEVEL
        ) {
          throw new ForbiddenError("Account action blocked due to policy violations");
        }
        return user as any;
      },
    };
  });
