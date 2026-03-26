/**
 * Create Community DTO
 */
import { Allow, IsNotEmpty } from 'class-validator';
import CommonDto from '../../../core/common/dto/common.dto';

export class CreateCommunityDto extends CommonDto {
  @IsNotEmpty()
  name: string;

  @Allow()
  desc?: string;

  @Allow()
  extraData?: any;

  imageBuffer?: Buffer;

  imgUrl: string;
}
