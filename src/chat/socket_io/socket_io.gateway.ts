/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    WebSocketServer,
    OnGatewayInit,
    OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket
} from '@nestjs/websockets';
import {SocketIoService} from './socket_io.service';
import {BadRequestException, UseFilters} from "@nestjs/common";

import {Server, Socket} from "socket.io";
import { IUser } from "../../api/user_modules/user/entities/user.entity";
import { WsCatchAllFilter } from "../../core/exception_filter/ws-catch-all-filter";
import { SocketEventsType } from "../../core/utils/enums";
import { jsonDecoder } from "../../core/utils/app.validator";


declare module "socket.io" {
    interface Socket {
        user: IUser;
    }
}

@UseFilters(new WsCatchAllFilter())
@WebSocketGateway({
    transports: ["websocket"],
    connectTimeout: 5000,
    pingInterval: 15000,
    pingTimeout: 5000,
    allowEIO3: true,
    cors: {
        origin: "*",
    },

})
export class SocketIoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() io: Server;

    constructor(private readonly socketIoService: SocketIoService) {

    }

    afterInit(server: any): any {
        this.socketIoService.io = this.io
    }

    async handleConnection(client: Socket, ...args: any[]) {
        await this.socketIoService.handleConnection(client);
    }

    async handleDisconnect(client: Socket) {
        await this.socketIoService.handleDisconnect(client);
    }


    @SubscribeMessage(SocketEventsType.v1MyOnline)
    async myOnline(
        @MessageBody() data: string,
        @ConnectedSocket() client: Socket
    ) {
        let decodedData: any | [] = data
        try {
            decodedData = jsonDecoder(data);
        } catch (e) {
            //
        }
        let isArray = Array.isArray(decodedData);
        if (!isArray) {
            throw new BadRequestException(decodedData + " must be array of mongo ids")
        }

        let res = await this.socketIoService.myOnline(decodedData);
        client.emit(SocketEventsType.v1OnMyOnline, JSON.stringify(res));
    }

    @SubscribeMessage(SocketEventsType.v1DeliverChatRoom)
    async updateRoomMessagesToDeliver(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket
    ) {
        let myUser: IUser = client.user;
        let roomId = null
        try {
            let dataMap = jsonDecoder(data);
            roomId = dataMap['roomId']
        } catch (err) {

        }
        if (roomId == null) {
            roomId = data['roomId']
        }

        if (!roomId) {
            throw new BadRequestException("while updateRoomMessagesToDeliver roomId is required " + data)
        }
        let needToNotify = await this.socketIoService.updateRoomMessagesToDeliver(roomId, myUser);
        if (needToNotify.isUpdated) {
            this.io.to(needToNotify.pId.toString()).emit(
                SocketEventsType.v1OnDeliverChatRoom,
                JSON.stringify({
                    roomId: roomId.toString(),
                    //it right because i need to notify the other person i chat with him no me!
                    userId: needToNotify.pId.toString(),
                    date: new Date(),
                }),
            );
        }

    }

    @SubscribeMessage(SocketEventsType.v1EnterChatRoom)
    async updateRoomMessagesToSeen(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket
    ) {
        let myUser: IUser = client.user;
        let roomId = null
        try {
            let dataMap = jsonDecoder(data);
            roomId = dataMap['roomId']
        } catch (err) {

        }
        if (roomId == null) {
            roomId = data['roomId']
        }
        if (!roomId) {
            throw new BadRequestException("while updateRoomMessagesToDeliver roomId is required " + data)
        }
        let needToNotify = await this.socketIoService.updateRoomMessagesToSeen(roomId, myUser);
        if (needToNotify.isUpdated) {
            this.io.to(needToNotify.pId.toString()).emit(
                SocketEventsType.v1OnEnterChatRoom,
                JSON.stringify({
                    roomId: roomId.toString(),
                    //it right because i need to notify the other person i chat with him no me!
                    userId: needToNotify.pId.toString(),
                    date: new Date(),
                }),
            );
        }
    }

    @SubscribeMessage(SocketEventsType.v1IceCandidate)
    async iceRtc(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket
    ) {

        // try {
        //     data = jsonDecoder(data);
        // } catch (e) {
        //     //console.log(e)
        // }
        //
        // let peerId = await this.socketIoService.iceRtc(data['meetId'], client);
        // this.io
        //     .to(peerId.toString())
        //     .emit(
        //         SocketEventsType.v1OnIceCandidate,
        //         JSON.stringify(data),
        //     );
    }

    @SubscribeMessage(SocketEventsType.v1RoomStatusChange)
    async roomStatusChanged(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket
    ) {
        let myUser = client.user
        let roomId = null
        let status = null
        try {
            let decodedData = jsonDecoder(data);
            roomId = decodedData['roomId']
            status = decodedData['status']
        } catch (e) {
            //console.log(e)
        }
        if (roomId == null) {
            roomId = data['roomId']
            status = data['status']
        }
        let res = {
            "roomId": roomId,
            "status": status,
            "name": myUser.fullName,
            "userId": myUser._id
        }
        if (status != "stop") {
            client['typingTo'] = roomId;
        }
        this.io
            .to(roomId.toString())
            .emit(
                SocketEventsType.v1OnRoomStatusChange,
                JSON.stringify(res),
            );
    }

    @SubscribeMessage('join_stream_room')
    async joinStreamRoom(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket
    ) {
        try {
            const streamId = data.streamId || data['streamId'];
            if (streamId) {
                await client.join(streamId.toString());
                console.log(`User ${client.user._id} joined stream room: ${streamId}`);
            }
        } catch (error) {
            console.error('Error joining stream room:', error);
        }
    }

    @SubscribeMessage('leave_stream_room')
    async leaveStreamRoom(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket
    ) {
        try {
            const streamId = data.streamId || data['streamId'];
            if (streamId) {
                await client.leave(streamId.toString());
                console.log(`User ${client.user._id} left stream room: ${streamId}`);
            }
        } catch (error) {
            console.error('Error leaving stream room:', error);
        }
    }

    // Relay per-user call background data to all participants in the call room
    @SubscribeMessage('call_background_share')
    async callBackgroundShare(
        @MessageBody() data: any,
        @ConnectedSocket() client: Socket,
    ) {
        try {
            let payload: any = data;
            try {
                payload = jsonDecoder(data);
            } catch (_) {
                // ignore non-JSON payloads
            }
            const roomId = payload?.roomId || data['roomId'];
            if (!roomId) {
                throw new BadRequestException('call_background_share: roomId is required');
            }
            this.io.to(roomId.toString()).emit('call_background_share', JSON.stringify(payload));
        } catch (error) {
            console.error('call_background_share handler error:', error);
        }
    }

}
