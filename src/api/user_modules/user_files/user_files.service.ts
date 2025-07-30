/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {Injectable, NotFoundException, ForbiddenException} from "@nestjs/common";
import {InjectModel} from "@nestjs/mongoose";
import {PaginateModel} from "mongoose";
import mongoose from "mongoose";
import {IMessage} from "../../../chat/message/entities/message.entity";
import {MessageService} from "../../../chat/message/message.service";
import {RoomMiddlewareService} from "../../../chat/room_middleware/room_middleware.service";
import {IRoomMember} from "../../../chat/room_member/entities/room_member.entity";
import {SocketIoService} from "../../../chat/socket_io/socket_io.service";
import {SocketEventsType, MessageType, S3UploaderTypes} from "../../../core/utils/enums";
import {FileUploaderService} from "../../../common/file_uploader/file_uploader.service";
import {CreateS3UploaderDto} from "../../../common/file_uploader/create-s3_uploader.dto";
import {UserService} from "../user/user.service";
import fs from "fs";
import path from "path";
import root from "app-root-path";
import { v4 as uuidv4 } from "uuid";
import { fromBuffer } from "file-type";

@Injectable()
export class UserFilesService {
    constructor(
        @InjectModel("message") private readonly messageModel: PaginateModel<IMessage>,
        @InjectModel("room_member") private readonly roomMemberModel: PaginateModel<IRoomMember>,
        private readonly messageService: MessageService,
        private readonly roomMiddlewareService: RoomMiddlewareService,
        private readonly socketIoService: SocketIoService,
        private readonly fileUploaderService: FileUploaderService,
        private readonly userService: UserService
    ) {
    }

    async getUserFiles(userId: string, params: any) {
        const page = parseInt(params.page) || 1;
        const limit = parseInt(params.limit) || 20;
        const fileType = params.fileType; // 'image', 'video', 'file', 'voice'

        // Get user's room IDs
        const userRoomIds = await this.getUserRoomIds(userId);

        // Build aggregation pipeline to get files from messages
        const matchStage: any = {
            $or: [
                { sId: userId }, // Files sent by user
                {
                    rId: { $in: userRoomIds } // Files in user's rooms
                }
            ],
            msgAtt: { $ne: null },
            dltAt: null, // Not deleted
            $and: [
                { dF: { $ne: userId } } // Not deleted by this user
            ]
        };

        // Filter by file type if specified
        if (fileType) {
            matchStage.mT = this.getMessageTypeFromFileType(fileType);
        }

        // Use simple query approach since aggregation is complex
        // Only show files that were uploaded directly through manage storage
        let query: any = {
            sId: userId,
            msgAtt: { $ne: null },
            dltAt: null,
            c: { $regex: '^DIRECT_UPLOAD:', $options: 'i' }, // Only direct uploads
            lId: { $regex: '^direct_upload_', $options: 'i' } // Additional filter for direct uploads
        };

        // Add file type filter if specified
        if (fileType && fileType !== 'all') {
            const messageTypes = this.getMessageTypesForFileType(fileType);
            query.mT = { $in: messageTypes };
        }

        const allFiles = await this.messageModel.find(query)
            .sort({ createdAt: -1 })
            .exec();

        console.log(`Simple query found ${allFiles.length} messages with attachments`);

        // Convert to the expected format and filter files that exist on filesystem
        const existingFiles = [];
        for (const message of allFiles) {
            const msgAtt = message.msgAtt as any;
            if (msgAtt && msgAtt.url) {
                // The url contains the full path: "userId/filename"
                const filePath = path.join(root.path, "public", "media", msgAtt.url);
                console.log(`Checking file existence: ${msgAtt.url} -> ${filePath}`);
                if (fs.existsSync(filePath)) {
                    existingFiles.push({
                        id: message._id,
                        messageId: message._id,
                        senderId: message.sId,
                        senderName: message.sName,
                        roomId: message.rId,
                        messageType: message.mT,
                        fileName: msgAtt.name,
                        fileSize: msgAtt.fileSize || 0,
                        fileHash: msgAtt.fileHash,
                        extension: this.getExtensionFromUrl(msgAtt.url),
                        mimeType: msgAtt.mimeType,
                        networkUrl: msgAtt.url,
                        createdAt: message.createdAt,
                        fileType: this.getFileTypeFromMessageType(message.mT)
                    });
                } else {
                    // File doesn't exist, mark message as having missing attachment
                    console.log(`Missing file detected: ${msgAtt.url} for message ${message._id}`);
                }
            }
        }

        // Apply pagination to existing files
        const startIndex = (page - 1) * limit;
        const paginatedFiles = existingFiles.slice(startIndex, startIndex + limit);

        return {
            files: paginatedFiles,
            pagination: {
                page,
                limit,
                total: existingFiles.length,
                pages: Math.ceil(existingFiles.length / limit)
            }
        };
    }

