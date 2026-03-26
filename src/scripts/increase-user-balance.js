/**
 * Script to increase user balance in Orbit backend
 * Works for both development and production environments
 * 
 * Usage:
 * node increase-user-balance.js <email_or_userId> <amount> [environment]
 * 
 * Examples:
 * node increase-user-balance.js user@example.com 100
 * node increase-user-balance.js 507f1f77bcf86cd799439011 50 production
 * node increase-user-balance.js user@example.com 25 development
 */

const mongoose = require('mongoose');
const path = require('path');
const root = require('app-root-path');

// Get command line arguments
const args = process.argv.slice(2);
const userIdentifier = args[0]; // email or userId
const amount = parseFloat(args[1]);
const environment = args[2] || 'auto'; // auto, development, or production

if (!userIdentifier || isNaN(amount)) {
  console.error('Usage: node increase-user-balance.js <email_or_userId> <amount> [environment]');
  console.error('Examples:');
  console.error('  node increase-user-balance.js user@example.com 100');
  console.error('  node increase-user-balance.js 507f1f77bcf86cd799439011 50 production');
  process.exit(1);
}

// Load environment variables based on environment
function loadEnvironment() {
  let envFile;
  
  if (environment === 'production') {
    envFile = '.env.production';
  } else if (environment === 'development') {
    envFile = '.env.development';
  } else {
    // Auto-detect: try production first, then development
    const fs = require('fs');
    const prodPath = path.join(root.path, '.env.production');
    const devPath = path.join(root.path, '.env.development');
    
    if (fs.existsSync(prodPath)) {
      envFile = '.env.production';
      console.log('Auto-detected production environment');
    } else if (fs.existsSync(devPath)) {
      envFile = '.env.development';
      console.log('Auto-detected development environment');
    } else {
      console.error('No environment file found. Please ensure .env.production or .env.development exists.');
      process.exit(1);
    }
  }
  
  console.log(`Loading environment from: ${envFile}`);
  require('dotenv').config({ path: path.join(root.path, envFile) });
}

async function connectDB() {
  try {
    let dbUrl = process.env.DB_URL || process.env.DB_URI || process.env.MONGODB_URI;
    if (!dbUrl) {
      throw new Error('Database connection string not found. Please set DB_URL, DB_URI, or MONGODB_URI environment variable.');
    }
    // When running on server, replace localhost with 127.0.0.1 for IPv4 connection
    if (dbUrl.includes('localhost')) {
      dbUrl = dbUrl.replace(/localhost/g, '127.0.0.1');
      console.log('Normalized DB host to 127.0.0.1 for local server connection.');
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

// User schema definition (minimal for this script)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  balance: { type: Number, default: 0 },
  // ... other fields not needed for this script
}, {
  timestamps: true,
  collection: 'users'
});

async function findUser(identifier) {
  const User = mongoose.model('User', UserSchema);
  
  // Check if identifier is a valid ObjectId
  const isObjectId = mongoose.Types.ObjectId.isValid(identifier);
  
  let user;
  if (isObjectId) {
    // Search by _id
    user = await User.findById(identifier);
  } else {
    // Search by email
    user = await User.findOne({ email: identifier });
  }
  
  return user;
}

async function increaseUserBalance(userIdentifier, amount) {
  try {
    console.log(`\n=== Increasing User Balance ===`);
    console.log(`User: ${userIdentifier}`);
    console.log(`Amount: ${amount}`);
    console.log(`Environment: ${environment}`);
    console.log(`================================\n`);
    
    // Find the user
    const user = await findUser(userIdentifier);
    if (!user) {
      throw new Error(`User not found with identifier: ${userIdentifier}`);
    }
    
    console.log(`Found user: ${user.fullName} (${user.email})`);
    console.log(`Current balance: ${user.balance}`);
    
    // Update the balance
    const User = mongoose.model('User', UserSchema);
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $inc: { balance: amount } },
      { new: true }
    );
    
    console.log(`New balance: ${updatedUser.balance}`);
    console.log(`Balance increased by: ${amount}`);
    console.log(`\n✅ Balance update successful!`);
    
    return updatedUser;
    
  } catch (error) {
    console.error('Error increasing user balance:', error);
    throw error;
  }
}

async function main() {
  try {
    loadEnvironment();
    await connectDB();
    await increaseUserBalance(userIdentifier, amount);
    
    console.log('\n🎉 Script completed successfully!');
  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { increaseUserBalance };
