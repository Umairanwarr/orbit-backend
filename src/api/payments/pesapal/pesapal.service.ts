import {
    BadRequestException,
    Injectable,
    InternalServerErrorException,
    Logger,
    OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
    PesapalTransaction,
    PesapalTransactionDocument,
} from "./schemas/pesapal-transaction.schema";
import { UserService } from "../../user_modules/user/user.service";

@Injectable()
export class PesapalService implements OnModuleInit {
    private readonly logger = new Logger(PesapalService.name);
    private cachedToken: string | null = null;
    private tokenExpiresAt: number = 0;

    private get baseUrl(): string {
        const env =
            this.config.get<string>("PESAPAL_ENV") ||
            process.env.PESAPAL_ENV ||
            "sandbox";
        return env === "live"
            ? "https://pay.pesapal.com/v3/api"
            : "https://cybqa.pesapal.com/pesapalv3/api";
    }

    private get consumerKey(): string {
        return (
            this.config.get<string>("PESAPAL_CONSUMER_KEY") ||
            process.env.PESAPAL_CONSUMER_KEY ||
            ""
        );
    }

    private get consumerSecret(): string {
        return (
            this.config.get<string>("PESAPAL_CONSUMER_SECRET") ||
            process.env.PESAPAL_CONSUMER_SECRET ||
            ""
        );
    }

    private get ipnId(): string {
        return (
            this.config.get<string>("PESAPAL_IPN_ID") ||
            process.env.PESAPAL_IPN_ID ||
            ""
        );
    }

    private get callbackUrl(): string {
        return (
            this.config.get<string>("PESAPAL_CALLBACK_URL") ||
            process.env.PESAPAL_CALLBACK_URL ||
            ""
        );
    }

    private get ipnCallbackUrl(): string {
        return (
            this.config.get<string>("PESAPAL_IPN_CALLBACK_URL") ||
            process.env.PESAPAL_IPN_CALLBACK_URL ||
            ""
        );
    }

    constructor(
        private readonly config: ConfigService,
        @InjectModel(PesapalTransaction.name)
        private readonly txModel: Model<PesapalTransactionDocument>,
        private readonly userService: UserService,
    ) { }

    async onModuleInit() {
        // Auto-register IPN URL if not already registered and if we have one configured
        try {
            if (this.ipnCallbackUrl && !this.ipnId) {
                this.logger.warn(
                    "PESAPAL_IPN_ID is not set. Attempting to register IPN URL automatically...",
                );
                const result = await this.registerIpnUrl(this.ipnCallbackUrl);
                if (result?.ipn_id) {
                    this.logger.warn(
                        `PesaPal IPN registered: ${result.ipn_id}. Please set PESAPAL_IPN_ID=${result.ipn_id} in your .env to avoid re-registering.`,
                    );
                }
            } else if (this.ipnId) {
                this.logger.log(`PesaPal IPN ID configured: ${this.ipnId}`);
            }
        } catch (e: any) {
            this.logger.error(`PesaPal IPN auto-register failed: ${e?.message}`);
        }
    }

    /**
     * Authenticate with PesaPal and get/cache a bearer token.
     */
    async authenticate(): Promise<string> {
        // Return cached token if still valid (with 60s buffer)
        if (this.cachedToken && Date.now() < this.tokenExpiresAt - 60000) {
            return this.cachedToken;
        }

        const key = this.consumerKey;
        const secret = this.consumerSecret;
        if (!key || !secret) {
            throw new BadRequestException(
                "PesaPal consumer key/secret not configured",
            );
        }

        try {
            const response = await fetch(`${this.baseUrl}/Auth/RequestToken`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
                body: JSON.stringify({
                    consumer_key: key,
                    consumer_secret: secret,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                this.logger.error(
                    `PesaPal Auth failed: ${JSON.stringify(data)}`,
                );
                throw new InternalServerErrorException(
                    "PesaPal authentication failed",
                );
            }

            this.cachedToken = data.token;
            // PesaPal tokens usually last 5 minutes; cache accordingly
            this.tokenExpiresAt = Date.now() + 4 * 60 * 1000;

            this.logger.log("PesaPal token obtained successfully");
            return data.token;
        } catch (e: any) {
            if (e instanceof InternalServerErrorException) throw e;
            this.logger.error(`PesaPal auth error: ${e?.message}`);
            throw new InternalServerErrorException(
                "Failed to authenticate with PesaPal",
            );
        }
    }

    /**
     * Register an IPN (Instant Payment Notification) URL with PesaPal.
     */
    async registerIpnUrl(
        url: string,
        ipnNotificationType: string = "GET",
    ): Promise<any> {
        const token = await this.authenticate();
        const response = await fetch(`${this.baseUrl}/URLSetup/RegisterIPN`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                url,
                ipn_notification_type: ipnNotificationType,
            }),
        });

