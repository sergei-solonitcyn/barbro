import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "./auth.service.js";
import { SESSION_COOKIE, setSessionCookie } from "./session-cookie.js";

// Lets the request through only with a live session; puts the user on request.user
// and re-issues the cookie when the session was extended.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const token = req.cookies[SESSION_COOKIE];
    const result = token ? this.authService.authenticate(token) : undefined;
    if (!token || !result) {
      throw new UnauthorizedException();
    }

    req.user = result.user;
    if (result.renewedMaxAgeSeconds !== undefined) {
      setSessionCookie(
        http.getResponse<FastifyReply>(),
        token,
        result.renewedMaxAgeSeconds,
      );
    }
    return true;
  }
}
