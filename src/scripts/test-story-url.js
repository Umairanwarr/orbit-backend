const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Connect to MongoDB
mongoose.connect('mongodb://AdminCherry:HOM@21939330@localhost:27017/orbit');

const storySchema = new mongoose.Schema({}, {strict: false});
const Story = mongoose.model('Story', storySchema, 'stories');

async function testStoryUrls() {
    try {
        console.log('Testing story URLs vs actual file locations...');
        
        // Find recent stories with media
        const stories = await Story.find({
            'att.url': { $exists: true, $ne: null }
        }).select('att userId createdAt').sort({ createdAt: -1 }).limit(3);
        
        for (const story of stories) {
            console.log('\n=== STORY TEST ===');
            console.log('Story ID:', story._id);
            console.log('User ID:', story.userId);
            console.log('Story URL in DB:', story.att.url);
            
            // Check if file exists at the story URL path
            const storyUrl = story.att.url;
            let filePath;
            
            if (storyUrl.startsWith('/media/')) {
                filePath = path.join('/var/www/backend/public', storyUrl);
            } else {
                filePath = path.join('/var/www/backend/public/media', storyUrl);
            }
            
            console.log('Expected file path:', filePath);
            console.log('File exists:', fs.existsSync(filePath));
            
            // Also check in the userId subdirectory structure
            const userDirPath = path.join('/var/www/backend/public/media', story.userId.toString());
            if (fs.existsSync(userDirPath)) {
                const files = fs.readdirSync(userDirPath);
                const mediaFiles = files.filter(f => f.startsWith('media600-'));
                console.log('Files in user directory:', mediaFiles.length, mediaFiles.slice(0, 2));
            }
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

testStoryUrls();