    async deleteFile(messageId: string, userId: string) {
        // Get the message to verify ownership and get file info
        const message = await this.messageService.getByIdOrFail(messageId);

        // Check if this is a direct upload file
        if (!message.c?.startsWith('DIRECT_UPLOAD:') || !message.lId?.startsWith('direct_upload_')) {
            throw new ForbiddenException("Can only delete files uploaded through manage storage");
        }

        // Check if user owns this file
        if (message.sId.toString() !== userId) {
            throw new ForbiddenException("You can only delete your own uploaded files");
        }

        // Delete physical file from storage
        if (message.msgAtt && (message.msgAtt as any).url) {
            await this.deletePhysicalFile((message.msgAtt as any).url);
        }

        // For direct uploads, completely delete the message record
        await this.messageModel.findByIdAndDelete(messageId);

        console.log(`Direct upload file deleted: ${messageId}`);
    }

    async deleteMultipleFiles(messageIds: string[], userId: string) {
        for (const messageId of messageIds) {
            await this.deleteFile(messageId, userId);
        }
    }

    async cleanupOrphanedFiles(userId: string) {
        // Find all messages with attachments for this user
        const userRoomIds = await this.getUserRoomIds(userId);

        const messages = await this.messageModel.find({
            $or: [
                { sId: userId },
                { rId: { $in: userRoomIds } }
            ],
            msgAtt: { $ne: null },
            dltAt: null
        });

        let cleanedCount = 0;
        for (const message of messages) {
            const msgAtt = message.msgAtt as any;
            if (msgAtt && msgAtt.url) {
                const filePath = path.join(root.path, "public", "media", msgAtt.url);
                if (!fs.existsSync(filePath)) {
                    // File doesn't exist, remove attachment but keep message
                    await this.messageModel.findByIdAndUpdate(message._id, {
                        msgAtt: null,
                        c: "📎 File no longer available",
                        isEdited: true
                    });
                    cleanedCount++;
                    console.log(`Cleaned orphaned message: ${message._id} with missing file: ${msgAtt.url}`);
                }
            }
        }

        return { cleanedCount };
    }

    private getMessageTypesForFileType(fileType: string): string[] {
        switch (fileType) {
            case 'image':
                return ['image']; // Image message type
            case 'video':
                return ['video']; // Video message type
            case 'file':
                return ['file']; // File message type
            default:
                return ['image', 'video', 'file']; // All file types
        }
    }

    private getExtensionFromUrl(url: string): string {
        const parts = url.split('.');
        return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    }

