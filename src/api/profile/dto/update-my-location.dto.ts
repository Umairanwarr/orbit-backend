import { IsNumber, IsObject } from "class-validator";

class LocationUserDto {
  _id: string;
  // Add other user properties as needed
}

export class UpdateMyLocationDto {
  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsObject()
  myUser: LocationUserDto; // Will be set by the controller
}
