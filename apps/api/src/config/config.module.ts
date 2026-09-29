import { DynamicModule, Module } from "@nestjs/common";
import { Env } from "./env.js";

export const APP_CONFIG = Symbol("APP_CONFIG");

@Module({})
export class ConfigModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        {
          provide: APP_CONFIG,
          useValue: env,
        },
      ],
      exports: [APP_CONFIG],
    };
  }
}
