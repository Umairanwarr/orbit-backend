/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import {
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
    Body,
    UseInterceptors,
    UploadedFile,
    UploadedFiles
} from "@nestjs/common";
import {UserFilesService} from "./user_files.service";
import {VerifiedAuthGuard} from "../../../core/guards/verified.auth.guard";
import {V1Controller} from "../../../core/common/v1-controller.decorator";
import {resOK} from "../../../core/utils/res.helpers";
import {MongoIdDto} from "../../../core/common/dto/mongo.id.dto";
import {DeleteFilesDto} from "./dto/delete-files.dto";
import {FileInterceptor, AnyFilesInterceptor} from "@nestjs/platform-express";

@V1Controller('user/files')
export class UserFilesController {
    constructor(
        private readonly userFilesService: UserFilesService
    ) {
    }

    @Get()
    @UseGuards(VerifiedAuthGuard)
    async getUserFiles(@Req() req: any, @Query() query: any) {
        const files = await this.userFilesService.getUserFiles(req.user._id, query);
        return resOK(files);
    }

    @Delete(':fileId')
    @UseGuards(VerifiedAuthGuard)
    async deleteFile(@Param() params: MongoIdDto, @Req() req: any) {
        await this.userFilesService.deleteFile(params.id, req.user._id);
        return resOK({ message: 'File deleted successfully' });
    }

    @Delete()
    @UseGuards(VerifiedAuthGuard)
    async deleteMultipleFiles(@Body() dto: DeleteFilesDto, @Req() req: any) {
        await this.userFilesService.deleteMultipleFiles(dto.fileIds, req.user._id);
        return resOK({ message: 'Files deleted successfully' });
    }

    @Post('upload-simple')
    async uploadSimple(@Req() req: any) {
        console.log('Simple upload endpoint hit');
        console.log('Headers:', req.headers);
        console.log('Content-Type:', req.headers['content-type']);
        return resOK({ message: 'Simple upload endpoint working' });
    }

    @Post('upload')
    @UseInterceptors(
        FileInterceptor('file', { // Changed from 'files' to 'file'
            limits: {
                fileSize: 500 * 1024 * 1024, // 500MB - very generous
                fieldSize: 500 * 1024 * 1024,
                files: 10,
                fields: 50,
                parts: 100,
                headerPairs: 2000
            },
            fileFilter: (req, file, callback) => {
                console.log('🔍 File filter called:', {
                    originalname: file.originalname,
                    mimetype: file.mimetype,
                    fieldname: file.fieldname,
                    size: file.size || 'unknown'
                });
                callback(null, true); // Accept all files
            },
        }),
    )
    async uploadFiles(@UploadedFile() file: any, @Req() req: any) {
        console.log('=== UPLOAD ENDPOINT HIT ===');
        console.log('File received:', file ? 'Yes' : 'No');
        console.log('Headers:', req.headers);

        if (!file) {
            console.log('No file in request');
            return resOK({
                message: 'No file uploaded',
                uploadedFiles: []
            });
        }

        console.log('File details:', {
            originalname: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
            buffer: file.buffer ? 'Present' : 'Missing'
        });

        try {
            // Get user ID from token since we don't have auth guard
            const userId = this.extractUserIdFromToken(req.headers.authorization);
            console.log('Extracted user ID:', userId);

            if (!userId) {
                throw new Error('Could not extract user ID from token');
            }

            const uploadedFiles = await this.userFilesService.uploadFiles([file], userId);
            console.log('Upload successful, files:', uploadedFiles.length);
            console.log('Uploaded files data:', JSON.stringify(uploadedFiles, null, 2));

            return resOK({
                message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
                uploadedFiles
            });
        } catch (error) {
            console.error('Upload error:', error);
            return resOK({
                message: 'Upload failed: ' + error.message,
                uploadedFiles: [],
                error: error.message
            });
        }
    }

    private extractUserIdFromToken(authHeader: string): string | null {
        try {
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return null;
            }

            const token = authHeader.substring(7);
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            return payload.id;
        } catch (error) {
            console.error('Error extracting user ID from token:', error);
            return null;
        }
    }

    @Post('test')
    async testEndpoint(@Req() req: any) {
        console.log('Test endpoint hit');
        console.log('User:', req.user);
        return resOK({ message: 'Test endpoint working', user: req.user });
    }

    @Post('upload-test')
    async uploadTestEndpoint(@Req() req: any) {
        console.log('Upload test endpoint hit - no file interceptor');
        console.log('Content-Type:', req.headers['content-type']);
        console.log('Content-Length:', req.headers['content-length']);
        console.log('Raw body type:', typeof req.body);
        console.log('Raw body:', req.body);
        return resOK({ message: 'Upload test endpoint working' });
    }

    @Post('upload-raw')
    async uploadRaw(@Req() req: any) {
        console.log('=== RAW UPLOAD ENDPOINT ===');
        console.log('Headers:', req.headers);
        console.log('Method:', req.method);
        console.log('URL:', req.url);
        console.log('Body type:', typeof req.body);
        console.log('Body:', req.body);

        return resOK({
            message: 'Raw upload endpoint reached',
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length'],
            bodyType: typeof req.body
        });
    }

    @Post('upload-any')
    @UseInterceptors(
        AnyFilesInterceptor({
            limits: {
                fileSize: 500 * 1024 * 1024,
                fieldSize: 500 * 1024 * 1024,
            },
        }),
    )
    async uploadAnyField(@UploadedFiles() files: any[], @Req() req: any) {
        console.log('=== UPLOAD ANY FIELD ===');
        console.log('Files received:', files ? files.length : 0);
        if (files && files.length > 0) {
            files.forEach((file, index) => {
                console.log(`File ${index}:`, {
                    originalname: file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    fieldname: file.fieldname
                });
            });
        }

        return resOK({
            message: 'Upload any field test',
            filesReceived: files ? files.length : 0,
            fileDetails: files || []
        });
    }

    @Post('cleanup')
    @UseGuards(VerifiedAuthGuard)
    async cleanupOrphanedFiles(@Req() req: any) {
        const result = await this.userFilesService.cleanupOrphanedFiles(req.user._id);
        return resOK({
            message: `Cleaned up ${result.cleanedCount} orphaned file references`,
            cleanedCount: result.cleanedCount
        });
    }
}
