import mongoose from 'mongoose';
import pM from 'mongoose-paginate-v2';

export type MarketplaceListingStatus = 'draft' | 'preview' | 'published' | 'expired';
export type MarketplaceMediaType = 'image' | 'video';
export type MarketplacePriceType = 'fixed' | 'negotiable';

export interface IMarketplaceMedia {
  url: string;
  type: MarketplaceMediaType;
  mimeType?: string;
}

export interface IMarketplaceListing {
  userId: string;

  title?: string;
  price?: number;
  priceType?: MarketplacePriceType;
  category?: string;
  brand?: string;
  condition?: string;
  description?: string;

  locationLabel?: string;
  locationLat?: number;
  locationLng?: number;

  media?: IMarketplaceMedia[];

  status: MarketplaceListingStatus;
  expiresInDays?: number | null;
  expiresAt?: Date | null;
  publishedAt?: Date | null;

  isActive?: boolean;

  isHidden?: boolean;
  hiddenAt?: Date | null;

  isSold?: boolean;
  soldAt?: Date | null;
  soldPrice?: number | null;
  isPaymentReleased?: boolean;
  paymentReleasedAt?: Date | null;
  paymentReleasedBy?: string | null;

  deliveryAvailable?: boolean;

  electronicsWarrantyStatus?: string;

  homeFurnitureItemDimensions?: string;
  homeFurniturePickupDeliveryNotes?: string;

  clothingFashionSize?: string;
  clothingFashionColor?: string;

  servicesCategory?: string;

  businessIndustrialBulkOrder?: boolean;
  businessIndustrialMinQty?: number | null;

  sportsOutdoorGearTags?: string[];

  booksMusicHobbiesAuthor?: string;
  booksMusicHobbiesInstrument?: string;
  booksMusicHobbiesCollectible?: boolean;

  petsAnimalsType?: string;
  petsAnimalsBreed?: string;
  petsAnimalsVaccinationRecords?: string;

  realEstateTransactionType?: string;
  realEstatePropertyType?: string;
  realEstateBedrooms?: number | null;
  realEstateBathrooms?: number | null;
  realEstateSquareFootage?: number | null;
  realEstateFurnished?: boolean;
  realEstateAmenities?: string[];

  vehicleType?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: number | null;
  vehicleMileage?: number | null;
  vehicleTransmission?: string;
  vehicleFuelType?: string;
  vehicleVin?: string;
  vehicleHistoryNotes?: string;

  viewsCount?: number;
  likesCount?: number;
  likedBy?: string[];

  // Reviews
  reviews?: Array<{
    userId: string;
    rating: number;
    text?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  ratingAvg?: number;
  ratingCount?: number;

  // Promotion
  isPromoted?: boolean;
  promotedAt?: Date | null;
  promotionExpiresAt?: Date | null;
  promotionPlan?: 'weekly' | 'monthly' | null;
  promotionPaidAmount?: number | null;
}

export const MarketplaceListingSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    title: { type: String, default: null },
    price: { type: Number, default: null },
    priceType: {
      type: String,
      enum: ['fixed', 'negotiable'],
      default: 'fixed',
    },
    category: { type: String, default: null, index: true },
    brand: { type: String, default: null },
    condition: { type: String, default: null },
    description: { type: String, default: null },

    locationLabel: { type: String, default: null },
    locationLat: { type: Number, default: null },
    locationLng: { type: Number, default: null },

    media: {
      type: [
        {
          url: { type: String, required: true },
          type: { type: String, enum: ['image', 'video'], required: true },
          mimeType: { type: String, default: null },
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ['draft', 'preview', 'published', 'expired'],
      default: 'draft',
      index: true,
    },

    expiresInDays: { type: Number, default: null },
    expiresAt: { type: Date, default: null, index: true },
    publishedAt: { type: Date, default: null },

    isActive: { type: Boolean, default: true, index: true },

    isHidden: { type: Boolean, default: false, index: true },
    hiddenAt: { type: Date, default: null },

    isSold: { type: Boolean, default: false, index: true },
    soldAt: { type: Date, default: null },
    soldPrice: { type: Number, default: null },
    isPaymentReleased: { type: Boolean, default: false, index: true },
    paymentReleasedAt: { type: Date, default: null },
    paymentReleasedBy: { type: String, default: null },

    deliveryAvailable: { type: Boolean, default: false, index: true },

    electronicsWarrantyStatus: { type: String, default: null },

    homeFurnitureItemDimensions: { type: String, default: null },
    homeFurniturePickupDeliveryNotes: { type: String, default: null },

    clothingFashionSize: { type: String, default: null },
    clothingFashionColor: { type: String, default: null },

    servicesCategory: { type: String, default: null },

    businessIndustrialBulkOrder: { type: Boolean, default: false },
    businessIndustrialMinQty: { type: Number, default: null },

    sportsOutdoorGearTags: { type: [String], default: [] },

    booksMusicHobbiesAuthor: { type: String, default: null },
    booksMusicHobbiesInstrument: { type: String, default: null },
    booksMusicHobbiesCollectible: { type: Boolean, default: false },

    petsAnimalsType: { type: String, default: null },
    petsAnimalsBreed: { type: String, default: null },
    petsAnimalsVaccinationRecords: { type: String, default: null },

    realEstateTransactionType: { type: String, default: null },
    realEstatePropertyType: { type: String, default: null },
    realEstateBedrooms: { type: Number, default: null },
    realEstateBathrooms: { type: Number, default: null },
    realEstateSquareFootage: { type: Number, default: null },
    realEstateFurnished: { type: Boolean, default: false },
    realEstateAmenities: { type: [String], default: [] },

    vehicleType: { type: String, default: null },
    vehicleMake: { type: String, default: null },
    vehicleModel: { type: String, default: null },
    vehicleYear: { type: Number, default: null },
    vehicleMileage: { type: Number, default: null },
    vehicleTransmission: { type: String, default: null },
    vehicleFuelType: { type: String, default: null },
    vehicleVin: { type: String, default: null },
    vehicleHistoryNotes: { type: String, default: null },

    viewsCount: { type: Number, default: 0 },
    likesCount: { type: Number, default: 0 },
    likedBy: { type: [String], default: [] },

    // Reviews
    reviews: {
      type: [
        {
          userId: { type: String, required: true },
          rating: { type: Number, required: true, min: 1, max: 5 },
          text: { type: String, default: null },
          createdAt: { type: Date, default: Date.now },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // Promotion
    isPromoted: { type: Boolean, default: false, index: true },
    promotedAt: { type: Date, default: null },
    promotionExpiresAt: { type: Date, default: null, index: true },
    promotionPlan: { type: String, enum: ['weekly', 'monthly', null], default: null },
    promotionPaidAmount: { type: Number, default: null },
  },
  { timestamps: true }
);

MarketplaceListingSchema.index({ status: 1, createdAt: -1 });
MarketplaceListingSchema.index({ userId: 1, status: 1, createdAt: -1 });
MarketplaceListingSchema.index({ expiresAt: 1, status: 1 });
MarketplaceListingSchema.index({ userId: 1, status: 1, likesCount: -1 });
MarketplaceListingSchema.index({ userId: 1, status: 1, viewsCount: -1 });
MarketplaceListingSchema.index({ isPromoted: 1, promotionExpiresAt: 1 });

MarketplaceListingSchema.plugin(pM);
