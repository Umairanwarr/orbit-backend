require('dotenv').config({ path: '.env.development' });
const { MongoClient } = require('mongodb');

async function fixRoomMemberProfileImages() {
  const client = new MongoClient(process.env.DB_URL);
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    const roomMembersCollection = db.collection('room_members');
    
    // Find room members with profile image URLs that need fixing
    const roomMembersWithImages = await roomMembersCollection.find({
      img: { $exists: true, $ne: null },
      $and: [
        { img: { $not: /^\/v-public\// } }, // Not starting with /v-public/
        { img: { $not: /^http/ } }, // Not external URLs
        { img: { $ne: '' } } // Not empty string
      ]
    }).toArray();
    
    console.log(`Found ${roomMembersWithImages.length} room members with profile images that need fixing`);
    
    if (roomMembersWithImages.length === 0) {
      console.log('No room member profile images need fixing');
      return;
    }
    
    // Log some examples before fixing
    console.log('\nExamples of room member images that will be fixed:');
    roomMembersWithImages.slice(0, 5).forEach((member, index) => {
      console.log(`${index + 1}. Room ${member.rId} - User ${member.uId}: "${member.img}" -> "/v-public/${member.img}"`);
    });
    
    // Update each room member's profile image URL
    let updatedCount = 0;
    for (const member of roomMembersWithImages) {
      const newImageUrl = member.img.startsWith('/') ? `/v-public${member.img}` : `/v-public/${member.img}`;
      
      await roomMembersCollection.updateOne(
        { _id: member._id },
        { $set: { img: newImageUrl } }
      );
      updatedCount++;
    }
    
    console.log(`\nSuccessfully updated ${updatedCount} room member profile image URLs`);
    
    // Verify the fix
    const remainingProblematicMembers = await roomMembersCollection.find({
      img: { $exists: true, $ne: null },
      $and: [
        { img: { $not: /^\/v-public\// } },
        { img: { $not: /^http/ } },
        { img: { $ne: '' } }
      ]
    }).toArray();
    
    console.log(`Remaining room members with problematic image URLs: ${remainingProblematicMembers.length}`);
    
    if (remainingProblematicMembers.length > 0) {
      console.log('Examples of remaining problematic URLs:');
      remainingProblematicMembers.slice(0, 3).forEach((member, index) => {
        console.log(`${index + 1}. ${member.img}`);
      });
    }
    
  } catch (error) {
    console.error('Error fixing room member profile images:', error);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run the migration
fixRoomMemberProfileImages().catch(console.error);