    private async deletePhysicalFile(fileUrl: string) {
        try {
            // fileUrl is like "6869c00fb29d342c627d6f94/media600-1fb422bc-756d-42de-9d6f-d15c0a7c49e4.jpg"
            const filePath = path.join(root.path, "public", "media", fileUrl);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`Successfully deleted file: ${fileUrl}`);
            } else {
                console.log(`File not found for deletion: ${fileUrl}`);
            }
        } catch (error) {
            console.error(`Error deleting physical file ${fileUrl}: ${error.message}`);
            // Don't throw error as database cleanup is more important
        }
    }

    private async getUserRoomIds(userId: string): Promise<string[]> {
        const roomMembers = await this.roomMemberModel.find(
            { uId: userId, isD: false },
            'rId'
        ).lean();
        return roomMembers.map(rm => rm.rId.toString());
    }

    private async isUserInRoom(userId: string, roomId: string): Promise<boolean> {
        try {
            const roomMember = await this.roomMiddlewareService.isThereRoomMember(roomId, userId);
            return roomMember !== null;
        } catch (error) {
            return false;
        }
    }

    private getMessageTypeFromFileType(fileType: string): string {
        switch (fileType.toLowerCase()) {
            case 'image': return 'image';
            case 'video': return 'video';
            case 'file': return 'file';
            case 'voice': return 'voice';
            default: return 'file';
        }
    }

    private getFileTypeFromMessageType(messageType: string): string {
        switch (messageType.toLowerCase()) {
            case 'image': return 'image';
            case 'video': return 'video';
            case 'voice': return 'voice';
            case 'file': return 'file';
            default: return 'file';
        }
    }

    async uploadFiles(files: Express.Multer.File[], userId: string) {
        console.log('UserFilesService.uploadFiles called');
        console.log('Files count:', files.length);
        console.log('User ID:', userId);

        // Check storage limit for free plan users (1GB limit)
        const currentUsage = await this.getCurrentStorageUsage(userId);
        const newFilesSize = files.reduce((total, file) => total + file.size, 0);
        const maxStorageBytes = 1024 * 1024 * 1024; // 1GB in bytes

        if (currentUsage + newFilesSize > maxStorageBytes) {
            throw new Error(`Storage limit exceeded. Current usage: ${this.formatBytes(currentUsage)}, New files: ${this.formatBytes(newFilesSize)}, Limit: ${this.formatBytes(maxStorageBytes)}`);
        }

        // Get user info for sImg and sName
        const user = await this.userService.findByIdForAuth(userId);
        if (!user) {
            throw new Error('User not found');
        }

        const uploadedFiles = [];

        for (const file of files) {
            try {
                console.log('Processing file:', file.originalname);
                // Upload file using the file uploader service
                const uploaderDto = new CreateS3UploaderDto();
                uploaderDto.mediaBuffer = file.buffer;
                uploaderDto.fileName = file.originalname;
                uploaderDto.myUser = { _id: userId } as any;

                const fileUrl = await this.fileUploaderService.uploadChatMedia(uploaderDto);

                // Determine file type based on mime type
                const fileType = this.getFileTypeFromMimeType(file.mimetype);
                const messageType = this.getMessageTypeFromFileType(fileType);

                // Create a message record for the uploaded file
                const messageData = {
                    sId: userId,
                    sName: user.fullName, // Use actual user name
                    sImg: user.userImage, // Use actual user image
                    plm: 'web', // Required platform field
                    rId: new mongoose.Types.ObjectId(), // Create a dummy room ID for direct uploads
                    c: `DIRECT_UPLOAD:${file.originalname}`, // Mark as direct upload with prefix
                    mT: messageType,
                    lId: `direct_upload_${Date.now()}_${Math.random()}`, // Mark as direct upload
                    msgAtt: {
                        url: fileUrl,
                        fileSize: file.size,
                        mimeType: file.mimetype,
                        name: file.originalname,
                        fileHash: this.generateFileHash(file.buffer),
                    },
                    dltAt: null,
                    dF: []
                };

                const savedMessage = await this.messageModel.create(messageData);

                uploadedFiles.push({
                    id: savedMessage._id.toString(),
                    messageId: savedMessage._id.toString(),
                    senderId: userId,
                    senderName: user.fullName,
                    roomId: '', // Empty string instead of null
                    messageType: messageType,
                    fileName: file.originalname,
                    fileSize: file.size,
                    fileHash: messageData.msgAtt.fileHash || '',
                    extension: this.getExtensionFromFileName(file.originalname),
                    mimeType: file.mimetype,
                    networkUrl: fileUrl,
                    createdAt: savedMessage.createdAt,
                    fileType: fileType
                });

            } catch (error) {
                console.error(`Error uploading file ${file.originalname}:`, error);
                // Continue with other files even if one fails
            }
        }

        return uploadedFiles;
    }

    private getFileTypeFromMimeType(mimeType: string): string {
        if (mimeType.startsWith('image/')) return 'image';
        if (mimeType.startsWith('video/')) return 'video';
        if (mimeType.startsWith('audio/')) return 'voice';
        return 'file';
    }

    private getExtensionFromFileName(fileName: string): string {
        const parts = fileName.split('.');
        return parts.length > 1 ? parts[parts.length - 1] : '';
    }

    private generateFileHash(buffer: Buffer): string {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(buffer).digest('hex');
    }

    private async getCurrentStorageUsage(userId: string): Promise<number> {
        try {
            const messages = await this.messageModel.find({
                sId: userId,
                dltAt: null, // Only count non-deleted messages
                msgAtt: { $exists: true, $ne: null }
            });

            let totalSize = 0;
            for (const message of messages) {
                if (message.msgAtt && (message.msgAtt as any).fileSize) {
                    totalSize += (message.msgAtt as any).fileSize;
                }
            }

            return totalSize;
        } catch (error) {
            console.error('Error calculating storage usage:', error);
            return 0;
        }
    }

    private formatBytes(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
}
