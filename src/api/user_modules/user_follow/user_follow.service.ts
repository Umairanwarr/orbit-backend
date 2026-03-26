import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { FilterQuery, PaginateModel, QueryOptions, UpdateQuery } from "mongoose";
import mongoose from "mongoose";
import { PaginationParameters } from "mongoose-paginate-v2";
import { IUserFollow } from "./entities/user_follow.entity";
import { MongoPeerIdDto } from "../../../core/common/dto/mongo.peer.id.dto";
import { UserService } from "../user/user.service";
import { BanService } from "../../ban/ban.service";

@Injectable()
export class UserFollowService {
  constructor(
    @InjectModel("user_follow") private readonly model: PaginateModel<IUserFollow>,
    private readonly userService: UserService,
    private readonly banService: BanService
  ) {}

  async follow(dto: MongoPeerIdDto) {
    if (dto.peerId?.toString?.() === dto.myUser._id?.toString?.()) {
      throw new BadRequestException("You cant follow your self");
    }

    const ban = await this.banService.getBan(dto.myUser._id, dto.peerId);
    if (ban) {
      throw new BadRequestException("You cant follow this user");
    }

    await this.userService.findByIdOrThrow(dto.peerId);

    try {
      await this.model.create({
        followerId: new mongoose.Types.ObjectId(dto.myUser._id),
        followingId: new mongoose.Types.ObjectId(dto.peerId),
      } as any);
      return "success";
    } catch (e: any) {
      if (e?.code === 11000) {
        return "Already following";
      }
      throw e;
    }
  }

  async unfollow(dto: MongoPeerIdDto) {
    if (dto.peerId?.toString?.() === dto.myUser._id?.toString?.()) {
      throw new BadRequestException("You cant unfollow your self");
    }

    const existing = await this.model.findOne({
      followerId: dto.myUser._id,
      followingId: dto.peerId,
    } as any);

    if (!existing) {
      return "Already unfollowed";
    }

    await this.model.findByIdAndDelete(existing._id);
    return "success";
  }

  async isFollowing(myId: string, peerId: string): Promise<boolean> {
    const doc = await this.model
      .findOne({ followerId: myId, followingId: peerId } as any)
      .select("_id")
      .lean();
    return !!doc;
  }

  async followersCount(userId: string): Promise<number> {
    return this.model.countDocuments({ followingId: userId } as any);
  }

  async followingCount(userId: string): Promise<number> {
    return this.model.countDocuments({ followerId: userId } as any);
  }

  async getCounts(userId: string) {
    const [followersCount, followingCount] = await Promise.all([
      this.followersCount(userId),
      this.followingCount(userId),
    ]);

    return { followersCount, followingCount };
  }

  private async ensureCanViewFollowLists(targetUserId: string, requesterId: string) {
    if (!requesterId) {
      throw new ForbiddenException("Unauthorized");
    }

    if (targetUserId.toString() === requesterId.toString()) {
      return;
    }

    const targetUser = await this.userService.findByIdOrThrow(
      targetUserId,
      "userPrivacy"
    );

    if ((targetUser as any)?.userPrivacy?.hideFollowing === true) {
      throw new ForbiddenException("This user's follow lists are private");
    }
  }

  async paginateFollowers(userId: string, requesterId: string, dto: any) {
    await this.ensureCanViewFollowLists(userId, requesterId);

    const paginationParameters = new PaginationParameters({
      query: {
        limit: 20,
        page: 1,
        sort: "-_id",
        ...dto,
        populate: [
          {
            path: "followerId",
            select: "fullName bio userImage",
          },
        ],
      },
    }).get();

    const filter: any = { followingId: userId };
    paginationParameters[0] = filter;

    return (this.model as any).paginate(...paginationParameters);
  }

  async paginateFollowing(userId: string, requesterId: string, dto: any) {
    await this.ensureCanViewFollowLists(userId, requesterId);

    const paginationParameters = new PaginationParameters({
      query: {
        limit: 20,
        page: 1,
        sort: "-_id",
        ...dto,
        populate: [
          {
            path: "followingId",
            select: "fullName bio userImage",
          },
        ],
      },
    }).get();

    const filter: any = { followerId: userId };
    paginationParameters[0] = filter;

    return (this.model as any).paginate(...paginationParameters);
  }

  // Additional helpers (kept generic for consistency with other services)
  create(obj: Partial<IUserFollow>, session?) {
    return this.model.create([obj] as any, { session } as any);
  }

  createMany(obj: Partial<IUserFollow>[], session?: any) {
    return this.model.create(obj as any, { session } as any);
  }

  findAll(
    filter: FilterQuery<IUserFollow> = {},
    select?: string | null,
    options?: QueryOptions<IUserFollow> | null
  ) {
    return this.model.find(filter, select as any, options as any);
  }

  findOne(filter: FilterQuery<IUserFollow>, select?: string | null) {
    return this.model.findOne(filter, select as any);
  }

  findById(id: string, select?: string | null) {
    return this.model.findById(id, select as any);
  }

  findByIdAndUpdate(id: string, update: UpdateQuery<IUserFollow> | null) {
    return this.model.findByIdAndUpdate(id, update as any);
  }

  findByIdAndDelete(id: string) {
    return this.model.findByIdAndDelete(id);
  }
}
