import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateModel, QueryOptions } from 'mongoose';
import { IMarketplaceListing } from './marketplace_listing.entity';
import { FileUploaderService } from '../../common/file_uploader/file_uploader.service';
import { CreateS3UploaderDto } from '../../common/file_uploader/create-s3_uploader.dto';
import { OrderRoomSettingsService } from '../../chat/order_room_settings/single_room_settings.service';
import { UserService } from '../user_modules/user/user.service';

function safeNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

@Injectable()
export class MarketplaceListingsService {
  constructor(
    @InjectModel('marketplace_listings')
    private readonly model: PaginateModel<IMarketplaceListing>,
    private readonly fileUploader: FileUploaderService,
    private readonly orderRoomSettingsService: OrderRoomSettingsService,
    private readonly userService: UserService,
  ) {}

  private async _setMarketplaceRoomsClosedAt(listingId: string, closedAt: Date | null) {
    const id = (listingId ?? '').toString().trim();
    if (!id) return;
    const pattern = new RegExp(`^mp_${id}(?:_|$)`);
    await this.orderRoomSettingsService.updateMany(
      { orderId: pattern } as any,
      { closedAt } as any,
    );
  }

  private _normalizeMedia(media: any): Array<{ url: string; type: 'image' | 'video'; mimeType?: string | null }> {
    const arr = Array.isArray(media) ? media : [];
    return arr
      .map((m: any) => {
        const url = (m?.url ?? '').toString().trim();
        const type = (m?.type ?? '').toString().trim();
        const mimeType = (m?.mimeType ?? null) as any;
        if (!url) return null;
        if (type !== 'image' && type !== 'video') return null;
        return { url, type, mimeType: mimeType ? mimeType.toString() : null };
      })
      .filter(Boolean) as any;
  }

  private _validateMediaRules(
    media: Array<{ url: string; type: 'image' | 'video'; mimeType?: string | null }>,
    opts: { requireAtLeastOneImage: boolean },
  ) {
    const images = media.filter((m) => m.type === 'image');
    const videos = media.filter((m) => m.type === 'video');

    if (images.length > 5) {
      throw new BadRequestException('Maximum 5 photos allowed');
    }
    if (videos.length > 1) {
      throw new BadRequestException('Maximum 1 video allowed');
    }
    if (opts.requireAtLeastOneImage && images.length < 1) {
      throw new BadRequestException('At least one photo is required');
    }
  }

  create(obj: Partial<IMarketplaceListing>) {
    return this.model.create(obj as any);
  }

  findAll(filter: FilterQuery<IMarketplaceListing> = {}, options?: QueryOptions<IMarketplaceListing>) {
    return this.model.find(filter, null, options).sort({ createdAt: -1 });
  }

  paginate(paginationParameters: any[]) {
    return this.model.paginate(...paginationParameters);
  }

  findOne(filter: FilterQuery<IMarketplaceListing>) {
    return this.model.findOne(filter);
  }

  findById(id: string) {
    return this.model.findById(id);
  }

  findByIdAndUpdate(id: string, update: Partial<IMarketplaceListing>) {
    return this.model.findByIdAndUpdate(id, update, { new: true });
  }

  findByIdAndDelete(id: string) {
    return this.model.findByIdAndDelete(id);
  }

