import { IsNotEmpty, IsString, Length, Matches } from "class-validator";

export class TwoFactorCodeDto {
  @IsNotEmpty()
  @IsString()
  @Length(6, 8)
  @Matches(/^[0-9]+$/)
  code: string;
}
