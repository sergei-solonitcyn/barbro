import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { sql } from "drizzle-orm";
import { type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { APP_CONFIG } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { DB_CLIENT } from "../database.module.js";

@Controller("health")
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: Env,
    @Inject(DB_CLIENT) private readonly db: BetterSQLite3Database,
  ) {}
  @Get()
  health() {
    try {
      this.db.get(sql`SELECT 1`);
    } catch {
      throw new ServiceUnavailableException({
        db: "error",
        revision: this.config.revision,
      });
    }
    return {
      revision: this.config.revision,
      db: "ok",
    };
  }
}