  async upsertDraft(myUserId: string, body: any) {
    const media = this._normalizeMedia(body?.media);
    this._validateMediaRules(media, { requireAtLeastOneImage: false });

    const category = (body?.category ?? '').toString().trim();
    const isRealEstate = category.toLowerCase() === 'real estate';
    const isVehicle = category.toLowerCase() === 'vehicles' || category.toLowerCase() === 'vehicle';
    const isElectronics = category.toLowerCase() === 'electronics';
    const isHomeFurniture =
      category.toLowerCase() === 'home & furniture' || category.toLowerCase() === 'home and furniture';
    const isClothingFashion =
      category.toLowerCase() === 'clothing & fashion' ||
      category.toLowerCase() === 'clothing and fashion' ||
      category.toLowerCase() === 'fashion';
    const isPetsAnimals =
      category.toLowerCase() === 'pets & animals' || category.toLowerCase() === 'pets and animals';
    const isServices = category.toLowerCase() === 'services' || category.toLowerCase() === 'service';
    const isBusinessIndustrial =
      category.toLowerCase() === 'business & industrial' || category.toLowerCase() === 'business and industrial';
    const isKidsBaby =
      category.toLowerCase() === 'kids & baby' || category.toLowerCase() === 'kids and baby';
    const isSports =
      category.toLowerCase() === 'sports' ||
      category.toLowerCase() === 'sports & fitness' ||
      category.toLowerCase() === 'sports and fitness';
    const isBooksMusicHobbies =
      category.toLowerCase() === 'books' ||
      category.toLowerCase() === 'book' ||
      category.toLowerCase() === 'books, music & hobbies' ||
      category.toLowerCase() === 'books, music and hobbies' ||
      category.toLowerCase() === 'books music & hobbies' ||
      category.toLowerCase() === 'books music and hobbies' ||
      category.toLowerCase() === 'music & hobbies' ||
      category.toLowerCase() === 'music and hobbies' ||
      category.toLowerCase() === 'books & hobbies' ||
      category.toLowerCase() === 'books and hobbies' ||
      category.toLowerCase() === 'books & music' ||
      category.toLowerCase() === 'books and music';

    const reqDelivery = body?.deliveryAvailable;
    const deliveryAvailable =
      typeof reqDelivery === 'boolean'
        ? reqDelivery
        : (reqDelivery ?? '').toString().trim().toLowerCase() === 'true';

    const txRaw = (body?.realEstateTransactionType ?? '').toString().trim().toLowerCase();
    const realEstateTransactionType =
      txRaw === 'buy' || txRaw === 'rent' || txRaw === 'lease' ? txRaw : null;
    const ptRaw = (body?.realEstatePropertyType ?? '').toString().trim();
    const realEstatePropertyType = ptRaw ? ptRaw : null;
    const realEstateBedrooms = safeNum(body?.realEstateBedrooms);
    const realEstateBathrooms = safeNum(body?.realEstateBathrooms);
    const realEstateSquareFootage = safeNum(body?.realEstateSquareFootage);
    const reqFurnished = body?.realEstateFurnished;
    const realEstateFurnished =
      typeof reqFurnished === 'boolean'
        ? reqFurnished
        : (reqFurnished ?? '').toString().trim().toLowerCase() === 'true';
    const rawAmenities = Array.isArray(body?.realEstateAmenities) ? body.realEstateAmenities : [];
    const realEstateAmenities = Array.from(
      new Set(
        rawAmenities
          .map((a: any) => (a ?? '').toString().trim())
          .filter((a: string) => a.length > 0)
          .slice(0, 50),
      ),
    );

    const vehicleType = (body?.vehicleType ?? '').toString().trim() || null;
    const vehicleMake = (body?.vehicleMake ?? '').toString().trim() || null;
    const vehicleModel = (body?.vehicleModel ?? '').toString().trim() || null;
    const vehicleYear = safeNum(body?.vehicleYear);
    const vehicleMileage = safeNum(body?.vehicleMileage);
    const transRaw = (body?.vehicleTransmission ?? '').toString().trim().toLowerCase();
    const vehicleTransmission = transRaw === 'automatic' || transRaw === 'manual' ? transRaw : null;
    const fuelRaw = (body?.vehicleFuelType ?? '').toString().trim().toLowerCase();
    const vehicleFuelType = fuelRaw ? fuelRaw : null;
    const vehicleVin = (body?.vehicleVin ?? '').toString().trim() || null;
    const vehicleHistoryNotes = (body?.vehicleHistoryNotes ?? '').toString().trim() || null;

    const electronicsWarrantyStatus =
      (body?.electronicsWarrantyStatus ?? '').toString().trim() || null;

    const homeFurnitureItemDimensions =
      (body?.homeFurnitureItemDimensions ?? '').toString().trim() || null;
    const homeFurniturePickupDeliveryNotes =
      (body?.homeFurniturePickupDeliveryNotes ?? '').toString().trim() || null;

    const clothingFashionSize = (body?.clothingFashionSize ?? '').toString().trim() || null;
    const clothingFashionColor = (body?.clothingFashionColor ?? '').toString().trim() || null;

    const servicesCategoryRaw = (body?.servicesCategory ?? '').toString().trim().toLowerCase();
    const servicesCategory =
      servicesCategoryRaw === 'home' || servicesCategoryRaw === 'professional' || servicesCategoryRaw === 'personal'
        ? servicesCategoryRaw
        : null;

    const reqBulkOrder = body?.businessIndustrialBulkOrder;
    const businessIndustrialBulkOrder =
      typeof reqBulkOrder === 'boolean'
        ? reqBulkOrder
        : (reqBulkOrder ?? '').toString().trim().toLowerCase() === 'true';
    const businessIndustrialMinQty = safeNum(body?.businessIndustrialMinQty);

    const rawSportsOutdoorGearTags = Array.isArray(body?.sportsOutdoorGearTags)
      ? body.sportsOutdoorGearTags
      : [];
    const sportsOutdoorGearTags = Array.from(
      new Set(
        rawSportsOutdoorGearTags
          .map((t: any) => (t ?? '').toString().trim())
          .filter((t: string) => t.length > 0)
          .slice(0, 20),
      ),
    );

    const booksMusicHobbiesAuthor =
      (body?.booksMusicHobbiesAuthor ?? '').toString().trim() || null;
    const booksMusicHobbiesInstrument =
      (body?.booksMusicHobbiesInstrument ?? '').toString().trim() || null;
    const reqCollectible = body?.booksMusicHobbiesCollectible;
    const booksMusicHobbiesCollectible =
      typeof reqCollectible === 'boolean'
        ? reqCollectible
        : (reqCollectible ?? '').toString().trim().toLowerCase() === 'true';

    const petsAnimalsType = (body?.petsAnimalsType ?? '').toString().trim() || null;
    const petsAnimalsBreed = (body?.petsAnimalsBreed ?? '').toString().trim() || null;
    const petsAnimalsVaccinationRecords =
      (body?.petsAnimalsVaccinationRecords ?? '').toString().trim() || null;

    const update: any = {
      title: body?.title ?? null,
      category: category || null,
      brand: isRealEstate || isVehicle || isHomeFurniture || isPetsAnimals || isServices || isBusinessIndustrial || isKidsBaby || isSports || isBooksMusicHobbies ? null : (body?.brand ?? null),
      condition: isRealEstate || isVehicle || isPetsAnimals || isServices ? null : (body?.condition ?? null),
      description: body?.description ?? null,
      locationLabel: body?.locationLabel ?? null,
      locationLat: safeNum(body?.locationLat),
      locationLng: safeNum(body?.locationLng),
      media,
      price: safeNum(body?.price),
      priceType: (body?.priceType ?? 'fixed') === 'negotiable' ? 'negotiable' : 'fixed',
      deliveryAvailable: isRealEstate || isVehicle || isPetsAnimals || isServices ? false : deliveryAvailable,

      electronicsWarrantyStatus: isElectronics ? electronicsWarrantyStatus : null,

      homeFurnitureItemDimensions: isHomeFurniture ? homeFurnitureItemDimensions : null,
      homeFurniturePickupDeliveryNotes: isHomeFurniture ? homeFurniturePickupDeliveryNotes : null,

      clothingFashionSize: isClothingFashion ? clothingFashionSize : null,
      clothingFashionColor: isClothingFashion ? clothingFashionColor : null,

      servicesCategory: isServices ? servicesCategory : null,

      businessIndustrialBulkOrder: isBusinessIndustrial ? businessIndustrialBulkOrder : false,
      businessIndustrialMinQty:
        isBusinessIndustrial && businessIndustrialBulkOrder ? businessIndustrialMinQty : null,

      sportsOutdoorGearTags: isSports ? sportsOutdoorGearTags : [],

      booksMusicHobbiesAuthor: isBooksMusicHobbies ? booksMusicHobbiesAuthor : null,
      booksMusicHobbiesInstrument: isBooksMusicHobbies ? booksMusicHobbiesInstrument : null,
      booksMusicHobbiesCollectible: isBooksMusicHobbies ? booksMusicHobbiesCollectible : false,

      petsAnimalsType: isPetsAnimals ? petsAnimalsType : null,
      petsAnimalsBreed: isPetsAnimals ? petsAnimalsBreed : null,
      petsAnimalsVaccinationRecords: isPetsAnimals ? petsAnimalsVaccinationRecords : null,

      realEstateTransactionType: isRealEstate ? realEstateTransactionType : null,
      realEstatePropertyType: isRealEstate ? realEstatePropertyType : null,
      realEstateBedrooms: isRealEstate ? realEstateBedrooms : null,
      realEstateBathrooms: isRealEstate ? realEstateBathrooms : null,
      realEstateSquareFootage: isRealEstate ? realEstateSquareFootage : null,
      realEstateFurnished: isRealEstate ? realEstateFurnished : false,
      realEstateAmenities: isRealEstate ? realEstateAmenities : [],

      vehicleType: isVehicle ? vehicleType : null,
      vehicleMake: isVehicle ? vehicleMake : null,
      vehicleModel: isVehicle ? vehicleModel : null,
      vehicleYear: isVehicle ? vehicleYear : null,
      vehicleMileage: isVehicle ? vehicleMileage : null,
      vehicleTransmission: isVehicle ? vehicleTransmission : null,
      vehicleFuelType: isVehicle ? vehicleFuelType : null,
      vehicleVin: isVehicle ? vehicleVin : null,
      vehicleHistoryNotes: isVehicle ? vehicleHistoryNotes : null,
      status: 'draft',
      isActive: true,
      expiresInDays: safeNum(body?.expiresInDays),
    };

    // If draft already exists update it
    if (body?.id) {
      const existing = await this.model.findOne({ _id: body.id, userId: myUserId }).exec();
      if (!existing) throw new NotFoundException('Draft not found');
      if ((existing as any).status !== 'draft') throw new BadRequestException('Only drafts can be updated');
      const updated = await this.model.findByIdAndUpdate(body.id, update, { new: true });
      return updated;
    }

    // else create a new draft
    const created = await this.model.create({
      userId: myUserId,
      ...update,
    });
    return created;
  }

