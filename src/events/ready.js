const { Events } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client, services) {
        console.log('═══════════════════════════════════════════════');
        console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
        console.log('═══════════════════════════════════════════════');
        
        // Display stats
        const stats = services.database.getStats();
        console.log(`📊 Database Stats:`);
        console.log(`   - Total Verifications: ${stats.totalVerifications}`);
        console.log(`   - Guild Rank Entries: ${stats.totalGuildRankEntries}`);
        
        // Display configured servers
        const serverConfigs = services.configManager.getAllServerConfigs();
        console.log(`\n⚙️  Configured Servers: ${serverConfigs.length}`);
        
        for (const config of serverConfigs) {
            const guild = client.guilds.cache.get(config.guildId);
            const guildName = guild ? guild.name : config.guildName || 'Unknown';
            console.log(`   - ${guildName} (Group ID: ${config.robloxGroupId})`);
        }
        
        // Start background sync
        if (services.backgroundSync) {
            services.backgroundSync.start();
        }
        
        console.log('\n✅ All systems operational!');
        console.log('═══════════════════════════════════════════════\n');

        // Set bot status
        client.user.setActivity('SCP Foundation', { type: 3 }); // 3 = WATCHING
    }
};
