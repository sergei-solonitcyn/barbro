import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GoogleIdentityProvider } from "./google-identity-provider.js";
import { IdentityProvider } from "./identity-provider.js";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: IdentityProvider, useClass: GoogleIdentityProvider },
  ],
})
export class AuthModule {}
