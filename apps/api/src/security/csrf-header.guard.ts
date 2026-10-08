import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// CSRF control from the threat model: every state-changing request must carry X-Requested-With.
// A cross-origin form cannot set a custom header, and a cross-origin fetch with one needs a CORS
// preflight that only our own origin passes.
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(req.method) || req.headers["x-requested-with"]) {
      return true;
    }
    throw new ForbiddenException();
  }
}
