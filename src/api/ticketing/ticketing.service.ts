import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { v4 as uuidv4 } from "uuid"; // Standard library for generating unique ticket codes
import { TicketEvent, TicketEventDocument } from "./entity/ticket-event.schema";
import {
  TicketPurchase,
  TicketPurchaseDocument,
} from "./entity/ticket-purchase.schema";

@Injectable()
export class TicketingService {
  constructor(
    @InjectModel(TicketEvent.name)
    private readonly eventModel: Model<TicketEventDocument>,
    @InjectModel(TicketPurchase.name)
    private readonly purchaseModel: Model<TicketPurchaseDocument>,
    @InjectModel("User") private readonly userModel: Model<any>,
    @InjectModel("AppConfig") private readonly configModel: Model<any>,
  ) {}

  // --- 1. Admin/Organizer Creates an Event ---
  async createEvent(creatorId: string, eventData: Partial<TicketEvent>) {
    const newEvent = await this.eventModel.create({
      ...eventData,
      creatorId,
      availableSeats: eventData.totalCapacity, // Starts fully available
    });
    return newEvent;
  }

  // --- 2. List Events for Users ---
  async getUpcomingEvents(eventType?: string) {
    const query: any = {
      eventDate: { $gte: new Date() }, // Only show future events
      availableSeats: { $gt: 0 }, // Only show events with tickets left
    };

    if (eventType) {
      query.eventType = eventType.toUpperCase();
    }

    return this.eventModel.find(query).sort({ eventDate: 1 }).lean();
  }

  // --- 3. Buy a Ticket (Wallet Integration) ---
  async buyTicket(userId: string, eventId: string) {
    // 1. Check if event exists and has seats
    const event = await this.eventModel.findById(eventId);
    if (!event) throw new NotFoundException("Event not found");
    if (event.availableSeats <= 0)
      throw new BadRequestException("This event is completely sold out");

    // 2. Calculate Costs & Commission (Feature 4)
    const config = await this.configModel.findOne();
    const commissionPercent = config?.transactionCommissionPercent || 0;

    // Using the same financial logic as the P2P wallet
    const commissionAmount = (event.price * commissionPercent) / 100;
    const totalDeduction = event.price + commissionAmount;

    // 3. Deduct from User Wallet
    const user = await this.userModel.findOneAndUpdate(
      { _id: userId, balance: { $gte: totalDeduction } },
      { $inc: { balance: -totalDeduction } },
      { new: true },
    );

    if (!user) {
      throw new BadRequestException(
        `Insufficient balance. You need ${totalDeduction} to purchase this ticket (includes Orbit commission).`,
      );
    }

    // 4. Issue the Ticket
    const ticketCode = `ORBIT-${uuidv4().substring(0, 8).toUpperCase()}`;
    const purchase = await this.purchaseModel.create({
      eventId: event._id,
      buyerId: userId,
      amountPaid: event.price,
      commissionTaken: commissionAmount,
      ticketCode,
      status: "VALID",
    });

    // 5. Reserve the Seat
    await this.eventModel.findByIdAndUpdate(event._id, {
      $inc: { availableSeats: -1 },
    });

    return {
      success: true,
      message: "Ticket purchased successfully",
      ticket: purchase,
      newWalletBalance: user.balance,
    };
  }

  // --- 4. User views their purchased tickets ---
  async getMyTickets(userId: string) {
    return this.purchaseModel
      .find({ buyerId: userId })
      .populate("eventId") // Pulls in the event details (title, time, location)
      .sort({ createdAt: -1 })
      .lean();
  }
}
