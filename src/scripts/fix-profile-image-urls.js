/**
 * Migration script to fix profile image URLs to include proper /v-public/ prefix
 * Run this script to update existing users who have profile images without the prefix
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

async function fixProfileImageUrls() {
  try {
    // Update default user images
    const defaultUserResult = await mongoose.connection.db.collection('users').updateMany(
      { userImage: 'default_user_image.png' },
      { $set: { userImage: '/v-public/default_user_image.png' } }
    );
    console.log(`Updated ${defaultUserResult.modifiedCount} users with default_user_image.png`);

    // Update profile images that start with "pic100-" (cropped profile images)
    const profileImagesResult = await mongoose.connection.db.collection('users').updateMany(
      { 
        userImage: { $regex: /^pic100-.*\.(jpg|jpeg|png)$/i },
        userImage: { $not: { $regex: /^\/v-public\// } }
      },
      [
        {
          $set: {
            userImage: { $concat: ['/v-public/', '$userImage'] }
          }
        }
      ]
    );
    console.log(`Updated ${profileImagesResult.modifiedCount} users with pic100- profile images`);

    // Update any other default images
    const defaultGroupResult = await mongoose.connection.db.collection('groupsettings').updateMany(
      { groupImage: 'default_group_image.png' },
      { $set: { groupImage: '/v-public/default_group_image.png' } }
    );
    console.log(`Updated ${defaultGroupResult.modifiedCount} groups with default_group_image.png`);

    const defaultBroadcastResult = await mongoose.connection.db.collection('broadcastsettings').updateMany(
      { broadcastImage: 'default_broadcast_image.png' },
      { $set: { broadcastImage: '/v-public/default_broadcast_image.png' } }
    );
    console.log(`Updated ${defaultBroadcastResult.modifiedCount} broadcasts with default_broadcast_image.png`);

    // Update app config if needed
    const appConfigResult = await mongoose.connection.db.collection('appconfigs').updateMany(
      {
        $or: [
          { userIcon: 'default_user_image.png' },
          { groupIcon: 'default_group_image.png' },
          { broadcastIcon: 'default_broadcast_image.png' },
          { supportIcon: 'default_support_image.png' }
        ]
      },
      {
        $set: {
          userIcon: '/v-public/default_user_image.png',
          groupIcon: '/v-public/default_group_image.png',
          broadcastIcon: '/v-public/default_broadcast_image.png',
          supportIcon: '/v-public/default_support_image.png'
        }
      }
    );
    console.log(`Updated ${appConfigResult.modifiedCount} app config records`);

  } catch (error) {
    console.error('Error fixing profile image URLs:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting profile image URL migration...');
    
    await connectDB();
    await fixProfileImageUrls();
    
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

module.exports = { fixProfileImageUrls };
