import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, FilterQuery } from 'mongoose';
import { ITicket } from './ticket.entity';
import { FileUploaderService } from '../../common/file_uploader/file_uploader.service';

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel('Ticket') private readonly ticketModel: Model<ITicket>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly fileUploader: FileUploaderService,
  ) {}

  async createTicket(userId: string, body: any, file?: Express.Multer.File) {
    const priceKes = Math.floor(Number(body.priceKes || 0));
    if (!body.name || body.name.toString().trim().length === 0) {
      throw new BadRequestException('Ticket name is required');
    }
    if (!priceKes || priceKes <= 0) {
      throw new BadRequestException('Price must be greater than 0');
    }
    if (!body.expiryDate) {
      throw new BadRequestException('Expiry date is required');
    }
    const expiryDate = new Date(body.expiryDate);
    if (isNaN(expiryDate.getTime())) {
      throw new BadRequestException('Invalid expiry date');
    }

    const quantity = Math.max(1, Math.floor(Number(body.quantity || 1)));

    // Upload image if provided
    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await this.fileUploader.putImageCropped(file.buffer, userId);
    }

    const doc = await this.ticketModel.create({
      name: body.name.toString().trim(),
      priceKes,
      expiryDate,
      imageUrl,
      category: body.category?.toString().trim() || undefined,
      quantity,
      soldCount: 0,
      uploaderId: new Types.ObjectId(userId),
      isSold: false,
      buyerIds: [],
    });
    return doc;
  }

  async list(params: any, viewerId?: string) {
    const page = parseInt(params.page) || 1;
    const limit = Math.min(parseInt(params.limit) || 20, 100);

    const q: FilterQuery<ITicket> = {};
    const search = (params.q || '').toString().trim();
    if (search) {
      q.$text = { $search: search } as any;
    }
    const category = (params.category || '').toString().trim();
    if (category) {
      q.category = category;
    }
    // By default, show available tickets, plus tickets the viewer owns or bought
    if (params.showAll !== 'true' && viewerId) {
      q.$or = [
        { isSold: false },
        { uploaderId: new Types.ObjectId(viewerId) },
        { buyerIds: new Types.ObjectId(viewerId) },
      ];
    }

    const [docs, total] = await Promise.all([
      this.ticketModel.find(q).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.ticketModel.countDocuments(q),
    ]);

    // Enrich with uploader info and image visibility
    const enriched = await Promise.all(
      docs.map(async (t) => {
        const uploader: any = await this.userModel
          .findById(t.uploaderId)
          .select('fullName userImage')
          .lean();

        // Determine if viewer can see clear image
        const canSeeClearImage = this._canViewImage(t, viewerId);

        const buyerIds = t.buyerIds || [];
        const isBuyer = viewerId ? buyerIds.some((id: any) =>
          id?.toString?.() === viewerId,
        ) : false;

        return {
          ...t,
          uploaderName: uploader?.fullName || '',
          uploaderImage: uploader?.userImage || '',
          remaining: Math.max(0, (t.quantity || 1) - (t.soldCount || 0)),
          isBuyer,
          imageBlurred: t.imageUrl ? !canSeeClearImage : false,
          hasImage: !!t.imageUrl,
        };
      }),
    );

    return { docs: enriched, page, limit, total };
  }

  private _canViewImage(ticket: any, viewerId?: string): boolean {
    if (!viewerId) return false;
    // Uploader can always see their image
    if (ticket.uploaderId?.toString?.() === viewerId) return true;
    // Any buyer can see image after purchase
    const buyerIds = ticket.buyerIds || [];
    const buyerIdStrings = buyerIds.map((id: any) =>
      id?.toString?.() ?? id?.toString?.() ?? '',
    );
    if (buyerIdStrings.includes(viewerId)) return true;
    return false;
  }

  async getMyTickets(userId: string) {
    const docs = await this.ticketModel
      .find({ uploaderId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
    return docs;
  }

  async getById(id: string, viewerId?: string) {
    const ticket = await this.ticketModel.findById(id).lean();
    if (!ticket) throw new NotFoundException('Ticket not found');

    const uploader: any = await this.userModel
      .findById(ticket.uploaderId)
      .select('fullName userImage')
      .lean();

    const canSeeClearImage = this._canViewImage(ticket, viewerId);

    const buyerIds = ticket.buyerIds || [];
    const isBuyer = viewerId ? buyerIds.some((id: any) =>
      id?.toString?.() === viewerId,
    ) : false;

    return {
      ...ticket,
      uploaderName: uploader?.fullName || '',
      uploaderImage: uploader?.userImage || '',
      remaining: Math.max(0, (ticket.quantity || 1) - (ticket.soldCount || 0)),
      isBuyer,
      imageBlurred: ticket.imageUrl ? !canSeeClearImage : false,
      hasImage: !!ticket.imageUrl,
    };
  }

  async buyTicket(ticketId: string, buyerId: string) {
    const ticket = await this.ticketModel.findById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.isSold) throw new BadRequestException('Ticket already sold');
    if (ticket.uploaderId.toString() === buyerId) {
      throw new BadRequestException('You cannot buy your own ticket');
    }

    // Check expiry
    if (ticket.expiryDate < new Date()) {
      throw new BadRequestException('Ticket has expired');
    }

    // Check quantity available
    const available = (ticket.quantity || 1) - (ticket.soldCount || 0);
    if (available <= 0) {
      throw new BadRequestException('Tickets sold out');
    }

    // Check if buyer already bought (one ticket per buyer)
    const buyerIds = ticket.buyerIds || [];
    if (buyerIds.some((id: any) => id?.toString?.() === buyerId)) {
      throw new BadRequestException('You already bought this ticket');
    }

    // Check buyer balance atomically
    const buyer = await this.userModel.findOne(
      { _id: new Types.ObjectId(buyerId), balance: { $gte: ticket.priceKes } },
      'balance',
    ).lean();
    if (!buyer) {
      throw new BadRequestException('Insufficient balance');
    }

    // Deduct from buyer
    await this.userModel.findOneAndUpdate(
      { _id: new Types.ObjectId(buyerId), balance: { $gte: ticket.priceKes } },
      { $inc: { balance: -ticket.priceKes } },
      { new: true },
    ).lean();

    // Credit uploader
    await this.userModel.findOneAndUpdate(
      { _id: ticket.uploaderId },
      { $inc: { balance: ticket.priceKes } },
      { new: true },
    ).lean();

    // Update ticket: add buyer, increment soldCount, check if fully sold
    const newSoldCount = (ticket.soldCount || 0) + 1;
    const quantity = ticket.quantity || 1;

    ticket.soldCount = newSoldCount;
    ticket.buyerIds.push(new Types.ObjectId(buyerId));
    if (newSoldCount >= quantity) {
      ticket.isSold = true;
    }
    await ticket.save();

    return {
      _id: ticket._id,
      name: ticket.name,
      priceKes: ticket.priceKes,
      imageUrl: ticket.imageUrl,
      isSold: ticket.isSold,
      remaining: quantity - newSoldCount,
      soldCount: newSoldCount,
    };
  }

  async deleteTicket(userId: string, ticketId: string) {
    const ticket = await this.ticketModel.findById(ticketId);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isOwner =
      ticket.uploaderId?.equals?.(userId) === true ||
      (ticket.uploaderId?.toString?.() ?? ticket.uploaderId)?.toString?.() === userId;
    if (!isOwner) {
      throw new ForbiddenException('You can only delete your own tickets');
    }

    await this.ticketModel.deleteOne({ _id: ticketId });
    return { deleted: true };
  }
}
