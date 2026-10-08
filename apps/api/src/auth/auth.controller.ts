import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Redirect,
  Req,
  Res,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthService, SESSION_TTL_MS } from "./auth.service.js";
import {
  type AuthTransaction,
  IdentityProvider,
  type VerifiedIdentity,
} from "./identity-provider.js";
import {
  clearSessionCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from "./session-cookie.js";

const OIDC_COOKIE = "barbro_oidc";
const OIDC_COOKIE_PATH = "/api/auth/google";
const SIGN_IN_FAILED = "/?signin=failed";

const transactionSchema = z.object({
  state: z.string().min(1),
  nonce: z.string().min(1),
  codeVerifier: z.string().min(1),
});

function parseTransaction(
  raw: string | undefined,
): AuthTransaction | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const result = transactionSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(IdentityProvider) private readonly idp: IdentityProvider,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("google/start")
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

  @Get("google/callback")
  @Redirect()
  async callback(
    @Query() query: Record<string, string>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    // The transaction is single-use: cleared on success and on every failure.
    reply.clearCookie(OIDC_COOKIE, { path: OIDC_COOKIE_PATH });

    const transaction = parseTransaction(req.cookies[OIDC_COOKIE]);
    if (!transaction) {
      return { url: SIGN_IN_FAILED };
    }

    let identity: VerifiedIdentity;
    try {
      identity = await this.idp.completeAuthorization(query, transaction);
    } catch {
      return { url: SIGN_IN_FAILED };
    }

    if (!identity.emailVerified) {
      return { url: SIGN_IN_FAILED };
    }

    const token = this.authService.signIn(identity);
    setSessionCookie(reply, token, SESSION_TTL_MS / 1000);
    return { url: "/" };
  }

  // Idempotent: succeeds without a session too.
  @Post("logout")
  @HttpCode(204)
  logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): void {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      this.authService.signOut(token);
    }
    clearSessionCookie(reply);
  }
}
