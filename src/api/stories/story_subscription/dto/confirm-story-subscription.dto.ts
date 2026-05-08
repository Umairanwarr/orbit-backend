import { IsNotEmpty, IsString } from "class-validator";

export class ConfirmStorySubscriptionDto {
  @IsNotEmpty()
  @IsString()
  orderTrackingId: string;
}

