const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
require('dotenv').config();

// Import services
const DatabaseManager = require('./database/DatabaseManager');
const RobloxService = require('./services/RobloxService');
const RankSyncService = require('./services/RankSyncService');
const BackgroundSyncScheduler = require('./services/BackgroundSyncScheduler');
const ConfigManager = require('./config/ConfigManager');

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('❌ CLIENT_ID is not set in .env file');
    process.exit(1);
}

// Create Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ]
});

// Initialize services
console.log('🔧 Initializing services...');

const dbPath = process.env.DATABASE_PATH || './data/bot.db';
const database = new DatabaseManager(dbPath);

// Wait for database to initialize
(async () => {
    await database.initialize();
    
    const robloxService = new RobloxService();
    const configManager = new ConfigManager();
    const rankSyncService = new RankSyncService(database, robloxService, configManager);
    const backgroundSync = new BackgroundSyncScheduler(client, rankSyncService, configManager);

    // Store services for easy access
    const services = {
        database,
        robloxService,
        configManager,
        rankSyncService,
        backgroundSync
    };

    // Load commands
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✓ Loaded command: ${command.data.name}`);
        } else {
            console.log(`⚠ Warning: Command at ${filePath} is missing "data" or "execute" property.`);
        }
    }

    // Load events
    const eventsPath = path.join(__dirname, 'events');
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);
        
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, services));
        } else {
            client.on(event.name, (...args) => event.execute(...args, services));
        }
        
        console.log(`✓ Loaded event: ${event.name}`);
    }

    // Error handling
    process.on('unhandledRejection', error => {
        console.error('Unhandled promise rejection:', error);
    });

    process.on('SIGINT', () => {
        console.log('\n\n🛑 Shutting down gracefully...');
        
        if (backgroundSync) {
            backgroundSync.stop();
        }
        
        if (database) {
            database.close();
        }
        
        console.log('✅ Shutdown complete');
        process.exit(0);
    });

    // Login
    console.log('🚀 Starting bot...\n');
    client.login(process.env.DISCORD_TOKEN);
})();
