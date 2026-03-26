/**
 * Verification Module
 */
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VerificationRequestSchema } from './verification_request.entity';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { FileUploaderModule } from '../../common/file_uploader/file_uploader.module';
import { AppConfigModule } from '../app_config/app_config.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user_modules/user/user.module';
import { VerificationExpiryCron } from './verification_expiry.cron';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'verification_requests', schema: VerificationRequestSchema },
    ]),
    FileUploaderModule,
    AppConfigModule,
    AuthModule,
    UserModule,
  ],
  providers: [VerificationService, VerificationExpiryCron],
  controllers: [VerificationController],
  exports: [VerificationService],
})
export class VerificationModule {}
