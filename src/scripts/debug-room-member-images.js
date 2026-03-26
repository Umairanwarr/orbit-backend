/**
 * Debug script to check room member profile image data
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

async function debugRoomMemberImages() {
  try {
    // Check room members with various image patterns
    console.log('=== ROOM MEMBERS DEBUG ===');
    
    // Find room members with different image types
    const allMembers = await mongoose.connection.db.collection('room_members').find({}).toArray();
    console.log(`Total room members: ${allMembers.length}`);
    
    // Group by image type
    const imageStats = {};
    allMembers.forEach(member => {
      const img = member.img || 'null';
      imageStats[img] = (imageStats[img] || 0) + 1;
    });
    
    console.log('\nImage distribution:');
    Object.entries(imageStats).forEach(([img, count]) => {
      console.log(`  ${img}: ${count} members`);
    });
    
    // Check specific room members that might be problematic
    const problematicMembers = await mongoose.connection.db.collection('room_members').find({
      $or: [
        { img: { $exists: false } },
        { img: null },
        { img: '' },
        { img: { $regex: /^(?!\/v-public\/|\/media\/|https?:\/\/).*/ } }
      ]
    }).toArray();
    
    console.log(`\nProblematic members: ${problematicMembers.length}`);
    problematicMembers.slice(0, 5).forEach((member, idx) => {
      console.log(`  ${idx + 1}. Room: ${member.roomId}, User: ${member.userId}, Image: ${member.img}`);
    });
    
    // Check users collection for comparison
    const users = await mongoose.connection.db.collection('users').find({}).limit(10).toArray();
    console.log('\n=== USER PROFILES (sample) ===');
    users.forEach((user, idx) => {
      console.log(`  ${idx + 1}. User: ${user._id}, Image: ${user.userImage}, Name: ${user.fullName}`);
    });
    
    // Check rooms collection
    const rooms = await mongoose.connection.db.collection('rooms').find({}).limit(5).toArray();
    console.log('\n=== ROOMS (sample) ===');
    rooms.forEach((room, idx) => {
      console.log(`  ${idx + 1}. Room: ${room._id}, Type: ${room.roomType}, Members: ${room.membersIds?.length || 0}`);
    });
    
  } catch (error) {
    console.error('Error debugging room member images:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectDB();
    await debugRoomMemberImages();
  } catch (error) {
    console.error('Debug failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

if (require.main === module) {
  main();
}
