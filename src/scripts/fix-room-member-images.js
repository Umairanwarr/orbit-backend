/**
 * Migration script to fix room member profile image URLs
 * Run this script to update room_members collection with proper /v-public/ prefix
 */

const mongoose = require('mongoose');
const path = require('path');
const root = require('app-root-path');

// Load environment variables
require('dotenv').config({ path: path.join(root.path, '.env.development') });

async function connectDB() {
  try {
    const dbUrl = process.env.DB_URL || process.env.DB_URI || process.env.MONGODB_URI;
    if (!dbUrl) {
      throw new Error('Database connection string not found. Please set DB_URL, DB_URI, or MONGODB_URI environment variable.');
    }
    console.log('Connecting to database...');
    await mongoose.connect(dbUrl, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

async function fixRoomMemberImages() {
  try {
    console.log('Checking room_members collection...');
    
    // Get sample room members to check current state
    const sampleMembers = await mongoose.connection.db.collection('room_members').find({}).limit(5).toArray();
    console.log('Sample room members:', sampleMembers.map(m => ({ img: m.img, userId: m.userId })));

    // Update default user images in room_members
    const defaultImageResult = await mongoose.connection.db.collection('room_members').updateMany(
      { img: 'default_user_image.png' },
      { $set: { img: '/v-public/default_user_image.png' } }
    );
    console.log(`Updated ${defaultImageResult.modifiedCount} room members with default_user_image.png`);

    // Update profile images that start with "pic100-" but don't have /v-public/ prefix
    const profileImagesResult = await mongoose.connection.db.collection('room_members').updateMany(
      { 
        img: { $regex: /^pic100-.*\.(jpg|jpeg|png)$/i },
        img: { $not: { $regex: /^\/v-public\// } }
      },
      [
        {
          $set: {
            img: { $concat: ['/v-public/', '$img'] }
          }
        }
      ]
    );
    console.log(`Updated ${profileImagesResult.modifiedCount} room members with pic100- profile images`);

    // Update any other image URLs that don't start with /v-public/ or /media/
    const otherImagesResult = await mongoose.connection.db.collection('room_members').updateMany(
      { 
        img: { 
          $exists: true, 
          $ne: null,
          $ne: '',
          $not: { $regex: /^(\/v-public\/|\/media\/|https?:\/\/)/ }
        }
      },
      [
        {
          $set: {
            img: { $concat: ['/v-public/', '$img'] }
          }
        }
      ]
    );
    console.log(`Updated ${otherImagesResult.modifiedCount} room members with other image types`);

    // Get count of all room members for reference
    const totalCount = await mongoose.connection.db.collection('room_members').countDocuments();
    console.log(`Total room members in collection: ${totalCount}`);

    // Show sample of updated room members
    const updatedSample = await mongoose.connection.db.collection('room_members').find({}).limit(5).toArray();
    console.log('Updated sample room members:', updatedSample.map(m => ({ img: m.img, userId: m.userId })));

  } catch (error) {
    console.error('Error fixing room member images:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting room member image URL migration...');
    
    await connectDB();
    await fixRoomMemberImages();
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
if (require.main === module) {
  main();
}

module.exports = { fixRoomMemberImages };
