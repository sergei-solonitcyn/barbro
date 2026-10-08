import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import {
  GOOGLE_ISSUER,
  GoogleIdentityProvider,
} from "./google-identity-provider.js";
import { IdentityProvider } from "./identity-provider.js";
import { MeController } from "./me.controller.js";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    {
      provide: IdentityProvider,
      inject: [APP_CONFIG],
      useFactory: (env: Env) =>
        new GoogleIdentityProvider(GOOGLE_ISSUER, env.google),
    },
  ],
})
export class AuthModule {}
