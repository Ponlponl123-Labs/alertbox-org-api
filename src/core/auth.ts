import Elysia from "elysia";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { ip } from "elysia-ip";
import { Prisma } from "@/generated/prisma/client";
import { basicUserSelect } from "@/consts/session";

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

/**
 * Elysia plugin that provides authentication verification.
 * Derives a helper function `getAuthenticatedUser(select?)` in the request context.
 */
export const auth = new Elysia({ name: "auth" })
  .use(ip({ headersFirst: true }))
  .derive({ as: "global" }, ({ headers, ip }) => {
    return {
      /**
       * Validates the Authorization header and retrieves the authenticated Me instance.
       * 
       * @param select - Optional selection fields for the user query.
       * @throws {BadRequestError} If the Authorization header is missing or invalid.
       * @throws {UnauthorizedError} If the session token is invalid or expired.
       */
      async getAuthenticatedUser<S extends Prisma.UserSelect = typeof basicUserSelect>(
        select?: S,
      ): Promise<Omit<Me<S>, "data"> & { data: Prisma.UserGetPayload<{ select: S }> & { id: string } }> {
        const authHeader = headers.authorization;
        if (!authHeader) {
          throw new BadRequestError("Bad Request");
        }
        const token = isBearerToken(authHeader);
        if (!token) {
          throw new BadRequestError("Bad Request");
        }
        const user = await new Me().use(token, ip, select as any);
        if (!user || !user.data) {
          throw new UnauthorizedError("Unauthorized");
        }
        return user as any;
      },
    };
  });
