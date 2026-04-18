import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  Query,
} from "@nestjs/common";
import { TicketingService } from "./ticketing.service";
import { VerifiedAuthGuard } from "src/core/guards/verified.auth.guard";

@UseGuards(VerifiedAuthGuard)
@Controller("api/v1/tickets")
export class TicketingController {
  constructor(private readonly ticketingService: TicketingService) {}

  // Get all available upcoming events/buses
  @Get("events")
  async getEvents(@Query("type") eventType?: string) {
    const data = await this.ticketingService.getUpcomingEvents(eventType);
    return { success: true, data };
  }

  // Admin/Organizer creates a new event
  @Post("events")
  async createEvent(@Req() req: any, @Body() body: any) {
    // Note: In production, wrap this in an Admin/Organizer Role Guard
    const data = await this.ticketingService.createEvent(req.user._id, body);
    return { success: true, data };
  }

  // Buy a ticket
  @Post("events/:id/buy")
  async buyTicket(@Req() req: any, @Param("id") eventId: string) {
    const data = await this.ticketingService.buyTicket(req.user._id, eventId);
    return { success: true, data };
  }

  // Get the logged-in user's tickets (for their digital wallet / QR code generation)
  @Get("my-tickets")
  async getMyTickets(@Req() req: any) {
    const data = await this.ticketingService.getMyTickets(req.user._id);
    return { success: true, data };
  }
}
