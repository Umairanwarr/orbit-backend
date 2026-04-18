import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { IMusic } from "src/api/music/music.entity";
import { PostDocument } from "src/api/post_module/entity/post.schema";
import { ReelDocument } from "src/api/reel/entity/reel.schema";

@Injectable()
export class AdminModerationService {
  constructor(
    @InjectModel("Post") private readonly postModel: Model<PostDocument>,
    @InjectModel("Reel") private readonly reelModel: Model<ReelDocument>,
    @InjectModel("Music") private readonly musicModel: Model<IMusic>,
  ) {}

  async deletePost(postId: string) {
    const deletedPost = await this.postModel.findByIdAndDelete(postId);
    if (!deletedPost) throw new NotFoundException("Post not found");
    return { message: "Post successfully removed for violating guidelines" };
  }

  async deleteReel(reelId: string) {
    const deletedReel = await this.reelModel.findByIdAndDelete(reelId);
    if (!deletedReel) throw new NotFoundException("Reel not found");

    return { message: "Reel successfully removed for violating guidelines" };
  }

  async deleteMusic(musicId: string) {
    const deletedMusic = await this.musicModel.findByIdAndDelete(musicId);
    if (!deletedMusic) throw new NotFoundException("Music not found");
    return {
      message: "Music track successfully removed for violating guidelines",
    };
  }
}
