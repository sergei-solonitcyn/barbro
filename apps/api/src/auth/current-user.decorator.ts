import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { type SessionUser } from "./session-user.js";

// Valid only behind SessionGuard, which sets request.user.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionUser | undefined =>
    context.switchToHttp().getRequest<FastifyRequest>().user,
);
