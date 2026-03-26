import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { RtcTokenBuilder, RtcRole } from 'agora-token';

@Injectable()
export class AgoraRecordingService {
    private readonly logger = new Logger(AgoraRecordingService.name);
    private readonly appId: string;
    private readonly appCertificate: string;
    private readonly customerId: string;
    private readonly customerSecret: string;
    private readonly baseUrl = 'https://api.agora.io';

    constructor(private configService: ConfigService) {
        this.appId = this.configService.get<string>('AGORA_APP_ID');
        this.appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE');
        this.customerId = this.configService.get<string>('AGORA_CUSTOMER_ID');
        this.customerSecret = this.configService.get<string>('AGORA_CUSTOMER_SECRET');

        if (!this.appId || !this.appCertificate) {
            throw new Error('Agora credentials not found in environment variables');
        }
    }

    private getBasicAuth(): string {
        // Use Customer ID and Secret if available (for Cloud Recording)
        if (this.customerId && this.customerSecret) {
            const credentials = `${this.customerId}:${this.customerSecret}`;
            return Buffer.from(credentials).toString('base64');
        }
        
        // Fallback to App ID and Certificate (may not work for Cloud Recording)
        const credentials = `${this.appId}:${this.appCertificate}`;
        return Buffer.from(credentials).toString('base64');
    }

    /**
     * Start cloud recording for a channel
     */
    async startCloudRecording(
        channelName: string, 
        uid: number = 0,
        storageConfig?: any
    ): Promise<{ resourceId: string; sid: string }> {
        try {
            this.logger.log(`Starting cloud recording for channel: ${channelName}`);

            // Step 1: Acquire resource
            const resourceId = await this.acquireResource(channelName, uid);
            this.logger.log(`Acquired resource ID: ${resourceId}`);

            // Step 2: Start recording
            const sid = await this.startRecording(channelName, uid, resourceId, storageConfig);
            this.logger.log(`Started recording with SID: ${sid}`);

            return { resourceId, sid };
        } catch (error) {
            this.logger.error('Failed to start cloud recording:', error);
            throw error;
        }
    }

