import { fileURLToPath } from "node:url";
import {
  DynamicModule,
  Inject,
  Module,
  OnApplicationShutdown,
} from "@nestjs/common";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { APP_CONFIG } from "./config/config.module.js";
import { type Env } from "./config/env.js";

export const SQLITE = Symbol("SQLITE");
export const DB_CLIENT = Symbol("DB_CLIENT");

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(SQLITE) private readonly sqlite: Database.Database) {}

  onApplicationShutdown() {
    this.sqlite.close();
  }

  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: SQLITE,
          inject: [APP_CONFIG],
          useFactory: (config: Env) => {
            const sqlite = new Database(config.dbPath);
            sqlite.pragma("foreign_keys = ON");
            sqlite.pragma("journal_mode = WAL");
            sqlite.pragma("busy_timeout = 5000");
            return sqlite;
          },
        },
        {
          provide: DB_CLIENT,
          inject: [SQLITE],
          useFactory: (sqlite: Database.Database) => {
            const db = drizzle(sqlite);
            migrate(db, { migrationsFolder });
            return db;
          },
        },
      ],
      exports: [DB_CLIENT],
    };
  }
}
