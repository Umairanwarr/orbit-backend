/**
 * Fix corrupted userPrivacy data that has nested myUser objects
 * This corrupted data prevents users list from displaying properly
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

async function fixCorruptedUserPrivacy() {
  try {
    // Find users with corrupted userPrivacy (contains nested myUser objects)
    const usersWithCorruptedPrivacy = await mongoose.connection.db.collection('users').find({
      'userPrivacy.myUser': { $exists: true }
    }).toArray();

    console.log(`Found ${usersWithCorruptedPrivacy.length} users with corrupted userPrivacy data`);

    for (const user of usersWithCorruptedPrivacy) {
      console.log(`Fixing user: ${user._id} (${user.fullName})`);
      
      // Clean up the userPrivacy object by removing the nested myUser
      const cleanUserPrivacy = {
        startChat: user.userPrivacy.startChat || 'forReq',
        publicSearch: user.userPrivacy.publicSearch !== undefined ? user.userPrivacy.publicSearch : true,
        showStory: user.userPrivacy.showStory || 'forReq',
        lastSeen: user.userPrivacy.lastSeen !== undefined ? user.userPrivacy.lastSeen : true
      };

      // Update the user with clean userPrivacy
      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $set: { userPrivacy: cleanUserPrivacy } }
      );

      console.log(`✅ Fixed userPrivacy for user: ${user._id}`);
    }

    // Also check for any other malformed data structures
    const usersWithInvalidPrivacy = await mongoose.connection.db.collection('users').find({
      $or: [
        { userPrivacy: { $type: 'string' } }, // userPrivacy should be object, not string
        { userPrivacy: null },
        { userPrivacy: { $exists: false } }
      ]
    }).toArray();

    console.log(`Found ${usersWithInvalidPrivacy.length} users with missing/invalid userPrivacy`);

    for (const user of usersWithInvalidPrivacy) {
      console.log(`Setting default userPrivacy for user: ${user._id} (${user.fullName})`);
      
      const defaultUserPrivacy = {
        startChat: 'forReq',
        publicSearch: true,
        showStory: 'forReq',
        lastSeen: true
      };

      await mongoose.connection.db.collection('users').updateOne(
        { _id: user._id },
        { $set: { userPrivacy: defaultUserPrivacy } }
      );

      console.log(`✅ Set default userPrivacy for user: ${user._id}`);
    }

    return {
      corruptedFixed: usersWithCorruptedPrivacy.length,
      invalidFixed: usersWithInvalidPrivacy.length
    };

  } catch (error) {
    console.error('Error fixing corrupted userPrivacy:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Starting userPrivacy corruption fix...');
    
    await connectDB();
    const result = await fixCorruptedUserPrivacy();
    
    console.log(`✅ Migration completed successfully!`);
    console.log(`- Fixed ${result.corruptedFixed} corrupted userPrivacy objects`);
    console.log(`- Fixed ${result.invalidFixed} missing/invalid userPrivacy objects`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
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

module.exports = { fixCorruptedUserPrivacy };
