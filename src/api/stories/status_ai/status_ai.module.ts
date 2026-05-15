import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthClientModule } from "src/common/auth_client/auth_client.module";
import { StatusAiController } from "./status_ai.controller";
import { StatusAiService } from "./status_ai.service";

@Module({
  imports: [ConfigModule, AuthClientModule],
  controllers: [StatusAiController],
  providers: [StatusAiService],
  exports: [StatusAiService],
})
export class StatusAiModule {}

