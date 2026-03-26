const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect('mongodb://AdminCherry:HOM@21939330@localhost:27017/orbit');

const storySchema = new mongoose.Schema({}, {strict: false});
const Story = mongoose.model('Story', storySchema, 'stories');

async function checkStoryData() {
    try {
        console.log('Checking story data structure...');
        
        // Find a recent story with attachment
        const story = await Story.findOne({
            att: { $exists: true, $ne: null }
        }).select('att userId createdAt').sort({ createdAt: -1 });
        
        if (story) {
            console.log('\n=== STORY DATA ===');
            console.log('Story ID:', story._id);
            console.log('User ID:', story.userId);
            console.log('Created At:', story.createdAt);
            console.log('Attachment:', JSON.stringify(story.att, null, 2));
            
            if (story.att && story.att.url) {
                console.log('\n=== URL ANALYSIS ===');
                console.log('Original URL:', story.att.url);
                console.log('Starts with http:', story.att.url.startsWith('http'));
                console.log('Starts with /:', story.att.url.startsWith('/'));
                console.log('Contains userId:', story.att.url.includes(story.userId));
            }
        } else {
            console.log('No stories with attachments found');
        }
        
        // Check total story count
        const totalStories = await Story.countDocuments();
        console.log('\nTotal stories in database:', totalStories);
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkStoryData();