        const data = await response.json();
        if (!response.ok) {
            this.logger.error(`PesaPal IPN registration failed: ${JSON.stringify(data)}`);
            throw new InternalServerErrorException("PesaPal IPN registration failed");
        }

        this.logger.log(`PesaPal IPN registered: ${JSON.stringify(data)}`);
        return data;
    }

    /**
     * Submit an order to PesaPal for payment.
     * Returns the redirect URL where the user completes payment.
     */
    async submitOrder(dto: {
        userId: string;
        amount: number;
        currency?: string;
        description?: string;
        email?: string;
        phone?: string;
        firstName?: string;
        lastName?: string;
        accountReference?: string;
    }): Promise<{
        id: string;
        merchantReference: string;
        orderTrackingId: string;
        redirectUrl: string;
        amount: number;
        currency: string;
    }> {
        if (!dto?.userId) throw new BadRequestException("Missing userId");
        const amount = Number(dto.amount);
        if (!Number.isFinite(amount) || amount <= 0)
            throw new BadRequestException("amount must be > 0");

        const currency = (dto.currency || "KES").toUpperCase();
        const merchantReference = dto.accountReference || `ORBIT-${Date.now()}-${dto.userId.slice(-6)}`;

        // Get user info for billing if not provided
        let email = dto.email || "";
        let phone = dto.phone || "";
        let firstName = dto.firstName || "";
        let lastName = dto.lastName || "";

        if (!email || !firstName) {
            try {
                const user = await this.userService.findById(
                    dto.userId,
                    "email fullName phoneNumber",
                );
                const u = user as any;
                if (!email) email = u?.email || "";
                if (!phone) phone = u?.phoneNumber || "";
                if (!firstName) {
                    const parts = (u?.fullName || "").toString().split(" ");
                    firstName = parts[0] || "User";
                    lastName = parts.slice(1).join(" ") || "";
                }
            } catch { }
        }

        const notificationId = this.ipnId;
        if (!notificationId) {
            this.logger.warn(
                "PESAPAL_IPN_ID not configured. Payment callbacks will not work!",
            );
        }

        const callbackUrl =
            this.callbackUrl || "https://orbit.ke/payment-success";

        // Create local transaction record
        const tx = await this.txModel.create({
            type: "TOPUP",
            status: "pending",
            amount,
            currency,
            userId: dto.userId,
            description: dto.description || "Wallet top-up",
            accountReference: merchantReference,
            merchantReference,
            email,
            phone,
            firstName,
            lastName,
        });

        const orderData = {
            id: merchantReference,
            currency,
            amount,
            description: dto.description || "Orbit Wallet Top-up",
            callback_url: callbackUrl,
            notification_id: notificationId,
            billing_address: {
                email_address: email || undefined,
                phone_number: phone || undefined,
                first_name: firstName || "User",
                last_name: lastName || "",
            },
        };

        try {
            const token = await this.authenticate();
            const response = await fetch(
                `${this.baseUrl}/Transactions/SubmitOrderRequest`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(orderData),
                },
            );

            const result = await response.json();

            if (!response.ok || result?.error) {
                this.logger.error(
                    `PesaPal SubmitOrder failed: ${JSON.stringify(result)}`,
                );
                await this.txModel.findByIdAndUpdate(tx._id, {
                    status: "failed",
                    errorMessage: result?.error?.message || JSON.stringify(result),
                    rawOrderResponse: result,
                });
                throw new InternalServerErrorException(
                    result?.error?.message || "Failed to submit PesaPal order",
                );
            }

            const orderTrackingId = result.order_tracking_id;
            const redirectUrl = result.redirect_url;

            await this.txModel.findByIdAndUpdate(tx._id, {
                orderTrackingId,
                redirectUrl,
                merchantReference,
                rawOrderResponse: result,
            });

            this.logger.log(
                `PesaPal order submitted: tracking=${orderTrackingId}, merchant=${merchantReference}`,
            );

            return {
                id: tx._id.toString(),
                merchantReference,
                orderTrackingId,
                redirectUrl,
                amount,
                currency,
            };
        } catch (e: any) {
            if (e instanceof InternalServerErrorException) throw e;
            await this.txModel.findByIdAndUpdate(tx._id, {
                status: "failed",
                errorMessage: e?.message,
            });
            this.logger.error(`PesaPal submitOrder error: ${e?.message}`);
            throw new InternalServerErrorException(
                "Failed to submit PesaPal order",
            );
        }
    }

    /**
     * Get the transaction status from PesaPal and update locally.
     */
    async getTransactionStatus(orderTrackingId: string): Promise<any> {
        if (!orderTrackingId)
            throw new BadRequestException("orderTrackingId is required");

        const token = await this.authenticate();
        const response = await fetch(
            `${this.baseUrl}/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`,
                },
            },
        );

        const result = await response.json();
        return result;
    }

    /**
     * Handle IPN (webhook) callback from PesaPal.
     * Updates local transaction and credits wallet on success.
     */
    async handleIpnCallback(
        orderTrackingId: string,
        orderMerchantReference: string,
    ): Promise<{ status: string }> {
        this.logger.log(
            `PesaPal IPN received: trackingId=${orderTrackingId}, merchantRef=${orderMerchantReference}`,
        );

        // Get full transaction status from PesaPal
        const statusResult = await this.getTransactionStatus(orderTrackingId);
        const paymentStatus = (
            statusResult?.payment_status_description || ""
        )
            .toString()
            .trim();

        this.logger.log(
            `PesaPal transaction status: ${paymentStatus}, tracking=${orderTrackingId}`,
        );

        // Map PesaPal status to our status
        let ourStatus: string;
        switch (paymentStatus.toLowerCase()) {
            case "completed":
                ourStatus = "success";
                break;
            case "failed":
                ourStatus = "failed";
                break;
            case "reversed":
                ourStatus = "reversed";
                break;
            case "invalid":
                ourStatus = "failed";
                break;
            default:
                ourStatus = "pending";
        }

        const update: any = {
            status: ourStatus,
            orderTrackingId,
            paymentStatusDescription: paymentStatus,
            paymentMethod: statusResult?.payment_method || undefined,
            confirmationCode: statusResult?.confirmation_code || undefined,
            rawCallback: statusResult,
        };

        if (ourStatus === "success" && statusResult?.created_date) {
            update.paidAt = new Date(statusResult.created_date);
        }

        // Update by orderTrackingId first, fallback to merchantReference
        let tx = await this.txModel.findOneAndUpdate(
            { orderTrackingId },
            update,
            { new: true },
        );

        if (!tx && orderMerchantReference) {
            tx = await this.txModel.findOneAndUpdate(
                { merchantReference: orderMerchantReference },
                update,
                { new: true },
            );
        }

        if (!tx) {
            this.logger.warn(
                `PesaPal IPN: No matching transaction found for tracking=${orderTrackingId}, merchant=${orderMerchantReference}`,
            );
            return { status: ourStatus };
        }

        // Credit wallet on success (idempotent)
        if (ourStatus === "success" && tx.userId && tx.amount > 0) {
            const isWalletTopup =
                tx.type === "TOPUP" ||
                (tx.accountReference && tx.accountReference.toUpperCase().startsWith("WALLET")) ||
                (tx.merchantReference && tx.merchantReference.toUpperCase().includes("ORBIT"));

            if (isWalletTopup) {
                const claimed = await this.txModel.findOneAndUpdate(
                    { _id: tx._id, walletCreditedAt: { $exists: false } },
                    { $set: { walletCreditedAt: new Date() } },
                    { new: true },
                );

                if (claimed) {
                    await this.userService.addToBalance(tx.userId, tx.amount);
                    this.logger.warn(
                        `PesaPal wallet credited: user=${tx.userId}, amount=${tx.amount}, tx=${tx._id}`,
                    );
                } else {
                    this.logger.warn(
                        `PesaPal wallet already credited for tx=${tx._id}`,
                    );
                }
            }
        }

        return { status: ourStatus };
    }

    /**
     * Get wallet top-up history for a user.
     */
    async getWalletTopups(
        userId: string,
        limit: number = 20,
    ): Promise<any[]> {
        if (!userId) throw new BadRequestException("Missing userId");
        const l = Number.isFinite(limit)
            ? Math.min(Math.max(limit, 1), 50)
            : 20;

        const docs = await this.txModel
            .find({ userId, type: "TOPUP" })
            .sort({ createdAt: -1 })
            .limit(l)
            .lean();

        return docs.map((d: any) => ({
            id: d._id?.toString?.() ?? d._id,
            amount: d.amount,
            currency: d.currency,
            status: d.status,
            confirmationCode: d.confirmationCode,
            paymentMethod: d.paymentMethod,
            merchantReference: d.merchantReference,
            accountReference: d.accountReference,
            createdAt: d.createdAt,
            paidAt: d.paidAt,
        }));
    }

    /**
     * Find a transaction by its ID.
     */
    async findTxById(id: string, userId?: string): Promise<any> {
        const tx: any = await this.txModel.findById(id).lean();
        if (!tx) throw new BadRequestException("Transaction not found");
        if (userId && tx?.userId && tx.userId !== userId) {
            throw new BadRequestException("Not allowed");
        }
        return tx;
    }

    /**
     * Verify a transaction by checking its status with PesaPal.
     */
    async verifyTransaction(dto: {
        userId: string;
        orderTrackingId: string;
    }): Promise<any> {
        if (!dto?.userId) throw new BadRequestException("Missing userId");
        if (!dto?.orderTrackingId)
            throw new BadRequestException("orderTrackingId is required");

        const tx = await this.txModel
            .findOne({ orderTrackingId: dto.orderTrackingId })
            .lean();

        if (tx?.userId && tx.userId !== dto.userId) {
            throw new BadRequestException(
                "This transaction does not belong to you",
            );
        }

        const statusResult = await this.getTransactionStatus(
            dto.orderTrackingId,
        );
        const paymentStatus = (
            statusResult?.payment_status_description || ""
        )
            .toString()
            .trim()
            .toLowerCase();

        const isSuccess = paymentStatus === "completed";

        const update: any = {
            status: isSuccess ? "success" : paymentStatus === "failed" ? "failed" : "pending",
            paymentStatusDescription:
                statusResult?.payment_status_description,
            paymentMethod: statusResult?.payment_method || undefined,
            confirmationCode: statusResult?.confirmation_code || undefined,
            rawCallback: statusResult,
        };

        if (isSuccess && statusResult?.created_date) {
            update.paidAt = new Date(statusResult.created_date);
        }

        const saved = await this.txModel.findOneAndUpdate(
            { orderTrackingId: dto.orderTrackingId },
            { $set: update },
            { new: true },
        );

        // Credit wallet on success (idempotent)
        if (isSuccess && saved?.userId && saved.amount > 0) {
            const claimed = await this.txModel.findOneAndUpdate(
                { _id: saved._id, walletCreditedAt: { $exists: false } },
                { $set: { walletCreditedAt: new Date() } },
                { new: true },
            );
            if (claimed) {
                await this.userService.addToBalance(
                    saved.userId,
                    Number(saved.amount) || 0,
                );
                this.logger.warn(
                    `PesaPal verify: wallet credited user=${saved.userId}, amount=${saved.amount}`,
                );
            }
        }

        return {
            orderTrackingId: dto.orderTrackingId,
            status: saved?.status || update.status,
            amount: saved?.amount,
            currency: saved?.currency,
            confirmationCode: saved?.confirmationCode,
            paymentMethod: saved?.paymentMethod,
            paidAt: saved?.paidAt,
        };
    }
}
