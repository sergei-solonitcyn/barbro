import { Controller, Get, Inject } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module.js";
import { type Env } from "../config/env.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: Env) {}
  @Get()
  health() {
    return {
      revision: this.config.revision,
      status: "ok",
    };
  }
}
