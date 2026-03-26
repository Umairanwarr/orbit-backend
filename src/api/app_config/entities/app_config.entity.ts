/**
 * Copyright 2023, the hatemragab project author.
 * All rights reserved. Use of this source code is governed by a
 * MIT license that can be found in the LICENSE file.
 */

import mongoose from "mongoose";
 import {RegisterStatus} from "../../../core/utils/enums";
import {VRoomsIcon} from "../../../core/utils/interfaceces";
import {version} from '../../../../package.json';

export interface IAppConfig {
    _id: string,
    configVersion: number,
    enableAds: boolean,
    feedbackEmail: string,
    allowWebLogin: boolean,
    allowMobileLogin: boolean,
    allowCreateGroup: boolean,
    allowCreateBroadcast: boolean,
    allowMessaging: boolean,
    allowSendMedia: boolean,
    allowDesktopLogin: boolean,
    privacyUrl: string,
    privacyPolicyText?: string,
    googlePayUrl: string,
    webChatUrl: string,
    windowsStoreUrl: string,
    macStoreUrl: string,
    appleStoreUrl: string,
    appName: string,
    //for password recovery
    maxExpireEmailTime: number,
    userRegisterStatus: RegisterStatus,
    ///v chat
    callTimeout: number,
    maxGroupMembers: number
    maxBroadcastMembers: number
    maxChatMediaSize: number
    backendVersion?: string
    maxForward: number
    allowCall: boolean
    roomIcons: VRoomsIcon,
    groupIcon: string,
    supportIcon: string,
    broadcastIcon: string,
    userIcon: string,
    liveWatermarkUrl?: string,
    activeLocales?: string[],
    // Verification system
    verificationFee?: number,
    verificationFeeMonthly?: number,
    verificationFeeSixMonths?: number,
    verificationFeeYearly?: number,
    verificationInstructions?: string,
    // Admin panel login password (hashed)
    adminPanelPasswordHash?: string,
    // Ads
    adSubmissionFee?: number,
    announcementText?: string,
    announcementUpdatedAt?: number,
    professions?: string[],
    // Marketplace Promotions
    marketplacePromotionWeeklyFee?: number,
    marketplacePromotionMonthlyFee?: number,
    // Driver Subscription
    driverSubscriptionFee?: number,
}

export const AppConfigSchema = new mongoose.Schema(
    {
        configVersion: {type: Number, default: 1},
        backendVersion: {type: String,default:"1.0.0" },
        enableAds: {type: Boolean, default: true},
        feedbackEmail: {type: String, default: "vchatsdk@gmail.com"},
        allowWebLogin: {type: Boolean, default: true},
        allowMobileLogin: {type: Boolean, default: true},
        allowCreateGroup: {type: Boolean, default: true},
        ///change this by your app name
        appName: {type: String, default: "Orbit Chat"},
        allowCreateBroadcast: {type: Boolean, default: true},
        allowDesktopLogin: {type: Boolean, default: true},
        privacyUrl: {type: String, default: "https://api.superupdev.online/privacy-policy"},
        privacyPolicyText: {type: String, default: null},
        googlePayUrl: {type: String, default: null},
        webChatUrl: {type: String, default: null},
        windowsStoreUrl: {type: String, default: null},
        macStoreUrl: {type: String, default: null},
        appleStoreUrl: {type: String, default: null},
        maxExpireEmailTime: {type: Number, default: 5}, //5 minutes for rest password
        userRegisterStatus: {type: String, default: RegisterStatus.accepted},
        userIcon: {type: String, default: "/v-public/default_user_image.png"},
        ///v chat
        callTimeout: {type: Number, default: 30000},
        roomIcons: {
            type: Object, default: {
                group: "👥",
                order: "💬",
                broadcast: "📢"
            }
        },
        allowMessaging: {type: Boolean, default: true},
        allowSendMedia: {type: Boolean, default: true},
        maxGroupMembers: {type: Number, default: 512},
        maxBroadcastMembers: {type: Number, default: 512},
        maxForward: {type: Number, default: 10},
        maxChatMediaSize: {type: Number, default: 1024 * 1024 * 100},// 100 mbs
        allowCall: {type: Boolean, default: true},
        groupIcon: {type: String, default: "/v-public/default_group_image.png"},
        supportIcon: {type: String, default: "/v-public/default_support_image.png"},
        broadcastIcon: {type: String, default: "/v-public/default_broadcast_image.png"},
        liveWatermarkUrl: { type: String, default: null },
        activeLocales: { type: [String], default: null },
        // Verification system
        verificationFee: { type: Number, default: 0 },
        verificationFeeMonthly: { type: Number, default: 0 },
        verificationFeeSixMonths: { type: Number, default: 0 },
        verificationFeeYearly: { type: Number, default: 0 },
        verificationInstructions: { type: String, default: null },
        // Admin panel login password (hashed)
        adminPanelPasswordHash: { type: String, default: null },
        // Ads
        adSubmissionFee: { type: Number, default: 0 },
        announcementText: { type: String, default: null },
        announcementUpdatedAt: { type: Number, default: null },
        professions: {
            type: [String],
            default: [
                'Services',
                'Entertainment',
                'Massage',
                'Software Engineer',
                'Developer',
                'Data Scientist',
                'Product Manager',
                'Project Manager',
                'UI/UX Designer',
                'Designer',
                'Doctor',
                'Nurse',
                'Dentist',
                'Pharmacist',
                'Teacher',
                'Student',
                'Business Owner',
                'Entrepreneur',
                'Lawyer',
                'Accountant',
                'Marketing',
                'Sales',
                'Customer Support',
                'Mechanic',
                'Driver',
                'Chef',
                'Photographer',
                'Artist',
                'Musician',
                'Athlete',
                'Real Estate Agent',
                'Architect',
                'Civil Engineer',
                'Electrician',
                'Plumber',
                'Farmer',
                'Consultant',
                'Journalist',
                'Writer',
                'Other',
            ]
        },
        // Marketplace Promotions
        marketplacePromotionWeeklyFee: { type: Number, default: 100 },
        marketplacePromotionMonthlyFee: { type: Number, default: 350 },
        // Driver Subscription
        driverSubscriptionFee: { type: Number, default: 0 },
    },
    {
        timestamps: true
    }
);
