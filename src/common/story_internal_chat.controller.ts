import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";
import { v4 as uuidv4 } from "uuid";
import { AuthClientService } from "./auth_client/auth_client.service";
import { ChannelService } from "../chat/channel/services/channel.service";
import { MessageChannelService } from "../chat/channel/services/message.channel.service";
import { SendMessageDto } from "../chat/channel/dto/send.message.dto";
import { MongoPeerIdDto } from "../core/common/dto/mongo.peer.id.dto";
import { MessageType } from "../core/utils/enums";
import { SocketIoService } from "../chat/socket_io/socket_io.service";
import { resOK } from "../core/utils/res.helpers";

type StoryPeerMessageBody = {
  peerId: string;
  content: string;
  messageType?: MessageType;
  attachment?: string;
  localId?: string;
  platform?: string;
};

type StorySocketEmitBody = {
  event: string;
  payload: string;
};

@Controller("api/v1/internal/story")
export class StoryInternalChatController {
  constructor(
    private readonly config: ConfigService,
    private readonly authClient: AuthClientService,
    private readonly channelService: ChannelService,
    private readonly messageChannelService: MessageChannelService,
    private readonly socketIoService: SocketIoService
  ) {}

  @Post("peer-message")
  async createPeerStoryMessage(
    @Req() req: Request,
    @Body() body: StoryPeerMessageBody
  ) {
    this.assertInternalRequest(req);
    const myUser = await this.getBearerUser(req);

    if (!body.peerId) {
      throw new BadRequestException("peerId is required");
    }

    const room = await this.channelService.getOrCreatePeerRoom(
      new MongoPeerIdDto(body.peerId, myUser)
    );
    const roomId = room?.rId;
    if (!roomId) {
      throw new ServiceUnavailableException("Could not create story chat room");
    }

    const messageDto = new SendMessageDto();
    messageDto.content = body.content ?? "";
    messageDto.localId = body.localId || uuidv4();
    messageDto.messageType = Object.values(MessageType).includes(
      body.messageType as MessageType
    )
      ? (body.messageType as MessageType)
      : MessageType.Custom;
    messageDto.myUser = myUser;
    messageDto._roomId = roomId;
    messageDto._platform =
      body.platform || myUser.currentDevice?.platform || "other";
    messageDto.attachment = body.attachment;
    messageDto.mentions = [];

    return resOK(await this.messageChannelService.createMessage(messageDto));
  }

  @Post("socket-emit")
  async emitStorySocket(@Req() req: Request, @Body() body: StorySocketEmitBody) {
    this.assertInternalRequest(req);
    if (!body.event) {
      throw new BadRequestException("event is required");
    }
    if (this.socketIoService.io) {
      this.socketIoService.io.emit(body.event, body.payload);
    }
    return resOK({ emitted: Boolean(this.socketIoService.io) });
  }

  private assertInternalRequest(req: Request) {
    const expected = this.config.get<string>("INTERNAL_SERVICES_API_KEY");
    const actual = (
      req.headers["x-internal-api-key"] ||
      req.headers["X-Internal-Api-Key".toLowerCase()]
    )?.toString();
    if (!expected || actual !== expected) {
      throw new ForbiddenException("Invalid internal service key");
    }
  }

  private async getBearerUser(req: Request) {
    const auth = (req.headers.authorization || "").toString();
    const accessToken = auth.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      throw new ForbiddenException("Authorization bearer token is required");
    }
    return this.authClient.getVerifiedUser(accessToken);
  }
}
