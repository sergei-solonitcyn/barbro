import { Controller, Get, UseGuards } from "@nestjs/common";
import { CurrentUser } from "./current-user.decorator.js";
import { SessionGuard } from "./session.guard.js";
import { type SessionUser } from "./session-user.js";

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  @Get()
  me(@CurrentUser() user: SessionUser) {
    return { email: user.email };
  }
}
