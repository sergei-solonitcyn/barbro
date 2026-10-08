import {
  Controller,
  Get,
  Inject,
  Query,
  Redirect,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AuthService, SESSION_TTL_MS } from "./auth.service.js";
import { type AuthTransaction, IdentityProvider } from "./identity-provider.js";

const OIDC_COOKIE = "barbro_oidc";
const OIDC_COOKIE_PATH = "/api/auth/google";
const SESSION_COOKIE = "barbro_session";

@Controller("auth/google")
export class AuthController {
  constructor(
    @Inject(IdentityProvider) private readonly idp: IdentityProvider,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("start")
  @Redirect()
  async start(@Res({ passthrough: true }) reply: FastifyReply) {
    const { url, transaction } = await this.idp.startAuthorization();
    reply.setCookie(OIDC_COOKIE, JSON.stringify(transaction), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: OIDC_COOKIE_PATH,
      maxAge: 600,
    });
    return { url: url.href };
  }

  @Get("callback")
  @Redirect()
  async callback(
    @Query() query: Record<string, string>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    // A missing or malformed cookie is handled by the next tests.
    const transaction = JSON.parse(
      req.cookies[OIDC_COOKIE] ?? "",
    ) as AuthTransaction;
    const identity = await this.idp.completeAuthorization(query, transaction);
    const token = this.authService.signIn(identity);

    reply.clearCookie(OIDC_COOKIE, { path: OIDC_COOKIE_PATH });
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS / 1000,
    });
    return { url: "/" };
  }
}
