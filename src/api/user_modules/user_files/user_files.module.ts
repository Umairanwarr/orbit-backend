/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import { Module } from "@nestjs/common";
import { MongooseModule } from "@nestjs/mongoose";
import { UserFilesController } from "./user_files.controller";
import { UserFilesService } from "./user_files.service";
import { TestUploadController } from "./test_upload.controller";
import { MessageSchema } from "../../../chat/message/entities/message.entity";
import { MessageModule } from "../../../chat/message/message.module";
import { RoomMemberSchema } from "../../../chat/room_member/entities/room_member.entity";
import { RoomMiddlewareModule } from "../../../chat/room_middleware/room_middleware.module";
import { AuthModule } from "../../auth/auth.module";
import { SocketIoModule } from "../../../chat/socket_io/socket_io.module";
import { FileUploaderModule } from "../../../common/file_uploader/file_uploader.module";
import { UserModule } from "../user/user.module";

@Module({
    controllers: [UserFilesController, TestUploadController],
    providers: [UserFilesService],
    imports: [
        MongooseModule.forFeature([
            {
                name: "message",
                schema: MessageSchema
            },
            {
                name: "room_member",
                schema: RoomMemberSchema
            }
        ]),
        MessageModule,
        RoomMiddlewareModule,
        AuthModule,
        SocketIoModule,
        FileUploaderModule,
        UserModule
    ],
    exports: [UserFilesService]
})
export class UserFilesModule {
}
