import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { ConfigModule } from "@nestjs/config";

import { AuthModule } from "../../auth/auth.module";
import { UserModule } from "../../user_modules/user/user.module";

import { PesapalController } from "./pesapal.controller";
import { PesapalService } from "./pesapal.service";

import {
  PesapalTransaction,
  PesapalTransactionSchema,
} from "./schemas/pesapal-transaction.schema";

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PesapalTransaction.name, schema: PesapalTransactionSchema },
      { name: "User", schema: UserSchema },
    ]),
    AuthModule,
    UserModule,
  ],
  controllers: [PesapalController],
  providers: [PesapalService],
  exports: [PesapalService],
})
export class PesapalModule {}
