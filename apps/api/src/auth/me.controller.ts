import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./current-user.decorator.js";
import { SessionGuard } from "./session.guard.js";
import { clearSessionCookie } from "./session-cookie.js";
import { type SessionUser } from "./session-user.js";

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Get()
  me(@CurrentUser() user: SessionUser) {
    return { email: user.email };
  }

  // Deletes the account and signs out every device.
  @Delete()
  @HttpCode(204)
  delete(
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): void {
    this.authService.deleteUser(user.id);
    clearSessionCookie(reply);
  }
}
