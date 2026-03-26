import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobSchema } from './job.entity';
import { JobSeekerProfileSchema } from './job_seeker_profile.entity';
import { JobsService } from './jobs.service';
import { JobsController, JobSeekerController } from './jobs.controller';
import { JobsPublicController } from './jobs_public.controller';
import { AuthModule } from '../auth/auth.module';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { UserSchema } from '../user_modules/user/entities/user.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'Job', schema: JobSchema },
      { name: 'JobSeekerProfile', schema: JobSeekerProfileSchema },
      { name: 'User', schema: UserSchema },
    ]),
    AuthModule,
  ],
  providers: [JobsService, VerifiedAuthGuard],
  controllers: [JobsController, JobSeekerController, JobsPublicController],
})
export class JobsModule {}
