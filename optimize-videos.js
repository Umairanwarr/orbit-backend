const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env.development') });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function extractPublicId(url) {
  try {
    const u = url.startsWith('http') ? new URL(url) : new URL(`https://res.cloudinary.com${url}`);
    const pathname = u.pathname || '';
    const parts = pathname.split('/upload/');
    if (parts.length < 2) return null;
    let tail = parts[1].replace(/^\/+/, '');

    const anchor = (process.env.CLOUDINARY_FOLDER || 'orbit') + '/';
    const anchorIndex = tail.indexOf(anchor);
    if (anchorIndex >= 0) {
      tail = tail.substring(anchorIndex);
    } else {
      const segs = tail.split('/').filter(Boolean);
      const vIndex = segs.findIndex(s => /^v\d+$/.test(s));
      if (vIndex >= 0) {
        tail = segs.slice(vIndex + 1).join('/');
      }
    }

    // Remove any existing transformations in the path
    while (true) {
      const segs = tail.split('/').filter(Boolean);
      if (segs.length === 0) break;
      const first = segs[0];
      const looksLikeTransform = first.includes(',') || /^[a-z]_/.test(first);
      if (!looksLikeTransform) break;
      tail = segs.slice(1).join('/');
    }

    tail = tail.replace(/\.[^./]+$/, '');
    return tail || null;
  } catch (e) {
    return null;
  }
}

async function run() {
  await mongoose.connect(process.env.DB_URL);
  console.log('Connected to DB');

  const Post = mongoose.model('Post', new mongoose.Schema({}, { strict: false }), 'posts');
  
  // Find all posts that are reels or videos
  const posts = await Post.find({
    $or: [{ postType: 'reel' }, { postType: 'video' }, { isReel: true }],
    isActive: true
  });

  console.log(`Found ${posts.length} video posts.`);

  let count = 0;
  for (const post of posts) {
    const urls = [];
    if (post.media && post.media.url) urls.push(post.media.url);
    if (post.mediaUrls && post.mediaUrls.length > 0) urls.push(...post.mediaUrls);

    for (const url of urls) {
      if (url && url.includes('res.cloudinary.com')) {
        const publicId = extractPublicId(url);
        if (publicId) {
          try {
            console.log(`Triggering async eager transform for: ${publicId}`);
            await cloudinary.uploader.explicit(publicId, {
              type: 'upload',
              resource_type: 'video',
              eager: [
                { fetch_format: 'mp4', quality: 'auto' }
              ],
              eager_async: true
            });
            count++;
          } catch (err) {
            console.error(`Failed to trigger for ${publicId}:`, err.message);
          }
        }
      }
    }
  }

  console.log(`Triggered eager transformations for ${count} videos.`);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
