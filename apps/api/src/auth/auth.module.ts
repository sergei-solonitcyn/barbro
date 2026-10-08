import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GoogleIdentityProvider } from "./google-identity-provider.js";
import { IdentityProvider } from "./identity-provider.js";
import { MeController } from "./me.controller.js";

@Module({
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    { provide: IdentityProvider, useClass: GoogleIdentityProvider },
  ],
})
export class AuthModule {}
