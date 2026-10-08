import type { FastifyReply } from "fastify";

export const SESSION_COOKIE = "barbro_session";

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  maxAgeSeconds: number,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
}
