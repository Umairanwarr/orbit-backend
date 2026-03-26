import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ArticleSchema } from './article.entity';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { AuthModule } from '../auth/auth.module';
import { FileUploaderModule } from '../../common/file_uploader/file_uploader.module';
import { UserModule } from '../user_modules/user/user.module';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { ArticleCommentSchema } from './schemas/article_comment.schema';
import { ArticleSupportSchema } from './schemas/article_support.schema';
import { PesapalModule } from '../payments/pesapal/pesapal.module';
import { ArticleReportSchema } from './article_report.entity';
import { ArticleReportService } from './article_report.service';
import { NotificationEmitterModule } from '../../common/notification_emitter/notification_emitter.module';
import { UserFollowModule } from '../user_modules/user_follow/user_follow.module';
import { UserDeviceModule } from '../user_modules/user_device/user_device.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Article', schema: ArticleSchema },
      { name: 'ArticleComment', schema: ArticleCommentSchema },
      { name: 'ArticleSupport', schema: ArticleSupportSchema },
      { name: 'article_reports', schema: ArticleReportSchema },
    ]),
    AuthModule,
    FileUploaderModule,
    UserModule,
    PesapalModule,
    NotificationEmitterModule,
    UserFollowModule,
    UserDeviceModule,
  ],
  providers: [ArticlesService, ArticleReportService, VerifiedAuthGuard],
  exports: [ArticlesService, ArticleReportService],
  controllers: [ArticlesController],
})
export class ArticlesModule { }
