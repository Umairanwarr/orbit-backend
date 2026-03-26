/**
 * Script to delete all active live streams
 * Run with: node dist/scripts/delete-active-live-streams.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env.production') });
const mongoose = require('mongoose');

const LiveStreamSchema = new mongoose.Schema({
    title: String,
    streamerId: String,
    channelName: String,
    agoraToken: String,
    status: String,
    viewerCount: Number,
    maxViewers: Number,
}, { timestamps: true });

const LiveStream = mongoose.model('LiveStream', LiveStreamSchema, 'livestreams');

async function deleteActiveLiveStreams() {
    try {
        // Manually construct MongoDB URL to handle special characters in password
        // Use 127.0.0.1 instead of localhost to force IPv4
        const dbUrl = 'mongodb://AdminCherry:HOM%4021939330@127.0.0.1:27017/orbit';
        
        console.log('Connecting to MongoDB...');
        await mongoose.connect(dbUrl);
        console.log('Connected successfully');

        // Find all active live streams
        const activeStreams = await LiveStream.find({ status: 'live' });
        console.log(`Found ${activeStreams.length} active live streams`);

        if (activeStreams.length > 0) {
            activeStreams.forEach(stream => {
                console.log(`- Stream ID: ${stream._id}, Title: "${stream.title}", Streamer: ${stream.streamerId}`);
            });

            // Delete all active live streams
            const result = await LiveStream.deleteMany({ status: 'live' });
            console.log(`\n✅ Successfully deleted ${result.deletedCount} active live streams`);
        } else {
            console.log('No active live streams found');
        }

        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

deleteActiveLiveStreams();
