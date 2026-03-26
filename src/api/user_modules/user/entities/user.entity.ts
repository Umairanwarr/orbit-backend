import mongoose, { Schema } from "mongoose";
import bcrypt from "bcrypt";
import pM from "mongoose-paginate-v2";
import {
  MailType,
  RegisterMethod,
  RegisterStatus,
  UserPrivacyTypes,
  UserRole,
  UserType,
} from "../../../../core/utils/enums";
import { IUserDevice } from "../../user_device/entities/user_device.entity";
import { UserGlobalCallStatus } from "../../../../chat/call_modules/utils/user-global-call-status.model";

export interface IUser {
  _id: string;
  email: string;
  fullName: string;
  fullNameEn: string;
  password: string;
  uniqueCode: number;
  bio?: string;
  profession?: string;
  phoneNumber?: string;
  // Gender enum male female
  gender?: string;
  // Location fields for nearby users feature
  latitude?: number;
  longitude?: number;
  locationUpdatedAt?: Date;
  lastMail: {
    type: MailType;
    sendAt: Date;
    code: number;
    expired: boolean;
  };
  banTo?: Date;
  banMessageTo: Date;
  banLiveTo: Date;
  rideBannedAt?: Date | null;
  rideBanReason?: string | null;
  rideUnbannedAt?: Date | null;
  verifiedAt?: Date;
  verifiedUntil?: Date | null;
  registerStatus: RegisterStatus;
  registerMethod: RegisterMethod;
  userImage: string;
  createdAt: Date;
  deletedAt?: Date;
  countryId?: string;
  updatedAt: Date;
  lastSeenAt: Date;
  loyaltyPoints: number;
  balance: number;
  claimedGifts: string[];
  roles: UserRole[];
  userPrivacy: UserPrivacy;
  //not saved in db
  currentDevice: IUserDevice;
  resetPasswordOTP?: string;
  resetPasswordOTPExpiry?: Date;
  userGlobalCallStatus?: UserGlobalCallStatus;
  socialId?: string;
  provider?: string;
  // Two-Factor Authentication fields
  twoFactorSecret?: string | null;
  twoFactorEnabled?: boolean;
  twoFactorOTP?: string | null;
  twoFactorOTPExpiry?: Date | null;
  twoFactorDeviceId?: string | null;
  twoFactorTicket?: string | null;
  trustedDeviceIds?: string[];
}

export interface UserPrivacy {
  startChat: UserPrivacyTypes;
  publicSearch: boolean;
  showStory: UserPrivacyTypes;
  lastSeen: boolean;
  readReceipts: boolean;
  hideFollowing?: boolean;
  profilePicAllowedUsers: string[];
  profilePicBlockedUsers: string[];
  groupAddPermission: UserPrivacyTypes;
  callPermission: UserPrivacyTypes;
  callAllowedUsers: string[];
  callBlockedUsers: string[];
}

