export interface SessionUser {
  id: number;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}
