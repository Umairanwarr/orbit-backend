/**
 * Test upload controller to debug file upload issues
 */

import {
    Controller,
    Post,
    Req,
    Body,
    UseInterceptors,
    UploadedFile
} from "@nestjs/common";
import {FileInterceptor} from "@nestjs/platform-express";
import {resOK} from "../../../core/utils/res.helpers";

@Controller('api/v1/test-upload')
export class TestUploadController {

    @Post('simple')
    async simpleTest(@Req() req: any, @Body() body: any) {
        console.log('=== SIMPLE TEST ENDPOINT HIT ===');
        console.log('Method:', req.method);
        console.log('URL:', req.url);
        console.log('Headers:', req.headers);
        console.log('Body:', body);
        
        return resOK({
            message: 'Simple test endpoint working',
            method: req.method,
            url: req.url,
            headers: req.headers
        });
    }

    @Post('with-file')
    @UseInterceptors(FileInterceptor('files'))
    async withFileTest(@UploadedFile() file: any, @Req() req: any) {
        console.log('=== FILE TEST ENDPOINT HIT ===');
        console.log('File received:', file ? 'Yes' : 'No');
        if (file) {
            console.log('File details:', {
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size
            });
        }
        
        return resOK({
            message: 'File test endpoint working',
            fileReceived: !!file,
            fileDetails: file ? {
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size
            } : null
        });
    }
}