  async preview(myUserId: string, body: any) {
    // Normalize like publish would
    const title = (body?.title ?? '').toString().trim();
    const category = (body?.category ?? '').toString().trim();
    const isRealEstate = category.toLowerCase() === 'real estate';
    const isVehicle = category.toLowerCase() === 'vehicles' || category.toLowerCase() === 'vehicle';
    const isElectronics = category.toLowerCase() === 'electronics';
    const isHomeFurniture =
      category.toLowerCase() === 'home & furniture' || category.toLowerCase() === 'home and furniture';
    const isClothingFashion =
      category.toLowerCase() === 'clothing & fashion' ||
      category.toLowerCase() === 'clothing and fashion' ||
      category.toLowerCase() === 'fashion';
    const isPetsAnimals =
      category.toLowerCase() === 'pets & animals' || category.toLowerCase() === 'pets and animals';
    const isServices = category.toLowerCase() === 'services' || category.toLowerCase() === 'service';
    const isBusinessIndustrial =
      category.toLowerCase() === 'business & industrial' || category.toLowerCase() === 'business and industrial';
    const isKidsBaby =
      category.toLowerCase() === 'kids & baby' || category.toLowerCase() === 'kids and baby';
    const isSports =
      category.toLowerCase() === 'sports' ||
      category.toLowerCase() === 'sports & fitness' ||
      category.toLowerCase() === 'sports and fitness';
    const isBooksMusicHobbies =
      category.toLowerCase() === 'books, music & hobbies' ||
      category.toLowerCase() === 'books, music and hobbies' ||
      category.toLowerCase() === 'books music & hobbies' ||
      category.toLowerCase() === 'books music and hobbies' ||
      category.toLowerCase() === 'music & hobbies' ||
      category.toLowerCase() === 'music and hobbies' ||
      category.toLowerCase() === 'books' ||
      category.toLowerCase() === 'book' ||
      category.toLowerCase() === 'books & hobbies' ||
      category.toLowerCase() === 'books and hobbies' ||
      category.toLowerCase() === 'books & music' ||
      category.toLowerCase() === 'books and music';
    const brand = (body?.brand ?? '').toString().trim();
    const condition = (body?.condition ?? '').toString().trim();
    const description = (body?.description ?? '').toString().trim();
    const price = safeNum(body?.price);
    const priceType = (body?.priceType ?? 'fixed') === 'negotiable' ? 'negotiable' : 'fixed';
    const expiresInDays = safeNum(body?.expiresInDays) ?? 30;

    const electronicsWarrantyStatus =
      (body?.electronicsWarrantyStatus ?? '').toString().trim() || null;

    const homeFurnitureItemDimensions =
      (body?.homeFurnitureItemDimensions ?? '').toString().trim() || null;
    const homeFurniturePickupDeliveryNotes =
      (body?.homeFurniturePickupDeliveryNotes ?? '').toString().trim() || null;

    const clothingFashionSize = (body?.clothingFashionSize ?? '').toString().trim() || null;
    const clothingFashionColor = (body?.clothingFashionColor ?? '').toString().trim() || null;

    const servicesCategoryRaw = (body?.servicesCategory ?? '').toString().trim().toLowerCase();
    const servicesCategory =
      servicesCategoryRaw === 'home' || servicesCategoryRaw === 'professional' || servicesCategoryRaw === 'personal'
        ? servicesCategoryRaw
        : null;

    const reqBulkOrder = body?.businessIndustrialBulkOrder;
    const businessIndustrialBulkOrder =
      typeof reqBulkOrder === 'boolean'
        ? reqBulkOrder
        : (reqBulkOrder ?? '').toString().trim().toLowerCase() === 'true';
    const businessIndustrialMinQty = safeNum(body?.businessIndustrialMinQty);

    const rawSportsOutdoorGearTags = Array.isArray(body?.sportsOutdoorGearTags)
      ? body.sportsOutdoorGearTags
      : [];
    const sportsOutdoorGearTags = Array.from(
      new Set(
        rawSportsOutdoorGearTags
          .map((t: any) => (t ?? '').toString().trim())
          .filter((t: string) => t.length > 0)
          .slice(0, 20),
      ),
    );

    const booksMusicHobbiesAuthor =
      (body?.booksMusicHobbiesAuthor ?? '').toString().trim() || null;
    const booksMusicHobbiesInstrument =
      (body?.booksMusicHobbiesInstrument ?? '').toString().trim() || null;
    const reqCollectible = body?.booksMusicHobbiesCollectible;
    const booksMusicHobbiesCollectible =
      typeof reqCollectible === 'boolean'
        ? reqCollectible
        : (reqCollectible ?? '').toString().trim().toLowerCase() === 'true';

    const petsAnimalsType = (body?.petsAnimalsType ?? '').toString().trim() || null;
    const petsAnimalsBreed = (body?.petsAnimalsBreed ?? '').toString().trim() || null;
    const petsAnimalsVaccinationRecords =
      (body?.petsAnimalsVaccinationRecords ?? '').toString().trim() || null;

    const reqDelivery = body?.deliveryAvailable;
    const deliveryAvailable =
      typeof reqDelivery === 'boolean'
        ? reqDelivery
        : (reqDelivery ?? '').toString().trim().toLowerCase() === 'true';

    const txRaw = (body?.realEstateTransactionType ?? '').toString().trim().toLowerCase();
    const realEstateTransactionType =
      txRaw === 'buy' || txRaw === 'rent' || txRaw === 'lease' ? txRaw : null;
    const ptRaw = (body?.realEstatePropertyType ?? '').toString().trim();
    const realEstatePropertyType = ptRaw ? ptRaw : null;
    const realEstateBedrooms = safeNum(body?.realEstateBedrooms);
    const realEstateBathrooms = safeNum(body?.realEstateBathrooms);
    const realEstateSquareFootage = safeNum(body?.realEstateSquareFootage);
    const reqFurnished = body?.realEstateFurnished;
    const realEstateFurnished =
      typeof reqFurnished === 'boolean'
        ? reqFurnished
        : (reqFurnished ?? '').toString().trim().toLowerCase() === 'true';
    const rawAmenities = Array.isArray(body?.realEstateAmenities) ? body.realEstateAmenities : [];
    const realEstateAmenities = Array.from(
      new Set(
        rawAmenities
          .map((a: any) => (a ?? '').toString().trim())
          .filter((a: string) => a.length > 0)
          .slice(0, 50),
      ),
    );

    const vehicleType = (body?.vehicleType ?? '').toString().trim() || null;
    const vehicleMake = (body?.vehicleMake ?? '').toString().trim() || null;
    const vehicleModel = (body?.vehicleModel ?? '').toString().trim() || null;
    const vehicleYear = safeNum(body?.vehicleYear);
    const vehicleMileage = safeNum(body?.vehicleMileage);
    const transRaw = (body?.vehicleTransmission ?? '').toString().trim().toLowerCase();
    const vehicleTransmission = transRaw === 'automatic' || transRaw === 'manual' ? transRaw : null;
    const fuelRaw = (body?.vehicleFuelType ?? '').toString().trim().toLowerCase();
    const vehicleFuelType = fuelRaw ? fuelRaw : null;
    const vehicleVin = (body?.vehicleVin ?? '').toString().trim() || null;
    const vehicleHistoryNotes = (body?.vehicleHistoryNotes ?? '').toString().trim() || null;

    const media = this._normalizeMedia(body?.media);
    if (!title) throw new BadRequestException('title is required');
    if (!category) throw new BadRequestException('category is required');
    if (!isRealEstate && !isVehicle && !isPetsAnimals && !isServices && !condition) {
      throw new BadRequestException('condition is required');
    }

    if (isServices && !servicesCategory) {
      throw new BadRequestException('service category is required');
    }

    if (isBusinessIndustrial && businessIndustrialBulkOrder && (!businessIndustrialMinQty || businessIndustrialMinQty <= 0)) {
      throw new BadRequestException('min quantity is required');
    }
    if (isRealEstate && !realEstateTransactionType) {
      throw new BadRequestException('transaction type is required');
    }
    if (isRealEstate && !realEstatePropertyType) {
      throw new BadRequestException('property type is required');
    }

    if (isVehicle && !vehicleType) throw new BadRequestException('vehicle type is required');
    if (isVehicle && !vehicleMake) throw new BadRequestException('vehicle make is required');
    if (isVehicle && !vehicleModel) throw new BadRequestException('vehicle model is required');
    if (isVehicle && (vehicleYear === null || vehicleYear === undefined)) {
      throw new BadRequestException('vehicle year is required');
    }

    if (isPetsAnimals && !petsAnimalsType) {
      throw new BadRequestException('animal type is required');
    }
    if (isPetsAnimals && !petsAnimalsBreed) {
      throw new BadRequestException('breed is required');
    }
    this._validateMediaRules(media, { requireAtLeastOneImage: true });

    const locationLabel = (body?.locationLabel ?? '').toString().trim();
    const locationLat = safeNum(body?.locationLat);
    const locationLng = safeNum(body?.locationLng);

    return {
      title: title || null,
      category: category || null,
      brand: isRealEstate || isVehicle || isHomeFurniture || isPetsAnimals || isServices || isBusinessIndustrial || isKidsBaby || isSports || isBooksMusicHobbies ? null : (brand || null),
      condition: isRealEstate || isVehicle || isPetsAnimals || isServices ? null : (condition || null),
      description: description || null,
      price,
      priceType,
      deliveryAvailable: isRealEstate || isVehicle || isPetsAnimals || isServices ? false : deliveryAvailable,

      electronicsWarrantyStatus: isElectronics ? electronicsWarrantyStatus : null,

      homeFurnitureItemDimensions: isHomeFurniture ? homeFurnitureItemDimensions : null,
      homeFurniturePickupDeliveryNotes: isHomeFurniture ? homeFurniturePickupDeliveryNotes : null,

      clothingFashionSize: isClothingFashion ? clothingFashionSize : null,
      clothingFashionColor: isClothingFashion ? clothingFashionColor : null,

      servicesCategory: isServices ? servicesCategory : null,

      businessIndustrialBulkOrder: isBusinessIndustrial ? businessIndustrialBulkOrder : false,
      businessIndustrialMinQty:
        isBusinessIndustrial && businessIndustrialBulkOrder ? businessIndustrialMinQty : null,

      sportsOutdoorGearTags: isSports ? sportsOutdoorGearTags : [],

      booksMusicHobbiesAuthor: isBooksMusicHobbies ? booksMusicHobbiesAuthor : null,
      booksMusicHobbiesInstrument: isBooksMusicHobbies ? booksMusicHobbiesInstrument : null,
      booksMusicHobbiesCollectible: isBooksMusicHobbies ? booksMusicHobbiesCollectible : false,

      petsAnimalsType: isPetsAnimals ? petsAnimalsType : null,
      petsAnimalsBreed: isPetsAnimals ? petsAnimalsBreed : null,
      petsAnimalsVaccinationRecords: isPetsAnimals ? petsAnimalsVaccinationRecords : null,

      realEstateTransactionType: isRealEstate ? realEstateTransactionType : null,
      realEstatePropertyType: isRealEstate ? realEstatePropertyType : null,
      realEstateBedrooms: isRealEstate ? realEstateBedrooms : null,
      realEstateBathrooms: isRealEstate ? realEstateBathrooms : null,
      realEstateSquareFootage: isRealEstate ? realEstateSquareFootage : null,
      realEstateFurnished: isRealEstate ? realEstateFurnished : false,
      realEstateAmenities: isRealEstate ? realEstateAmenities : [],

      vehicleType: isVehicle ? vehicleType : null,
      vehicleMake: isVehicle ? vehicleMake : null,
      vehicleModel: isVehicle ? vehicleModel : null,
      vehicleYear: isVehicle ? vehicleYear : null,
      vehicleMileage: isVehicle ? vehicleMileage : null,
      vehicleTransmission: isVehicle ? vehicleTransmission : null,
      vehicleFuelType: isVehicle ? vehicleFuelType : null,
      vehicleVin: isVehicle ? vehicleVin : null,
      vehicleHistoryNotes: isVehicle ? vehicleHistoryNotes : null,
      media,
      locationLabel: locationLabel || null,
      locationLat,
      locationLng,
      expiresInDays,
      expiresAt: expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null,
    };
  }

