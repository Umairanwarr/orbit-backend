import { Body, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { resOK } from '../../core/utils/res.helpers';
import { JobsService } from './jobs.service';

@V1Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @UseGuards(VerifiedAuthGuard)
  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const doc = await this.jobs.createJob(req.user._id, body);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get()
  async list(@Query() query: any) {
    const data = await this.jobs.list(query);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('categories')
  async categories() {
    return resOK(this.jobs.getCategories());
  }

  @UseGuards(VerifiedAuthGuard)
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const doc = await this.jobs.getById(id);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const doc = await this.jobs.updateJob(req.user._id, id, body);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const res = await this.jobs.deleteJob(req.user._id, id);
    return resOK(res);
  }
}

@V1Controller('job-seekers')
export class JobSeekerController {
  constructor(private readonly jobs: JobsService) {}

  @UseGuards(VerifiedAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    const doc = await this.jobs.getMyProfile(req.user._id);
    return resOK(doc ?? null);
  }

  @UseGuards(VerifiedAuthGuard)
  @Patch('me')
  async update(@Req() req: any, @Body() body: any) {
    const doc = await this.jobs.upsertMyProfile(req.user._id, body);
    return resOK(doc);
  }
}
