import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  controllers: [HealthController],
  imports: [DatabaseModule.forRoot()],
})
export class HealthModule {}