export const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    fullNameEn: { type: String, required: true },
    bio: { type: String, default: null },
    profession: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    userGlobalCallStatus: {
      type: Object,
      default: UserGlobalCallStatus.createEmpty(),
    },
    gender: { type: String, enum: ["male", "female", "other"], default: "male" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    locationUpdatedAt: { type: Date, default: null },
    uniqueCode: { type: Number, required: true },
    password: { type: String, required: true, select: false },
    lastMail: { type: Object, default: {} },
    verifiedAt: { type: Date, default: null },
    verifiedUntil: { type: Date, default: null },
    userImage: { type: String, default: "/v-public/default_user_image.png" },
    registerStatus: {
      type: String,
      enum: Object.values(RegisterStatus),
      required: true,
    },
    registerMethod: {
      type: String,
      enum: Object.values(RegisterMethod),
      required: true,
    },
    roles: {
      type: [String], // Define as an array of strings
      default: [],
      enum: Object.values(UserRole), // Ensure UserRole values are strings
    },
    banTo: { type: Date, default: null },
    banMessageTo: { type: Date, default: null },
    banLiveTo: { type: Date, default: null },
    rideBannedAt: { type: Date, default: null },
    rideBanReason: { type: String, default: null },
    rideUnbannedAt: { type: Date, default: null },
    countryId: { type: Schema.Types.ObjectId, default: null, ref: "countries" },
    createdAt: { type: Date },
    deletedAt: { type: Date, default: null },

    userPrivacy: {
      type: Object,
      default: {
        startChat: UserPrivacyTypes.ForReq,
        publicSearch: true,
        showStory: UserPrivacyTypes.ForReq,
        lastSeen: true,
        readReceipts: true,
        hideFollowing: false,
        profilePicAllowedUsers: [],
        profilePicBlockedUsers: [],
        groupAddPermission: UserPrivacyTypes.Public,
        callPermission: UserPrivacyTypes.Public,
        callAllowedUsers: [],
        callBlockedUsers: [],
      },
    },
    lastSeenAt: { type: Date, default: Date.now },
    loyaltyPoints: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    claimedGifts: { type: [String], default: [] },
    updatedAt: { type: Date },
    resetPasswordOTP: { type: String, default: null },
    resetPasswordOTPExpiry: { type: Date, default: null },
    socialId: { type: String, default: null },
    provider: { type: String, default: null },
    // 2FA fields
    twoFactorSecret: { type: String, default: null, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorOTP: { type: String, default: null },
    twoFactorOTPExpiry: { type: Date, default: null },
    twoFactorDeviceId: { type: String, default: null },
    twoFactorTicket: { type: String, default: null },
    trustedDeviceIds: { type: [String], default: [] },
  },
  {
    timestamps: true,
  }
);

UserSchema.pre("save", async function (next) {
  let user = this;
  if (!user.isModified("password")) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hashSync(user.password, salt);
  return next();
});
UserSchema.pre("findOneAndUpdate", async function (next) {
  let update: any = this.getUpdate();

  // If password is under $set, hash it
  if (update.$set && update.$set.password) {
    const salt = await bcrypt.genSalt(10);
    update.$set.password = await bcrypt.hash(update.$set.password, salt);
  }
  // If password is directly in the object (rare case), hash it too
  else if (update.password) {
    const salt = await bcrypt.genSalt(10);
    update.password = await bcrypt.hash(update.password, salt);
  }

  next();
});

// Transform to ensure userImage URLs are always relative paths
UserSchema.set('toJSON', {
    transform: function(doc, ret) {
        if (ret.userImage && ret.userImage.startsWith('http')) {
            // Extract the path part from full URL
            const url = new URL(ret.userImage);
            // Preserve Cloudinary (and other external CDN) URLs.
            // Only convert to relative path when it's our own domain.
            const host = (url.hostname || '').toLowerCase();
            const isCloudinary = host.includes('res.cloudinary.com');
            const isOurDomain = host.endsWith('orbit.ke') || host.endsWith('superupdev.online');
            if (!isCloudinary && isOurDomain) {
                ret.userImage = url.pathname;
                console.log(`User toJSON transform - Converted userImage to: ${ret.userImage}`);
            }
        }
        return ret;
    }
});

UserSchema.set('toObject', {
    transform: function(doc, ret) {
        if (ret.userImage && ret.userImage.startsWith('http')) {
            // Extract the path part from full URL
            const url = new URL(ret.userImage);
            // Preserve Cloudinary (and other external CDN) URLs.
            // Only convert to relative path when it's our own domain.
            const host = (url.hostname || '').toLowerCase();
            const isCloudinary = host.includes('res.cloudinary.com');
            const isOurDomain = host.endsWith('orbit.ke') || host.endsWith('superupdev.online');
            if (!isCloudinary && isOurDomain) {
                ret.userImage = url.pathname;
                console.log(`User toObject transform - Converted userImage to: ${ret.userImage}`);
            }
        }
        return ret;
    }
});

UserSchema.plugin(pM);

// export const UserEntity = mongoose.model<IUser>("User", userSchema);
