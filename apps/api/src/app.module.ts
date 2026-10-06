import { DynamicModule, Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import {
  DestinationStream,
  type SerializedRequest,
  type SerializedResponse,
} from "pino";
import { type Options } from "pino-http";
import { ConfigModule } from "./config/config.module.js";
import { Env } from "./config/env.js";
import { DatabaseModule } from "./database.module.js";
import { HealthModule } from "./health/health.module.js";

export interface AppModuleOptions {
  logDestination?: DestinationStream;
}

@Module({
  imports: [HealthModule],
})
export class AppModule {
  static forRoot(env: Env, options?: AppModuleOptions): DynamicModule {
    const pinoOptions = {
      serializers: {
        req: (req: SerializedRequest) => ({
          id: req.id,
          method: req.method,
          url: req.url.split("?")[0],
        }),
        res: (res: SerializedResponse) => ({
          statusCode: res.statusCode,
        }),
      },
    };

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        DatabaseModule.forRoot(),
        LoggerModule.forRoot({
          pinoHttp: options?.logDestination
            ? [pinoOptions, options.logDestination]
            : pinoOptions,
        }),
      ],
    };
  }
}
