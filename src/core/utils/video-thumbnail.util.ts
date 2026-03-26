import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import root from 'app-root-path';
import { v4 as uuidv4 } from 'uuid';
import { FileUploaderService } from '../../common/file_uploader/file_uploader.service';
import { CreateS3UploaderDto } from '../../common/file_uploader/create-s3_uploader.dto';

const execAsync = promisify(exec);

export class VideoThumbnailUtil {
  /**
   * Generate a thumbnail from video buffer
   * @param videoBuffer - Buffer containing video data
   * @param userId - User ID for file organization
   * @returns Promise<string> - Thumbnail URL
   */
  static async generateThumbnailFromBuffer(
    videoBuffer: Buffer,
    userId: string,
    uploader: FileUploaderService,
  ): Promise<string> {
    try {
      // Create temporary video file
      const tempVideoId = uuidv4();
      const tempVideoPath = path.join(root.path, 'temp', `${tempVideoId}.mp4`);
      const tempThumbnailPath = path.join(root.path, 'temp', `${tempVideoId}_thumb.jpg`);
      
      // Ensure temp directory exists
      const tempDir = path.join(root.path, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Write video buffer to temporary file
      fs.writeFileSync(tempVideoPath, videoBuffer);

      // Generate thumbnail using ffmpeg
      await this.extractFrame(tempVideoPath, tempThumbnailPath);

      // Read thumbnail buffer
      const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);

      // Clean up temporary files
      try {
        fs.unlinkSync(tempVideoPath);
        fs.unlinkSync(tempThumbnailPath);
      } catch (error) {
        console.warn('Warning: Could not clean up temp files:', error);
      }

      const thumbnailUrl = await this.saveThumbnail(thumbnailBuffer, userId, uploader);

      return thumbnailUrl;
    } catch (error) {
      console.error('Error generating thumbnail from buffer:', error);
      throw new Error('Failed to generate video thumbnail');
    }
  }

  static async generateLocalThumbnail(
    videoBuffer: Buffer,
    opts?: {
      fileExt?: string;
    },
  ): Promise<string> {
    try {
      const tempVideoId = uuidv4();
      const rawExt = (opts?.fileExt ?? '').trim();
      const safeExt = rawExt
        ? rawExt.startsWith('.')
          ? rawExt
          : `.${rawExt}`
        : '.mp4';
      const tempVideoPath = path.join(root.path, 'temp', `${tempVideoId}${safeExt}`);
      const tempThumbnailPath = path.join(root.path, 'temp', `${tempVideoId}_thumb.jpg`);
      
      console.log('[VideoThumbnail] Generating thumbnail for video, ext:', safeExt, 'buffer size:', videoBuffer.length);
      
      const tempDir = path.join(root.path, 'temp');
      if (!fs.existsSync(tempDir)) {
        console.log('[VideoThumbnail] Creating temp directory:', tempDir);
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(tempVideoPath, videoBuffer);
      console.log('[VideoThumbnail] Wrote temp video to:', tempVideoPath);
      
      await this.extractFrame(tempVideoPath, tempThumbnailPath);
      console.log('[VideoThumbnail] Extracted frame to:', tempThumbnailPath);

      if (!fs.existsSync(tempThumbnailPath)) {
        console.error('[VideoThumbnail] Thumbnail file not created:', tempThumbnailPath);
        return '';
      }

      const thumbnailBuffer = fs.readFileSync(tempThumbnailPath);
      console.log('[VideoThumbnail] Read thumbnail buffer, size:', thumbnailBuffer.length);
      
      try {
        fs.unlinkSync(tempVideoPath);
        fs.unlinkSync(tempThumbnailPath);
      } catch (error) {
        console.warn('[VideoThumbnail] Failed to cleanup temp files:', error);
      }

      const thumbDir = path.join(root.path, 'public', 'media', 'music_thumbs');
      if (!fs.existsSync(thumbDir)) {
        console.log('[VideoThumbnail] Creating thumbs directory:', thumbDir);
        fs.mkdirSync(thumbDir, { recursive: true });
      }

      const fileName = `${uuidv4()}.jpg`;
      const finalPath = path.join(thumbDir, fileName);
      fs.writeFileSync(finalPath, thumbnailBuffer);
      console.log('[VideoThumbnail] Saved final thumbnail to:', finalPath);

      const url = `/media/music_thumbs/${fileName}`;
      console.log('[VideoThumbnail] Returning URL:', url);
      return url;
    } catch (error) {
      console.error('[VideoThumbnail] Error generating local thumbnail:', error);
      return '';
    }
  }

  /**
   * Extract a frame from video file using ffmpeg
   * @param videoPath - Path to video file
   * @param outputPath - Path to save thumbnail
   */
  private static async extractFrame(videoPath: string, outputPath: string): Promise<void> {
    // Use full path to ffmpeg to ensure it works in PM2 environment
    const ffmpegPath = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';
    const command = `${ffmpegPath} -i "${videoPath}" -ss 00:00:01.000 -vframes 1 -vf "scale=320:240" -y "${outputPath}"`;
    
    console.log('[VideoThumbnail] Running ffmpeg command:', command);
    
    try {
      const { stdout, stderr } = await execAsync(command, { maxBuffer: 1024 * 1024 * 10 });
      console.log('[VideoThumbnail] ffmpeg stdout:', stdout?.substring(0, 500));
      if (stderr) {
        console.log('[VideoThumbnail] ffmpeg stderr:', stderr?.substring(0, 1000));
      }
    } catch (error: any) {
      console.error('[VideoThumbnail] ffmpeg error:', error?.message || error);
      console.error('[VideoThumbnail] ffmpeg stderr:', error?.stderr?.substring(0, 1000));
      throw new Error(`FFmpeg failed: ${error?.message || error}`);
    }
  }

  /**
   * Save thumbnail buffer to file system
   * @param thumbnailBuffer - Thumbnail image buffer
   * @param userId - User ID for file organization
   * @returns Promise<string> - Thumbnail URL
   */
  private static async saveThumbnail(
    thumbnailBuffer: Buffer,
    userId: string,
    uploader: FileUploaderService,
  ): Promise<string> {
    const dto = new CreateS3UploaderDto();
    dto.mediaBuffer = thumbnailBuffer;
    dto.fileName = 'thumb.jpg';
    // @ts-ignore
    dto.myUser = { _id: userId };
    return await uploader.uploadChatMedia(dto);
  }

  /**
   * Check if ffmpeg is available
   * @returns Promise<boolean>
   */
  static async isFfmpegAvailable(): Promise<boolean> {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch (error) {
      return false;
    }
  }
}
