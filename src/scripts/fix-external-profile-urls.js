/**
 * Fix external profile image URLs that were incorrectly prefixed with /v-public/
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
      throw new Error('Database connection string not found.');
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

async function fixExternalUrls() {
  try {
    console.log('Fixing malformed external URLs...');
    
    // Fix users collection - remove /v-public/ prefix from external URLs
    const usersResult = await mongoose.connection.db.collection('users').updateMany(
      { userImage: { $regex: /^\/v-public\/https?:\/\// } },
      [
        {
          $set: {
            userImage: { $replaceOne: { input: '$userImage', find: '/v-public/', replacement: '' } }
          }
        }
      ]
    );
    console.log(`Fixed ${usersResult.modifiedCount} users with malformed external URLs`);
    
    // Fix room_members collection - remove /v-public/ prefix from external URLs
    const roomMembersResult = await mongoose.connection.db.collection('room_members').updateMany(
      { img: { $regex: /^\/v-public\/https?:\/\// } },
      [
        {
          $set: {
            img: { $replaceOne: { input: '$img', find: '/v-public/', replacement: '' } }
          }
        }
      ]
    );
    console.log(`Fixed ${roomMembersResult.modifiedCount} room members with malformed external URLs`);
    
    // Show updated samples
    const sampleUsers = await mongoose.connection.db.collection('users').find({
      userImage: { $regex: /^https?:\/\// }
    }).toArray();
    console.log('\nFixed external URLs in users:');
    sampleUsers.forEach(user => {
      console.log(`  User: ${user.fullName}, Image: ${user.userImage}`);
    });
    
    const sampleRoomMembers = await mongoose.connection.db.collection('room_members').find({
      img: { $regex: /^https?:\/\// }
    }).toArray();
    console.log(`\nFixed external URLs in room members: ${sampleRoomMembers.length} found`);
    sampleRoomMembers.slice(0, 5).forEach(member => {
      console.log(`  Room: ${member.roomId}, Image: ${member.img}`);
    });
    
  } catch (error) {
    console.error('Error fixing external URLs:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectDB();
    await fixExternalUrls();
    console.log('\nMigration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

if (require.main === module) {
  main();
}
