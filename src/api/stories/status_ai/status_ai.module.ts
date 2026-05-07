import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "../../auth/auth.module";
import { StatusAiController } from "./status_ai.controller";
import { StatusAiService } from "./status_ai.service";

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [StatusAiController],
  providers: [StatusAiService],
  exports: [StatusAiService],
})
export class StatusAiModule {}

