#!/usr/bin/env node

/**
 * cPanel Node.js Startup Script
 * This file is required by cPanel to start the Node.js application
 */

// Set production environment
process.env.NODE_ENV = 'production';

// Load environment variables from .env.production
require('dotenv').config({ path: '.env.production' });

// Start the NestJS application
require('./dist/src/main.js');
