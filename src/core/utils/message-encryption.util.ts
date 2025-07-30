/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import * as crypto from 'crypto';

/**
 * E2E message encryption using AES - Backend implementation
 * This matches the encryption used in the Flutter app
 */
export class MessageEncryptionUtil {
    // Static encryption key - matches the Flutter implementation exactly
    private static readonly ENCRYPTION_KEY = "SuperUpE2EEncryptionKey2024!@#$1234";

    /**
     * Encrypts a message using AES-256-CBC encryption to match Flutter's pointycastle implementation
     */
    static encryptMessage(message: string): string {
        try {
            if (!message || message.length === 0) return message;

            // Use the same key derivation as Flutter: first 32 characters as UTF-8
            const keyString = this.ENCRYPTION_KEY.substring(0, 32);
            const key = Buffer.from(keyString, 'utf8');

            // Use zero IV (16 bytes) to match Flutter implementation
            const iv = Buffer.alloc(16, 0);

            // Convert message to bytes and apply PKCS7 padding
            const messageBytes = Buffer.from(message, 'utf8');
            const paddedMessage = this.addPKCS7Padding(messageBytes, 16);

            // Create AES-256-CBC cipher
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            cipher.setAutoPadding(false); // Handle padding manually

            // Encrypt
            let encrypted = cipher.update(paddedMessage);
            const final = cipher.final();
            encrypted = Buffer.concat([encrypted, final]);

            // Return base64 encoded result
            return encrypted.toString('base64');
        } catch (error) {
            console.error('Encryption error:', error);
            return message;
        }
    }

    /**
     * Add PKCS7 padding to data
     */
    private static addPKCS7Padding(data: Buffer, blockSize: number): Buffer {
        const paddingLength = blockSize - (data.length % blockSize);
        const paddedData = Buffer.alloc(data.length + paddingLength);
        data.copy(paddedData, 0);
        for (let i = data.length; i < paddedData.length; i++) {
            paddedData[i] = paddingLength;
        }
        return paddedData;
    }

    /**
     * Decrypts a message using AES-256-CBC decryption to match Flutter's pointycastle implementation
     */
    static decryptMessage(encryptedMessage: string): string {
        try {
            if (!encryptedMessage || encryptedMessage.length === 0) return encryptedMessage;

            // Use the same key derivation as Flutter: first 32 characters as UTF-8
            const keyString = this.ENCRYPTION_KEY.substring(0, 32);
            const key = Buffer.from(keyString, 'utf8');

            // Use zero IV (16 bytes) to match Flutter implementation
            const iv = Buffer.alloc(16, 0);

            // Decode base64 encrypted message
            const encryptedBytes = Buffer.from(encryptedMessage, 'base64');

            // Create AES-256-CBC decipher
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            decipher.setAutoPadding(false); // Handle padding manually

            // Decrypt
            let decrypted = decipher.update(encryptedBytes);
            const final = decipher.final();
            decrypted = Buffer.concat([decrypted, final]);

            // Remove PKCS7 padding manually
            if (decrypted.length > 0) {
                const paddingLength = decrypted[decrypted.length - 1];

                // Validate padding
                if (paddingLength > 0 && paddingLength <= 16 && paddingLength <= decrypted.length) {
                    // Verify all padding bytes are the same
                    let validPadding = true;
                    for (let i = decrypted.length - paddingLength; i < decrypted.length; i++) {
                        if (decrypted[i] !== paddingLength) {
                            validPadding = false;
                            break;
                        }
                    }

                    if (validPadding) {
                        const unpaddedData = decrypted.slice(0, decrypted.length - paddingLength);
                        return unpaddedData.toString('utf8');
                    }
                }
            }

            // If padding validation fails, try returning the raw decrypted data
            return decrypted.toString('utf8');
        } catch (error) {
            // If decryption fails, return original message (might be unencrypted)
            console.error('Decryption error:', error.message);
            return encryptedMessage;
        }
    }

    /**
     * Gets the real content of a message (decrypted if encrypted)
     */
    static getRealContent(content: string, isEncrypted: boolean): string {
        if (isEncrypted && content && content.length > 0) {
            return this.decryptMessage(content);
        }
        return content;
    }
}
