// Script to manually add balance and claimedGifts fields to all users
const { MongoClient } = require('mongodb');

async function addBalanceFields() {
    const client = new MongoClient('mongodb://localhost:27017');
    
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        
        const db = client.db('orbit');
        const usersCollection = db.collection('users');
        
        // Update all users to add balance and claimedGifts fields if they don't exist
        const result = await usersCollection.updateMany(
            {
                $or: [
                    { balance: { $exists: false } },
                    { claimedGifts: { $exists: false } }
                ]
            },
            {
                $set: {
                    balance: 0,
                    claimedGifts: []
                }
            }
        );
        
        console.log(`Updated ${result.modifiedCount} users with balance and claimedGifts fields`);
        
        // Verify the update
        const usersWithBalance = await usersCollection.countDocuments({ balance: { $exists: true } });
        const usersWithClaimedGifts = await usersCollection.countDocuments({ claimedGifts: { $exists: true } });
        
        console.log(`Users with balance field: ${usersWithBalance}`);
        console.log(`Users with claimedGifts field: ${usersWithClaimedGifts}`);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
        console.log('Disconnected from MongoDB');
    }
}

addBalanceFields();