  async savePreview(myUserId: string, body: any) {
    const normalized = await this.preview(myUserId, body);

    const update: any = {
      ...normalized,
      status: 'preview',
      isActive: true,
      publishedAt: null,
    };

    if (body?.id) {
      const existing = await this.model.findOne({ _id: body.id, userId: myUserId }).exec();
      if (!existing) throw new NotFoundException('Listing not found');
      if ((existing as any).status === 'expired') throw new BadRequestException('Cannot preview an expired listing');
      if ((existing as any).isSold === true) {
        throw new BadRequestException('Sold listings cannot be updated');
      }

      const updated = await this.model.findByIdAndUpdate(body.id, update, { new: true });
      if (!updated) throw new NotFoundException('Listing not found');
      return updated;
    }

    const created = await this.model.create({
      userId: myUserId,
      ...update,
    });
    return created;
  }

  async publish(myUserId: string, body: any) {
    const title = (body?.title ?? '').toString().trim();
    const category = (body?.category ?? '').toString().trim();
    const isRealEstate = category.toLowerCase() === 'real estate';
    const isVehicle = category.toLowerCase() === 'vehicles' || category.toLowerCase() === 'vehicle';
    const isElectronics = category.toLowerCase() === 'electronics';
    const isHomeFurniture =
      category.toLowerCase() === 'home & furniture' || category.toLowerCase() === 'home and furniture';
    const isClothingFashion =
      category.toLowerCase() === 'clothing & fashion' ||
      category.toLowerCase() === 'clothing and fashion' ||
      category.toLowerCase() === 'fashion';
    const isPetsAnimals =
      category.toLowerCase() === 'pets & animals' || category.toLowerCase() === 'pets and animals';
    const isServices = category.toLowerCase() === 'services' || category.toLowerCase() === 'service';
    const isBusinessIndustrial =
      category.toLowerCase() === 'business & industrial' || category.toLowerCase() === 'business and industrial';
    const isKidsBaby =
      category.toLowerCase() === 'kids & baby' || category.toLowerCase() === 'kids and baby';
    const isSports =
      category.toLowerCase() === 'sports' ||
      category.toLowerCase() === 'sports & fitness' ||
      category.toLowerCase() === 'sports and fitness';
    const categoryLower = category.toLowerCase();
    const isBooksMusicHobbies =
      categoryLower.includes('book') ||
      (categoryLower.includes('music') && categoryLower.includes('hobb')) ||
      categoryLower === 'books' ||
      categoryLower === 'book' ||
      categoryLower === 'books, music & hobbies' ||
      categoryLower === 'books, music and hobbies' ||
      categoryLower === 'books music & hobbies' ||
      categoryLower === 'books music and hobbies' ||
      categoryLower === 'music & hobbies' ||
      categoryLower === 'music and hobbies' ||
      categoryLower === 'books & hobbies' ||
      categoryLower === 'books and hobbies' ||
      categoryLower === 'books & music' ||
      categoryLower === 'books and music';
    const brand = (body?.brand ?? '').toString().trim();
    const condition = (body?.condition ?? '').toString().trim();

    if (!title) throw new BadRequestException('title is required');
    if (!category) throw new BadRequestException('category is required');
    if (!isRealEstate && !isVehicle && !isPetsAnimals && !isServices && !condition) {
      throw new BadRequestException('condition is required');
    }

    const media = this._normalizeMedia(body?.media);
    if (!Array.isArray(media) || media.length === 0) {
      throw new BadRequestException('At least one media item is required');
    }
    this._validateMediaRules(media, { requireAtLeastOneImage: true });

    const expiresInDays = safeNum(body?.expiresInDays) ?? 30;
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const electronicsWarrantyStatus =
      (body?.electronicsWarrantyStatus ?? '').toString().trim() || null;

    const homeFurnitureItemDimensions =
      (body?.homeFurnitureItemDimensions ?? '').toString().trim() || null;
    const homeFurniturePickupDeliveryNotes =
      (body?.homeFurniturePickupDeliveryNotes ?? '').toString().trim() || null;

    const clothingFashionSize = (body?.clothingFashionSize ?? '').toString().trim() || null;
    const clothingFashionColor = (body?.clothingFashionColor ?? '').toString().trim() || null;

    const servicesCategoryRaw = (body?.servicesCategory ?? '').toString().trim().toLowerCase();
    const servicesCategory =
      servicesCategoryRaw === 'home' || servicesCategoryRaw === 'professional' || servicesCategoryRaw === 'personal'
        ? servicesCategoryRaw
        : null;

    if (isServices && !servicesCategory) {
      throw new BadRequestException('service category is required');
    }

    const reqBulkOrder = body?.businessIndustrialBulkOrder;
    const businessIndustrialBulkOrder =
      typeof reqBulkOrder === 'boolean'
        ? reqBulkOrder
        : (reqBulkOrder ?? '').toString().trim().toLowerCase() === 'true';
    const businessIndustrialMinQty = safeNum(body?.businessIndustrialMinQty);

    const rawSportsOutdoorGearTags = Array.isArray(body?.sportsOutdoorGearTags)
      ? body.sportsOutdoorGearTags
      : [];
    const sportsOutdoorGearTags = Array.from(
      new Set(
        rawSportsOutdoorGearTags
          .map((t: any) => (t ?? '').toString().trim())
          .filter((t: string) => t.length > 0)
          .slice(0, 20),
      ),
    );

    const booksMusicHobbiesAuthor =
      (body?.booksMusicHobbiesAuthor ?? '').toString().trim() || null;
    const booksMusicHobbiesInstrument =
      (body?.booksMusicHobbiesInstrument ?? '').toString().trim() || null;
    const reqCollectible = body?.booksMusicHobbiesCollectible;
    const booksMusicHobbiesCollectible =
      typeof reqCollectible === 'boolean'
        ? reqCollectible
        : (reqCollectible ?? '').toString().trim().toLowerCase() === 'true';

    if (isBusinessIndustrial && businessIndustrialBulkOrder && (!businessIndustrialMinQty || businessIndustrialMinQty <= 0)) {
      throw new BadRequestException('min quantity is required');
    }

    const petsAnimalsType = (body?.petsAnimalsType ?? '').toString().trim() || null;
    const petsAnimalsBreed = (body?.petsAnimalsBreed ?? '').toString().trim() || null;
    const petsAnimalsVaccinationRecords =
      (body?.petsAnimalsVaccinationRecords ?? '').toString().trim() || null;

    const reqDelivery = body?.deliveryAvailable;
    const deliveryAvailable =
      typeof reqDelivery === 'boolean'
        ? reqDelivery
        : (reqDelivery ?? '').toString().trim().toLowerCase() === 'true';

    const txRaw = (body?.realEstateTransactionType ?? '').toString().trim().toLowerCase();
    const realEstateTransactionType =
      txRaw === 'buy' || txRaw === 'rent' || txRaw === 'lease' ? txRaw : null;
    const ptRaw = (body?.realEstatePropertyType ?? '').toString().trim();
    const realEstatePropertyType = ptRaw ? ptRaw : null;
    const realEstateBedrooms = safeNum(body?.realEstateBedrooms);
    const realEstateBathrooms = safeNum(body?.realEstateBathrooms);
    const realEstateSquareFootage = safeNum(body?.realEstateSquareFootage);
    const reqFurnished = body?.realEstateFurnished;
    const realEstateFurnished =
      typeof reqFurnished === 'boolean'
        ? reqFurnished
        : (reqFurnished ?? '').toString().trim().toLowerCase() === 'true';
    const rawAmenities = Array.isArray(body?.realEstateAmenities) ? body.realEstateAmenities : [];
    const realEstateAmenities = Array.from(
      new Set(
        rawAmenities
          .map((a: any) => (a ?? '').toString().trim())
          .filter((a: string) => a.length > 0)
          .slice(0, 50),
      ),
    );

    const vehicleType = (body?.vehicleType ?? '').toString().trim() || null;
    const vehicleMake = (body?.vehicleMake ?? '').toString().trim() || null;
    const vehicleModel = (body?.vehicleModel ?? '').toString().trim() || null;
    const vehicleYear = safeNum(body?.vehicleYear);
    const vehicleMileage = safeNum(body?.vehicleMileage);
    const transRaw = (body?.vehicleTransmission ?? '').toString().trim().toLowerCase();
    const vehicleTransmission = transRaw === 'automatic' || transRaw === 'manual' ? transRaw : null;
    const fuelRaw = (body?.vehicleFuelType ?? '').toString().trim().toLowerCase();
    const vehicleFuelType = fuelRaw ? fuelRaw : null;
    const vehicleVin = (body?.vehicleVin ?? '').toString().trim() || null;
    const vehicleHistoryNotes = (body?.vehicleHistoryNotes ?? '').toString().trim() || null;

    if (isRealEstate && !realEstateTransactionType) {
      throw new BadRequestException('transaction type is required');
    }
    if (isRealEstate && !realEstatePropertyType) {
      throw new BadRequestException('property type is required');
    }

    if (isVehicle && !vehicleType) throw new BadRequestException('vehicle type is required');
    if (isVehicle && !vehicleMake) throw new BadRequestException('vehicle make is required');
    if (isVehicle && !vehicleModel) throw new BadRequestException('vehicle model is required');
    if (isVehicle && (vehicleYear === null || vehicleYear === undefined)) {
      throw new BadRequestException('vehicle year is required');
    }

    if (isPetsAnimals && !petsAnimalsType) {
      throw new BadRequestException('animal type is required');
    }
    if (isPetsAnimals && !petsAnimalsBreed) {
      throw new BadRequestException('breed is required');
    }

    const reqHide = body?.isHidden;
    const hasHideFlag = reqHide !== undefined && reqHide !== null;
    const isHidden = typeof reqHide === 'boolean'
      ? reqHide
      : (reqHide ?? '').toString().trim().toLowerCase() === 'true';

    const update: any = {
      title,
      category,
      brand: isRealEstate || isVehicle || isHomeFurniture || isPetsAnimals || isServices || isBusinessIndustrial || isKidsBaby || isSports || isBooksMusicHobbies ? null : (brand || null),
      condition: isRealEstate || isVehicle || isPetsAnimals || isServices ? null : condition,
      description: body?.description ?? null,
      price: safeNum(body?.price),
      priceType: (body?.priceType ?? 'fixed') === 'negotiable' ? 'negotiable' : 'fixed',
      deliveryAvailable: isRealEstate || isVehicle || isPetsAnimals || isServices ? false : deliveryAvailable,

      electronicsWarrantyStatus: isElectronics ? electronicsWarrantyStatus : null,

      homeFurnitureItemDimensions: isHomeFurniture ? homeFurnitureItemDimensions : null,
      homeFurniturePickupDeliveryNotes: isHomeFurniture ? homeFurniturePickupDeliveryNotes : null,

      clothingFashionSize: isClothingFashion ? clothingFashionSize : null,
      clothingFashionColor: isClothingFashion ? clothingFashionColor : null,

      servicesCategory: isServices ? servicesCategory : null,

      businessIndustrialBulkOrder: isBusinessIndustrial ? businessIndustrialBulkOrder : false,
      businessIndustrialMinQty:
        isBusinessIndustrial && businessIndustrialBulkOrder ? businessIndustrialMinQty : null,

      sportsOutdoorGearTags: isSports ? sportsOutdoorGearTags : [],

      booksMusicHobbiesAuthor: isBooksMusicHobbies ? booksMusicHobbiesAuthor : null,
      booksMusicHobbiesInstrument: isBooksMusicHobbies ? booksMusicHobbiesInstrument : null,
      booksMusicHobbiesCollectible: isBooksMusicHobbies ? booksMusicHobbiesCollectible : false,

      petsAnimalsType: isPetsAnimals ? petsAnimalsType : null,
      petsAnimalsBreed: isPetsAnimals ? petsAnimalsBreed : null,
      petsAnimalsVaccinationRecords: isPetsAnimals ? petsAnimalsVaccinationRecords : null,

      realEstateTransactionType: isRealEstate ? realEstateTransactionType : null,
      realEstatePropertyType: isRealEstate ? realEstatePropertyType : null,
      realEstateBedrooms: isRealEstate ? realEstateBedrooms : null,
      realEstateBathrooms: isRealEstate ? realEstateBathrooms : null,
      realEstateSquareFootage: isRealEstate ? realEstateSquareFootage : null,
      realEstateFurnished: isRealEstate ? realEstateFurnished : false,
      realEstateAmenities: isRealEstate ? realEstateAmenities : [],

      vehicleType: isVehicle ? vehicleType : null,
      vehicleMake: isVehicle ? vehicleMake : null,
      vehicleModel: isVehicle ? vehicleModel : null,
      vehicleYear: isVehicle ? vehicleYear : null,
      vehicleMileage: isVehicle ? vehicleMileage : null,
      vehicleTransmission: isVehicle ? vehicleTransmission : null,
      vehicleFuelType: isVehicle ? vehicleFuelType : null,
      vehicleVin: isVehicle ? vehicleVin : null,
      vehicleHistoryNotes: isVehicle ? vehicleHistoryNotes : null,
      locationLabel: body?.locationLabel ?? null,
      locationLat: safeNum(body?.locationLat),
      locationLng: safeNum(body?.locationLng),
      media,
      status: 'published',
      publishedAt: new Date(),
      expiresInDays,
      expiresAt,
      isActive: true,
      ...(hasHideFlag ? { isHidden: !!isHidden, hiddenAt: isHidden ? new Date() : null } : {}),
    };

    if (body?.id) {
      const existing = await this.model.findOne({ _id: body.id, userId: myUserId }).exec();
      if (!existing) throw new NotFoundException('Listing not found');
      if ((existing as any).status === 'expired') throw new BadRequestException('Cannot publish an expired listing');
      if ((existing as any).isSold === true) {
        throw new BadRequestException('Sold listings cannot be updated');
      }

      // allow publishing both drafts and re-publishing an existing published listing (reset expiration)
      const updated = await this.model.findByIdAndUpdate(body.id, update, { new: true });
      if (!updated) throw new NotFoundException('Listing not found');

      if (hasHideFlag) {
        try {
          await this._setMarketplaceRoomsClosedAt(body.id, isHidden ? new Date() : null);
        } catch (_) {
          // ignore
        }
      }

      return updated;
    }

    const created = await this.model.create({
      userId: myUserId,
      ...update,
    });

    if (hasHideFlag && isHidden) {
      try {
        await this._setMarketplaceRoomsClosedAt((created as any)._id?.toString() ?? '', new Date());
      } catch (_) {
        // ignore
      }
    }

    return created;
  }

