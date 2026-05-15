import { Global, Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule } from "@nestjs/config";
import { AuthClientService } from "./auth_client.service";

@Global()
@Module({
  imports: [
    ConfigModule,
    HttpModule.register({
      timeout: 15000,
      maxRedirects: 3,
    }),
  ],
  providers: [AuthClientService],
  exports: [AuthClientService],
})
export class AuthClientModule {}
