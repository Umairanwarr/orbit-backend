import { Body, Delete, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { V1Controller } from '../../core/common/v1-controller.decorator';
import { VerifiedAuthGuard } from '../../core/guards/verified.auth.guard';
import { resOK } from '../../core/utils/res.helpers';
import { TicketsService } from './tickets.service';
import { FileInterceptor } from '@nestjs/platform-express';

@V1Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @UseGuards(VerifiedAuthGuard)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async create(@Req() req: any, @Body() body: any, @UploadedFile() file?: Express.Multer.File) {
    const doc = await this.tickets.createTicket(req.user._id, body, file);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get()
  async list(@Req() req: any, @Query() query: any) {
    const data = await this.tickets.list(query, req.user._id);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get('mine')
  async myTickets(@Req() req: any) {
    const data = await this.tickets.getMyTickets(req.user._id);
    return resOK(data);
  }

  @UseGuards(VerifiedAuthGuard)
  @Get(':id')
  async getOne(@Req() req: any, @Param('id') id: string) {
    const doc = await this.tickets.getById(id, req.user._id);
    return resOK(doc);
  }

  @UseGuards(VerifiedAuthGuard)
  @Post(':id/buy')
  async buy(@Req() req: any, @Param('id') ticketId: string) {
    const result = await this.tickets.buyTicket(ticketId, req.user._id);
    return resOK(result);
  }

  @UseGuards(VerifiedAuthGuard)
  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const result = await this.tickets.deleteTicket(req.user._id, id);
    return resOK(result);
  }
}
