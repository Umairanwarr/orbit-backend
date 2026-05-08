import { IsIn } from "class-validator";
import { StoryType } from "../../../../core/utils/enums";

export class CheckStoryEligibilityDto {
  @IsIn(["text", "image", "video", "voice"])
  storyType: StoryType;
}