    /**
     * Stop cloud recording
     */
    async stopCloudRecording(
        channelName: string,
        uid: number,
        resourceId: string,
        sid: string
    ): Promise<{ recordingUrl: string; fileList: any[] }> {
        try {
            this.logger.log(`Stopping cloud recording for channel: ${channelName}, SID: ${sid}`);

            const url = `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`;
            
            const response = await axios.post(url, {
                cname: channelName,
                uid: uid.toString(),
                clientRequest: {}
            }, {
                headers: {
                    'Authorization': `Basic ${this.getBasicAuth()}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = response.data ?? {};
            const serverResponse = data.serverResponse ?? data;

            // Normalize file list from various possible formats
            const normalizeList = (raw: any): { filename: string }[] => {
                if (!raw) return [];
                if (Array.isArray(raw)) {
                    if (raw.length === 0) return [];
                    // Array of strings
                    if (typeof raw[0] === 'string') {
                        return (raw as string[]).filter(Boolean).map((s) => ({ filename: s as string }));
                    }
                    // Array of objects
                    return (raw as any[])
                        .map((o) => {
                            if (o && typeof o === 'object') {
                                if (o.filename) return { filename: o.filename };
                                if (o.fileName) return { filename: o.fileName };
                                if (o.url) return { filename: o.url };
                            }
                            return null;
                        })
                        .filter(Boolean) as { filename: string }[];
                }
                if (typeof raw === 'string') {
                    try {
                        const parsed = JSON.parse(raw);
                        return normalizeList(parsed);
                    } catch (_) {
                        // Fallback: split by newline/comma/semicolon
                        return raw
                            .split(/\r?\n|,|;/)
                            .map((s) => s.trim())
                            .filter(Boolean)
                            .map((s) => ({ filename: s }));
                    }
                }
                return [];
            };

            const rawList = serverResponse?.fileList ?? serverResponse?.fileListString ?? serverResponse?.fileListJson;
            let fileList = normalizeList(rawList);

            // If Agora didn't include files in the stop response yet, query once
            if (fileList.length === 0) {
                try {
                    const q = await this.queryRecording(resourceId, sid);
                    const qServer = q?.serverResponse ?? q;
                    const qRaw = qServer?.fileList ?? qServer?.fileListString ?? qServer?.fileListJson;
                    const qList = normalizeList(qRaw);
                    if (qList.length > 0) fileList = qList;
                } catch (_) {
                    // best-effort
                }
            }

            // Get the main recording file URL
            let recordingUrl = '';
            if (fileList.length > 0) {
                const mainFile =
                    fileList.find((f) => typeof f.filename === 'string' && f.filename.endsWith('.mp4')) ||
                    fileList.find((f) => typeof f.filename === 'string' && f.filename.endsWith('.m3u8')) ||
                    fileList[0];
                recordingUrl = mainFile.filename;
            }

            this.logger.log(`Recording stopped successfully. Files: ${fileList.length}, Main: ${recordingUrl}`);
            return { recordingUrl, fileList };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const reason = error.response?.data;
                this.logger.error(`Failed to stop cloud recording (Axios ${status}): ${JSON.stringify(reason)}`);

                // If repeated stop (code 49), attempt a query to fetch file list and return gracefully
                const code = (reason as any)?.code;
                if (code === 49) {
                    try {
                        const q = await this.queryRecording(resourceId, sid);
                        const qServer = q?.serverResponse ?? q;
                        const qRaw = qServer?.fileList ?? qServer?.fileListString ?? qServer?.fileListJson;
                        const normalize = (raw: any): { filename: string }[] => {
                            if (!raw) return [];
                            if (Array.isArray(raw)) {
                                if (raw.length === 0) return [];
                                if (typeof raw[0] === 'string') return (raw as string[]).filter(Boolean).map((s) => ({ filename: s as string }));
                                return (raw as any[]).map((o) => (o?.filename ? { filename: o.filename } : o?.fileName ? { filename: o.fileName } : o?.url ? { filename: o.url } : null)).filter(Boolean) as { filename: string }[];
                            }
                            if (typeof raw === 'string') {
                                try { return normalize(JSON.parse(raw)); } catch { return raw.split(/\r?\n|,|;/).map((s: string) => s.trim()).filter(Boolean).map((s: string) => ({ filename: s })); }
                            }
                            return [];
                        };
                        const fileList = normalize(qRaw);
                        let recordingUrl = '';
                        if (fileList.length > 0) {
                            const mainFile = fileList.find((f) => f.filename.endsWith('.mp4')) || fileList.find((f) => f.filename.endsWith('.m3u8')) || fileList[0];
                            recordingUrl = mainFile.filename;
                        }
                        this.logger.warn('Stop returned code 49; using query result to finalize.');
                        return { recordingUrl, fileList };
                    } catch (qe) {
                        this.logger.warn('Stop code 49 and query failed; returning empty file list.');
                        return { recordingUrl: '', fileList: [] };
                    }
                }
            }
            this.logger.error('Failed to stop cloud recording:', error);
            throw error;
        }
    }

    private async acquireResource(channelName: string, uid: number): Promise<string> {
        const url = `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/acquire`;
        
        const response = await axios.post(url, {
            cname: channelName,
            uid: uid.toString(),
            clientRequest: {
                resourceExpiredHour: 24,
                scene: 0 // 0 for real-time communication, 1 for live broadcasting
            }
        }, {
            headers: {
                'Authorization': `Basic ${this.getBasicAuth()}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.resourceId;
    }

    private async startRecording(
        channelName: string, 
        uid: number, 
        resourceId: string,
        storageConfig?: any
    ): Promise<string> {
        const url = `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`;
        
        const storage = storageConfig ?? this.buildStorageConfig(channelName);
        if (!storage) {
            throw new Error('Missing AGORA storage envs: AGORA_STORAGE_VENDOR, AGORA_STORAGE_REGION, AGORA_STORAGE_BUCKET, AGORA_STORAGE_ACCESS_KEY, AGORA_STORAGE_SECRET_KEY');
        }

        const clientRequest = {
            token: this.generateToken(channelName, uid),
            recordingConfig: {
                maxIdleTime: 30,
                streamTypes: 2, // Video and audio
                channelType: 1, // Live broadcast
                videoStreamType: 0, // High stream
                subscribeVideoUids: ["#allstream#"],
                subscribeAudioUids: ["#allstream#"]
            },
            recordingFileConfig: { avFileType: ["hls", "mp4"] },
            storageConfig: storage
        };

        const response = await axios.post(url, {
            cname: channelName,
            uid: uid.toString(),
            clientRequest
        }, {
            headers: {
                'Authorization': `Basic ${this.getBasicAuth()}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.sid;
    }

    private buildStorageConfig(channelName: string) {
        const vendor = Number(this.configService.get('AGORA_STORAGE_VENDOR'));
        const region = Number(this.configService.get('AGORA_STORAGE_REGION'));
        const bucket = this.configService.get<string>('AGORA_STORAGE_BUCKET');
        const accessKey = this.configService.get<string>('AGORA_STORAGE_ACCESS_KEY');
        const secretKey = this.configService.get<string>('AGORA_STORAGE_SECRET_KEY');
        const prefixEnv = this.configService.get<string>('AGORA_STORAGE_FILE_PREFIX');
        // fileNamePrefix must be an array of directory segments; Agora is strict about characters.
        // Sanitize each segment to alphanumeric only (remove underscores and any non-alphanumerics).
        const sanitize = (s: string) => (s || '').replace(/[^A-Za-z0-9]/g, '');
        const baseSegments = prefixEnv
            ? prefixEnv.split('/').filter(Boolean)
            : ['recordings', channelName];
        let fileNamePrefix: string[] = baseSegments.map(sanitize).filter(Boolean);
        if (fileNamePrefix.length === 0) {
            fileNamePrefix = ['recordings', 'stream'];
        }

        if ([vendor, region].some(n => Number.isNaN(n)) || !bucket || !accessKey || !secretKey) {
            return null;
        }
        return { vendor, region, bucket, accessKey, secretKey, fileNamePrefix };
    }

    private generateToken(channelName: string, uid: number): string {
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const expirationTimeInSeconds = currentTimestamp + 3600; // 1 hour expiry
        
        return RtcTokenBuilder.buildTokenWithUid(
            this.appId,
            this.appCertificate,
            channelName,
            uid,
            RtcRole.PUBLISHER,
            expirationTimeInSeconds,
            expirationTimeInSeconds
        );
    }

    /**
     * Query recording status
     */
    async queryRecording(resourceId: string, sid: string): Promise<any> {
        try {
            const url = `${this.baseUrl}/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/query`;
            
            const response = await axios.get(url, {
                headers: {
                    'Authorization': `Basic ${this.getBasicAuth()}`,
                    'Content-Type': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            this.logger.error('Failed to query recording:', error);
            throw error;
        }
    }
}
