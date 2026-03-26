import { IsNotEmpty, MaxLength } from "class-validator";
import { Trim } from "class-sanitizer";

export class RefreshTokenDto {
  @IsNotEmpty()
  @Trim()
  @MaxLength(2048)
  refreshToken: string;
}
