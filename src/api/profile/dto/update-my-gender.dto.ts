// src/api/profile/dto/update-my-gender.dto.ts
import { IsEnum } from "class-validator";

export class UpdateMyGenderDto {
  myUser: any; // will be set from req.user in controller

  @IsEnum(["male", "female", "other"], {
    message: "Gender must be either male, female, or other",
  })
  gender: string;
}