  async myListings(myUserId: string, status?: string) {
    const filter: any = { userId: myUserId, isActive: true };
    if (status) filter.status = status;
    return this.model.find(filter).sort({ createdAt: -1 }).lean();
  }

  async getByIdForUser(myUserId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, userId: myUserId }).lean();
    if (!doc) throw new NotFoundException('Listing not found');
    return doc;
  }

  async getByIdPublic(id: string) {
    const now = new Date();
    const doc = await this.model
      .findOne({
        _id: id,
        status: 'published',
        isActive: true,
        isSold: { $ne: true },
        isHidden: { $ne: true },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      })
      .lean();
    if (!doc) throw new NotFoundException('Listing not found');
    return doc;
  }

  async incrementPublicView(id: string) {
    const now = new Date();
    const doc = await this.model
      .findOneAndUpdate(
        {
          _id: id,
          status: 'published',
          isActive: true,
          isSold: { $ne: true },
          isHidden: { $ne: true },
          $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        } as any,
        { $inc: { viewsCount: 1 } } as any,
        { new: true },
      )
      .lean();
    if (!doc) throw new NotFoundException('Listing not found');
    return {
      viewsCount: safeNum((doc as any).viewsCount) ?? 0,
    };
  }

  async getLikeState(myUserId: string, id: string) {
    const now = new Date();
    const doc: any = await this.model
      .findOne({
        _id: id,
        status: 'published',
        isActive: true,
        isSold: { $ne: true },
        isHidden: { $ne: true },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      })
      .select({ likesCount: 1, likedBy: 1 })
      .lean();
    if (!doc) throw new NotFoundException('Listing not found');
    const likedBy = Array.isArray(doc.likedBy) ? doc.likedBy : [];
    return {
      liked: likedBy.includes(myUserId),
      likesCount: safeNum(doc.likesCount) ?? 0,
    };
  }

  async toggleLike(myUserId: string, id: string) {
    const now = new Date();
    const existing: any = await this.model
      .findOne({
        _id: id,
        status: 'published',
        isActive: true,
        isSold: { $ne: true },
        isHidden: { $ne: true },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      })
      .exec();
    if (!existing) throw new NotFoundException('Listing not found');
    if ((existing as any).userId?.toString() === myUserId?.toString()) {
      throw new BadRequestException('You cannot like your own listing');
    }

    const likedBy = Array.isArray((existing as any).likedBy) ? (existing as any).likedBy : [];
    const alreadyLiked = likedBy.includes(myUserId);
    const update = alreadyLiked
      ? ({ $pull: { likedBy: myUserId }, $inc: { likesCount: -1 } } as any)
      : ({ $addToSet: { likedBy: myUserId }, $inc: { likesCount: 1 } } as any);

    const updated: any = await this.model
      .findByIdAndUpdate(id, update, { new: true })
      .select({ likesCount: 1 })
      .lean();

    const likesCount = Math.max(0, safeNum(updated?.likesCount) ?? 0);
    if ((updated?.likesCount ?? 0) < 0) {
      try {
        await this.model.findByIdAndUpdate(id, { likesCount }, { new: false });
      } catch (_) {
        // ignore
      }
    }

    return { liked: !alreadyLiked, likesCount };
  }

  async myAnalytics(myUserId: string) {
    const items: any[] = await this.model
      .find({ userId: myUserId, isActive: true, status: 'published' } as any)
      .select({
        title: 1,
        price: 1,
        likesCount: 1,
        viewsCount: 1,
        isHidden: 1,
        isSold: 1,
        createdAt: 1,
        publishedAt: 1,
      })
      .sort({ createdAt: -1 })
      .lean();

    let totalLikes = 0;
    let totalViews = 0;
    for (const it of items as any[]) {
      totalLikes += safeNum((it as any)?.likesCount) ?? 0;
      totalViews += safeNum((it as any)?.viewsCount) ?? 0;
    }

    return {
      totalLikes,
      totalViews,
      listingsCount: items.length,
      items,
    };
  }

  async hideListing(myUserId: string, id: string) {
    const existing: any = await this.model.findOne({ _id: id, userId: myUserId }).exec();
    if (!existing) throw new NotFoundException('Listing not found');
    if (existing.status !== 'published') {
      throw new BadRequestException('Only published listings can be hidden');
    }
    if (existing.isActive !== true) {
      throw new BadRequestException('Listing is not active');
    }

    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { isHidden: true, hiddenAt: new Date() } as any,
        { new: true },
      )
      .lean();

    try {
      await this._setMarketplaceRoomsClosedAt(id, new Date());
    } catch (_) {
      // ignore
    }

    return updated;
  }

  async getSoldOutListingsForAdmin(page = 1, limit = 20, paymentReleased?: boolean) {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
    const skip = (safePage - 1) * safeLimit;

    const filter: any = {
      isSold: true,
      soldAt: { $ne: null },
    };
    if (typeof paymentReleased === 'boolean') {
      filter.isPaymentReleased = paymentReleased;
    }

    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ soldAt: -1, createdAt: -1 }).skip(skip).limit(safeLimit).lean(),
      this.model.countDocuments(filter),
    ]);

    return {
      docs,
      totalDocs: total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
      hasNextPage: skip + docs.length < total,
      hasPrevPage: safePage > 1,
    };
  }

  async releaseSoldPaymentByAdmin(listingId: string, adminId?: string) {
    const now = new Date();
    const claimed: any = await this.model
      .findOneAndUpdate(
        {
          _id: listingId,
          isSold: true,
          isPaymentReleased: { $ne: true },
        } as any,
        {
          $set: {
            isPaymentReleased: true,
            paymentReleasedAt: now,
            paymentReleasedBy: adminId ?? null,
          },
        } as any,
        { new: true },
      )
      .lean();

    if (!claimed) {
      const existing: any = await this.model.findById(listingId).lean();
      if (!existing) {
        throw new NotFoundException('Listing not found');
      }
      if (existing.isSold !== true) {
        throw new BadRequestException('Listing is not sold');
      }
      if (existing.isPaymentReleased === true) {
        throw new BadRequestException('Payment already released');
      }
      throw new BadRequestException('Unable to release payment for this listing');
    }

    const soldPrice = safeNum(claimed?.soldPrice);
    if (soldPrice === null || soldPrice === undefined || soldPrice <= 0) {
      await this.model.findByIdAndUpdate(
        listingId,
        {
          isPaymentReleased: false,
          paymentReleasedAt: null,
          paymentReleasedBy: null,
        } as any,
        { new: false },
      );
      throw new BadRequestException('Sold price is invalid for payout');
    }

    try {
      await this.userService.addToBalance((claimed.userId ?? '').toString(), soldPrice);
    } catch (e) {
      await this.model.findByIdAndUpdate(
        listingId,
        {
          isPaymentReleased: false,
          paymentReleasedAt: null,
          paymentReleasedBy: null,
        } as any,
        { new: false },
      );
      throw e;
    }

    return claimed;
  }

  async markAsSold(myUserId: string, id: string, body?: { soldPrice?: number }) {
    const existing: any = await this.model.findOne({ _id: id, userId: myUserId }).exec();
    if (!existing) throw new NotFoundException('Listing not found');
    if (existing.status !== 'published') {
      throw new BadRequestException('Only published listings can be marked as sold');
    }
    if (existing.isActive !== true) {
      throw new BadRequestException('Listing is not active');
    }
    if ((existing as any).isSold === true) {
      return this.model.findById(id).lean();
    }

    const reqPrice = (body as any)?.soldPrice;
    const soldPrice = safeNum(reqPrice) ?? safeNum((existing as any).price);
    if (soldPrice === null || soldPrice === undefined || soldPrice <= 0) {
      throw new BadRequestException('soldPrice must be greater than 0');
    }

    const now = new Date();
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          isSold: true,
          soldAt: now,
          soldPrice,
          isPaymentReleased: false,
          paymentReleasedAt: null,
          paymentReleasedBy: null,
          isHidden: true,
          hiddenAt: now,
        } as any,
        { new: true },
      )
      .lean();

    try {
      await this._setMarketplaceRoomsClosedAt(id, now);
    } catch (_) {
      // ignore
    }

    return updated;
  }

  async unhideListing(myUserId: string, id: string) {
    const existing: any = await this.model.findOne({ _id: id, userId: myUserId }).exec();
    if (!existing) throw new NotFoundException('Listing not found');
    if (existing.status !== 'published') {
      throw new BadRequestException('Only published listings can be unhidden');
    }
    if ((existing as any).isSold === true) {
      throw new BadRequestException('Sold listings cannot be unhidden');
    }
    if (existing.isActive !== true) {
      throw new BadRequestException('Listing is not active');
    }
    const expiresAt = existing.expiresAt ? new Date(existing.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Listing is expired');
    }

    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { isHidden: false, hiddenAt: null } as any,
        { new: true },
      )
      .lean();

    try {
      await this._setMarketplaceRoomsClosedAt(id, null);
    } catch (_) {
      // ignore
    }

    return updated;
  }

  async deleteForUser(myUserId: string, id: string) {
    const existing = await this.model.findOne({ _id: id, userId: myUserId }).exec();
    if (!existing) throw new NotFoundException('Listing not found');

    const media: any[] = Array.isArray((existing as any).media) ? (existing as any).media : [];
    for (const m of media) {
      const url = (m?.url ?? '').toString();
      if (url) {
        await this.fileUploader.deleteByUrl(url);
      }
    }

    await this.model.findByIdAndDelete(id).exec();
    return { deleted: true };
  }

  async adminRemoveListing(id: string) {
    const existing = await this.model.findById(id).exec();
    if (!existing) throw new NotFoundException('Listing not found');
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        {
          isActive: false,
          status: 'expired',
          expiresAt: new Date(),
        } as any,
        { new: true },
      )
      .lean();

    // Close all marketplace order rooms related to this listing
    // orderId format: mp_<listingId>_<buyerId>
    try {
      const pattern = new RegExp(`^mp_${id}(?:_|$)`);
      await this.orderRoomSettingsService.updateMany(
        { orderId: pattern } as any,
        { closedAt: new Date() } as any,
      );
    } catch (_) {
      // ignore
    }

    return { removed: true, listing: updated };
  }

  async uploadMedia(myUserId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    const mime = (file.mimetype ?? '').toString();
    const isImage = mime.startsWith('image/');
    const isVideo = mime.startsWith('video/');
    if (!isImage && !isVideo) {
      throw new BadRequestException('Only image or video files are allowed');
    }

    const uploaderDto = new CreateS3UploaderDto();
    uploaderDto.mediaBuffer = file.buffer;
    uploaderDto.fileName = file.originalname;
    uploaderDto.myUser = { _id: myUserId } as any;

    const url = await this.fileUploader.uploadChatMedia(uploaderDto);
    return {
      url,
      type: isImage ? 'image' : 'video',
      mimeType: mime,
    };
  }

  getCategories(): string[] {
    return [
      'Real Estate',
      'Vehicles',
      'Electronics',
      'Home & Furniture',
      'Clothing & Fashion',
      'Pets & Animals',
      'Services',
      'Business & Industrial',
      'Kids & Baby',
      'Sports & Fitness',
      'Books',
      'Music & Hobbies',
    ];
  }

  async feed(params: {
    category?: string;
    q?: string;
    limit?: number;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    minPrice?: number;
    maxPrice?: number;
    condition?: string;
  }) {
    const DEFAULT_RADIUS_KM = 10;
    const MAX_RADIUS_KM = 50;

    const limit = Math.max(1, Math.min(Number(params.limit || 20), 100));
    const filter: any = {
      status: 'published',
      isActive: true,
      isSold: { $ne: true },
      isHidden: { $ne: true },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };
    if (params.category) filter.category = params.category;

    const condition = (params.condition ?? '').toString().trim();
    if (condition) {
      const parts = condition.split(/[\s\-]+/).filter(Boolean);
      const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = '^' + parts.map(escaped).join('[-\\s]+') + '$';
      filter.condition = { $regex: pattern, $options: 'i' };
    }

    const minPrice = Number(params.minPrice);
    const maxPrice = Number(params.maxPrice);
    const hasMinPrice = Number.isFinite(minPrice);
    const hasMaxPrice = Number.isFinite(maxPrice);
    if (hasMinPrice || hasMaxPrice) {
      filter.price = {
        ...(hasMinPrice ? { $gte: minPrice } : {}),
        ...(hasMaxPrice ? { $lte: maxPrice } : {}),
      };
    }

    if (params.q && params.q.trim().length > 0) {
      const q = params.q.trim();
      filter.$and = [
        {
          $or: [
            { title: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
          ],
        },
      ];
    }

    const lat = Number(params.lat);
    const lng = Number(params.lng);
    let radiusKm = Number(params.radiusKm);

    const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng);
    if (hasLatLng && (!Number.isFinite(radiusKm) || radiusKm <= 0)) {
      radiusKm = DEFAULT_RADIUS_KM;
    }
    if (Number.isFinite(radiusKm)) {
      radiusKm = Math.max(1, Math.min(radiusKm, MAX_RADIUS_KM));
    }

    const hasGeo = hasLatLng && Number.isFinite(radiusKm) && radiusKm > 0;

    if (!hasGeo) {
      return this.model.find(filter).sort({ publishedAt: -1, createdAt: -1 }).limit(limit).lean();
    }

    // Bounding box to reduce query size (approx)
    const latDelta = radiusKm / 110.574;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const denom = 111.320 * Math.max(Math.abs(cosLat), 1e-6);
    const lngDelta = radiusKm / denom;

    filter.locationLat = { $ne: null, $gte: lat - latDelta, $lte: lat + latDelta };
    filter.locationLng = { $ne: null, $gte: lng - lngDelta, $lte: lng + lngDelta };

    const preLimit = Math.min(Math.max(limit * 5, limit), 200);
    const docs: any[] = await this.model
      .find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .limit(preLimit)
      .lean();

    const filtered = docs.filter((d) => {
      const dLat = Number(d?.locationLat);
      const dLng = Number(d?.locationLng);
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return false;
      return haversineKm(lat, lng, dLat, dLng) <= radiusKm;
    });

    return filtered.slice(0, limit);
  }

  async expireDue(): Promise<number> {
    const now = new Date();
    const res: any = await this.model.updateMany(
      { status: 'published', expiresAt: { $ne: null, $lte: now } },
      { $set: { status: 'expired', isActive: false } },
    );
    return Number(res?.modifiedCount ?? res?.nModified ?? 0);
  }

  // =================== Reviews ===================

  private _recalcRating(reviews: Array<{ rating: number }>) {
    const count = reviews.length;
    if (count === 0) return { ratingAvg: 0, ratingCount: 0 };
    const sum = reviews.reduce((acc, r) => acc + (r.rating ?? 0), 0);
    const avg = Math.round((sum / count) * 10) / 10; // 1 decimal
    return { ratingAvg: avg, ratingCount: count };
  }

  async upsertReview(myUserId: string, listingId: string, rating: number, text?: string) {
    const now = new Date();
    const doc: any = await this.model
      .findOne({
        _id: listingId,
        status: 'published',
        isActive: true,
        isSold: { $ne: true },
        isHidden: { $ne: true },
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      })
      .exec();
    if (!doc) throw new NotFoundException('Listing not found');

    if (doc.userId?.toString() === myUserId?.toString()) {
      throw new BadRequestException('You cannot review your own listing');
    }

    const ratingNum = Math.max(1, Math.min(5, Math.round(Number(rating) || 1)));
    const reviewText = (text ?? '').toString().trim().slice(0, 2000) || null;

    const reviews: any[] = Array.isArray(doc.reviews) ? [...doc.reviews] : [];
    const existingIdx = reviews.findIndex((r) => r.userId?.toString() === myUserId?.toString());

    if (existingIdx >= 0) {
      // Update existing review
      reviews[existingIdx] = {
        ...reviews[existingIdx],
        rating: ratingNum,
        text: reviewText,
        updatedAt: now,
      };
    } else {
      // Add new review
      reviews.push({
        userId: myUserId,
        rating: ratingNum,
        text: reviewText,
        createdAt: now,
        updatedAt: now,
      });
    }

    const { ratingAvg, ratingCount } = this._recalcRating(reviews);

    const updated: any = await this.model
      .findByIdAndUpdate(
        listingId,
        { reviews, ratingAvg, ratingCount } as any,
        { new: true },
      )
      .lean();

    return {
      ratingAvg: updated?.ratingAvg ?? ratingAvg,
      ratingCount: updated?.ratingCount ?? ratingCount,
      myReview: reviews.find((r) => r.userId?.toString() === myUserId?.toString()) ?? null,
    };
  }

  async deleteReview(myUserId: string, listingId: string) {
    const doc: any = await this.model.findById(listingId).exec();
    if (!doc) throw new NotFoundException('Listing not found');

    const reviews: any[] = Array.isArray(doc.reviews) ? [...doc.reviews] : [];
    const existingIdx = reviews.findIndex((r) => r.userId?.toString() === myUserId?.toString());

    if (existingIdx < 0) {
      throw new NotFoundException('Review not found');
    }

    reviews.splice(existingIdx, 1);
    const { ratingAvg, ratingCount } = this._recalcRating(reviews);

    const updated: any = await this.model
      .findByIdAndUpdate(
        listingId,
        { reviews, ratingAvg, ratingCount } as any,
        { new: true },
      )
      .lean();

    return {
      deleted: true,
      ratingAvg: updated?.ratingAvg ?? ratingAvg,
      ratingCount: updated?.ratingCount ?? ratingCount,
    };
  }

  async getReviewsWithUsers(listingId: string) {
    const doc: any = await this.model.findById(listingId).select({ reviews: 1, ratingAvg: 1, ratingCount: 1 }).lean();
    if (!doc) throw new NotFoundException('Listing not found');

    const reviews: any[] = Array.isArray(doc.reviews) ? doc.reviews : [];
    const userIds = reviews.map((r) => r.userId).filter(Boolean);

    // Fetch user info for all reviewers
    const users = userIds.length > 0 ? await this.userService.findByIds(userIds, 'fullName userImage') : [];
    const userMap = new Map<string, any>();
    for (const u of users) {
      userMap.set(u._id?.toString(), { fullName: u.fullName, userImage: u.userImage });
    }

    const enrichedReviews = reviews.map((r) => {
      const userInfo = userMap.get(r.userId?.toString()) || { fullName: 'Unknown', userImage: '/v-public/default_user_image.png' };
      return {
        ...r,
        user: userInfo,
      };
    });

    // Sort by createdAt descending (newest first)
    enrichedReviews.sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });

    return {
      reviews: enrichedReviews,
      ratingAvg: doc.ratingAvg ?? 0,
      ratingCount: doc.ratingCount ?? 0,
    };
  }

  // =================== Promotion ===================

  async promoteListing(
    userId: string,
    listingId: string,
    plan: 'weekly' | 'monthly',
    paidAmount: number,
  ) {
    const doc: any = await this.model.findById(listingId).lean();
    if (!doc) throw new NotFoundException('Listing not found');
    if (doc.userId?.toString() !== userId?.toString()) {
      throw new BadRequestException('You can only promote your own listings');
    }
    if (doc.status !== 'published') {
      throw new BadRequestException('Only published listings can be promoted');
    }

    const now = new Date();
    const daysToAdd = plan === 'weekly' ? 7 : 30;
    const expiresAt = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    const updated = await this.model
      .findByIdAndUpdate(
        listingId,
        {
          isPromoted: true,
          promotedAt: now,
          promotionExpiresAt: expiresAt,
          promotionPlan: plan,
          promotionPaidAmount: paidAmount,
        },
        { new: true },
      )
      .lean();

    return updated;
  }

  async getFeaturedListings(limit = 20) {
    const now = new Date();
    const docs = await this.model
      .find({
        status: 'published',
        isActive: true,
        isHidden: { $ne: true },
        isSold: { $ne: true },
        isPromoted: true,
        promotionExpiresAt: { $gt: now },
      })
      .sort({ promotedAt: -1 })
      .limit(limit)
      .lean();
    return docs;
  }

  async getMyPromotedListings(userId: string) {
    const docs = await this.model
      .find({
        userId,
        isPromoted: true,
      })
      .sort({ promotedAt: -1 })
      .lean();
    return docs;
  }

  async expirePromotions() {
    const now = new Date();
    const result = await this.model.updateMany(
      {
        isPromoted: true,
        promotionExpiresAt: { $lte: now },
      },
      {
        isPromoted: false,
        promotionPlan: null,
      },
    );
    return result.modifiedCount || 0;
  }

  async removePromotion(listingId: string) {
    const updated = await this.model
      .findByIdAndUpdate(
        listingId,
        {
          isPromoted: false,
          promotionPlan: null,
          promotionExpiresAt: null,
        },
        { new: true },
      )
      .lean();
    return updated;
  }

  async getAllPromotedListings(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [docs, total] = await Promise.all([
      this.model
        .find({ isPromoted: true })
        .sort({ promotedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.model.countDocuments({ isPromoted: true }),
    ]);

    return {
      docs,
      totalDocs: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNextPage: skip + docs.length < total,
      hasPrevPage: page > 1,
    };
  }

  async getPublishedListingsForPromotion() {
    const docs = await this.model
      .find({ status: 'published', isPromoted: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return docs;
  }
}
