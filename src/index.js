const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    Collection,
    REST,
    Routes
} = require('discord.js');

require('dotenv').config();

// ============================================================
// IMPORT SERVICES
// ============================================================

const DatabaseManager = require('./database/DatabaseManager');
const RobloxService = require('./services/RobloxService');
const RankSyncService = require('./services/RankSyncService');
const BackgroundSyncScheduler = require('./services/BackgroundSyncScheduler');
const ConfigManager = require('./config/ConfigManager');
const ApplicationManager = require('./services/ApplicationManager');
const AgeVerificationServer = require('./services/AgeVerificationServer');
const FacilityStateService = require('./services/FacilityStateService');
const FacilityStatusPublisher = require('./services/FacilityStatusPublisher');
const SessionAnnouncementService = require('./services/SessionAnnouncementService');
const QuotaNotificationService = require('./services/QuotaNotificationService');
const PortalIdentityService = require('./services/PortalIdentityService');

// ============================================================
// AGE ROLE CONFIGURATION
// ============================================================

const AGE_VERIFIED_ROLE_NAME = '18+ Verified';
const UNVERIFIED_ROLE_NAME = '18+ Unverified';

// Check all existing members every 5 minutes.
const AGE_ROLE_CHECK_INTERVAL = 5 * 60 * 1000;

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN is not set in .env file');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('❌ CLIENT_ID is not set in .env file');
    process.exit(1);
}

// ============================================================
// AUTO-DEPLOY COMMANDS
// ============================================================

async function deployCommands() {
    try {
        console.log('🔄 Auto-deploying slash commands...');

        const commands = [];

        const commandsPath = path.join(
            __dirname,
            'commands'
        );

        const commandFiles = fs
            .readdirSync(commandsPath)
            .filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const filePath = path.join(
                commandsPath,
                file
            );

            const command = require(filePath);

            if (
                'data' in command &&
                'execute' in command
            ) {
                commands.push(
                    command.data.toJSON()
                );
            }
        }

        const rest = new REST()
            .setToken(process.env.DISCORD_TOKEN);

        const data = await rest.put(
            Routes.applicationCommands(
                process.env.CLIENT_ID
            ),
            {
                body: commands
            }
        );

        console.log(
            `✅ Successfully deployed ${data.length} slash commands globally.`
        );

        return true;

    } catch (error) {
        console.error(
            '❌ Error auto-deploying commands:',
            error
        );

        console.log(
            '⚠️ Bot will continue starting, but commands may not be up to date.'
        );

        return false;
    }
}

// ============================================================
// CREATE DISCORD CLIENT
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ============================================================
// AGE ROLE HELPERS
// ============================================================

/**
 * Finds a role by name, case-insensitively.
 */
function findRole(guild, roleName) {
    return guild.roles.cache.find(
        role =>
            role.name.toLowerCase() ===
            roleName.toLowerCase()
    );
}

/**
 * Checks one member's 18+ status and makes their roles
 * match the database.
 *
 * RULE:
 *
 * Age verified:
 *   -> 18+ Verified
 *   -> remove 18+ Unverified
 *
 * Not age verified:
 *   -> remove 18+ Verified
 *   -> 18+ Unverified
 */
async function enforceAgeRoles(
    member,
    database,
    reason = 'Automatic 18+ role verification'
) {
    if (!member || !member.guild) {
        return;
    }

    const guild = member.guild;

    try {
        const botMember = guild.members.me;

        if (!botMember) {
            return;
        }

        if (
            !botMember.permissions.has('ManageRoles')
        ) {
            console.warn(
                `[AgeRole] Missing Manage Roles permission in ${guild.name}`
            );
            return;
        }

        const verifiedRole = findRole(
            guild,
            AGE_VERIFIED_ROLE_NAME
        );

        const unverifiedRole = findRole(
            guild,
            UNVERIFIED_ROLE_NAME
        );

        if (!verifiedRole) {
            console.warn(
                `[AgeRole] "${AGE_VERIFIED_ROLE_NAME}" does not exist in ${guild.name}`
            );
        }

        if (!unverifiedRole) {
            console.warn(
                `[AgeRole] "${UNVERIFIED_ROLE_NAME}" does not exist in ${guild.name}`
            );
        }

        // ========================================================
        // CHECK DATABASE
        // ========================================================

        let isAgeVerified = false;

        try {
            isAgeVerified =
                database.isAgeVerified(
                    member.id
                ) === true;
        } catch (error) {
            console.error(
                `[AgeRole] Failed to check age verification for ${member.user.tag}:`,
                error.message
            );

            // Fail closed.
            //
            // If the database check fails, DO NOT allow
            // 18+ Verified to remain on the user.
            isAgeVerified = false;
        }

        // ========================================================
        // AGE VERIFIED
        // ========================================================

        if (isAgeVerified) {

            // Remove Unverified first.
            if (
                unverifiedRole &&
                member.roles.cache.has(
                    unverifiedRole.id
                )
            ) {
                if (
                    botMember.roles.highest.position >
                    unverifiedRole.position
                ) {
                    await member.roles.remove(
                        unverifiedRole,
                        reason
                    );

                    console.log(
                        `[AgeRole] Removed "${UNVERIFIED_ROLE_NAME}" from ${member.user.tag} in ${guild.name}`
                    );
                }
            }

            // Give Verified.
            if (
                verifiedRole &&
                !member.roles.cache.has(
                    verifiedRole.id
                )
            ) {
                if (
                    botMember.roles.highest.position >
                    verifiedRole.position
                ) {
                    await member.roles.add(
                        verifiedRole,
                        reason
                    );

                    console.log(
                        `[AgeRole] Granted "${AGE_VERIFIED_ROLE_NAME}" to ${member.user.tag} in ${guild.name}`
                    );
                } else {
                    console.warn(
                        `[AgeRole] Bot cannot manage "${AGE_VERIFIED_ROLE_NAME}" in ${guild.name} because its role is too high.`
                    );
                }
            }

            return;
        }

        // ========================================================
        // NOT AGE VERIFIED
        // ========================================================

        // IMPORTANT:
        //
        // Being normally verified with Roblox/Discord does NOT
        // make somebody 18+ verified.
        //
        // They must have a separate age verification record.

        // Remove 18+ Verified if they have it.
        if (
            verifiedRole &&
            member.roles.cache.has(
                verifiedRole.id
            )
        ) {
            if (
                botMember.roles.highest.position >
                verifiedRole.position
            ) {
                await member.roles.remove(
                    verifiedRole,
                    'User is not recorded as 18+ verified'
                );

                console.log(
                    `[AgeRole] Removed unauthorized "${AGE_VERIFIED_ROLE_NAME}" from ${member.user.tag} in ${guild.name}`
                );
            } else {
                console.warn(
                    `[AgeRole] Bot cannot remove "${AGE_VERIFIED_ROLE_NAME}" in ${guild.name} because its role is too high.`
                );
            }
        }

        // Give 18+ Unverified if they don't already have it.
        if (
            unverifiedRole &&
            !member.roles.cache.has(
                unverifiedRole.id
            )
        ) {
            if (
                botMember.roles.highest.position >
                unverifiedRole.position
            ) {
                await member.roles.add(
                    unverifiedRole,
                    'User has not completed 18+ verification'
                );

                console.log(
                    `[AgeRole] Granted "${UNVERIFIED_ROLE_NAME}" to ${member.user.tag} in ${guild.name}`
                );
            } else {
                console.warn(
                    `[AgeRole] Bot cannot manage "${UNVERIFIED_ROLE_NAME}" in ${guild.name} because its role is too high.`
                );
            }
        }
    } catch (error) {
        console.error(
            `[AgeRole] Error enforcing roles for ${member.user.tag} in ${guild.name}:`,
            error
        );
    }
}

// ============================================================
// CHECK ONE GUILD
// ============================================================

async function checkGuildAgeRoles(
    guild,
    database
) {
    try {
        console.log(
            `[AgeRole] Checking members in ${guild.name}...`
        );

        // Fetch members so that this also works for members
        // who aren't currently cached.
        await guild.members.fetch();

        let checked = 0;

        for (
            const member of guild.members.cache.values()
        ) {
            // Don't process the bot itself.
            if (member.user.bot) {
                continue;
            }

            await enforceAgeRoles(
                member,
                database,
                'Automatic 18+ role audit'
            );

            checked++;
        }

        console.log(
            `[AgeRole] Finished checking ${checked} members in ${guild.name}`
        );

    } catch (error) {
        console.error(
            `[AgeRole] Failed to check guild ${guild.name}:`,
            error
        );
    }
}

// ============================================================
// CHECK ALL GUILDS
// ============================================================

async function checkAllGuildsAgeRoles(
    database
) {
    console.log(
        '[AgeRole] Starting global 18+ role audit...'
    );

    for (
        const guild of client.guilds.cache.values()
    ) {
        await checkGuildAgeRoles(
            guild,
            database
        );
    }

    console.log(
        '[AgeRole] Global 18+ role audit complete.'
    );
}

// ============================================================
// INITIALIZE SERVICES
// ============================================================

console.log('🔧 Initializing services...');

const dbPath =
    process.env.DATABASE_PATH ||
    './data/bot.db';

const database =
    new DatabaseManager(dbPath);

// ============================================================
// WAIT FOR DATABASE
// ============================================================

(async () => {

    await database.waitForReady();

    console.log(
        '✅ Database is ready'
    );

    // ========================================================
    // DEPLOY COMMANDS
    // ========================================================

    await deployCommands();

    // ========================================================
    // CREATE SERVICES
    // ========================================================

    const robloxService =
        new RobloxService();

    const configManager =
        new ConfigManager();

    const applicationManager =
        new ApplicationManager();

    const rankSyncService =
        new RankSyncService(
            database,
            robloxService,
            configManager
        );

    const backgroundSync =
        new BackgroundSyncScheduler(
            client,
            rankSyncService,
            configManager
        );

    const ageVerificationServer =
        new AgeVerificationServer(
            client,
            database
        );

    const facilityState =
        new FacilityStateService();

    const facilityStatus =
        new FacilityStatusPublisher(
            client,
            facilityState,
            configManager
        );

    const sessionAnnouncements =
        new SessionAnnouncementService(
            client,
            configManager,
            facilityStatus,
            { database }
        );

    const quotaNotifications =
        new QuotaNotificationService(client);

    const portalIdentities = new PortalIdentityService(
        database,
        client,
        rankSyncService,
        configManager
    );

    // ========================================================
    // STORE SERVICES
    // ========================================================

    const services = {
        database,
        robloxService,
        configManager,
        applicationManager,
        rankSyncService,
        backgroundSync,
        ageVerificationServer,
        facilityState,
        facilityStatus,
        sessionAnnouncements,
        quotaNotifications,
        portalIdentities
    };

    // ========================================================
    // LOAD COMMANDS
    // ========================================================

    client.commands =
        new Collection();

    const commandsPath =
        path.join(
            __dirname,
            'commands'
        );

    const commandFiles =
        fs
            .readdirSync(commandsPath)
            .filter(
                file =>
                    file.endsWith('.js')
            );

    for (
        const file of commandFiles
    ) {
        const filePath =
            path.join(
                commandsPath,
                file
            );

        const command =
            require(filePath);

        if (
            'data' in command &&
            'execute' in command
        ) {
            client.commands.set(
                command.data.name,
                command
            );

            console.log(
                `✓ Loaded command: ${command.data.name}`
            );
        } else {
            console.log(
                `⚠ Warning: Command at ${filePath} is missing "data" or "execute" property.`
            );
        }
    }

    // ========================================================
    // LOAD EVENTS
    // ========================================================

    const eventsPath =
        path.join(
            __dirname,
            'events'
        );

    const eventFiles =
        fs
            .readdirSync(eventsPath)
            .filter(
                file =>
                    file.endsWith('.js')
            );

    for (
        const file of eventFiles
    ) {
        const filePath =
            path.join(
                eventsPath,
                file
            );

        const event =
            require(filePath);

        if (event.once) {
            client.once(
                event.name,
                (...args) =>
                    event.execute(
                        ...args,
                        services
                    )
            );
        } else {
            client.on(
                event.name,
                (...args) =>
                    event.execute(
                        ...args,
                        services
                    )
            );
        }

        console.log(
            `✓ Loaded event: ${event.name}`
        );
    }

    // ========================================================
    // NEW MEMBER AGE ROLE CHECK
    // ========================================================

    client.on(
        'guildMemberAdd',
        async member => {
            try {
                if (member.user.bot) {
                    return;
                }

                console.log(
                    `[AgeRole] New member joined ${member.guild.name}: ${member.user.tag}`
                );

                // Give 18+ Unverified unless the database
                // already confirms genuine age verification.
                await enforceAgeRoles(
                    member,
                    database,
                    'Automatic role assignment on server join'
                );

            } catch (error) {
                console.error(
                    '[AgeRole] Error handling new member:',
                    error
                );
            }
        }
    );

    // ========================================================
    // START PERIODIC AGE ROLE AUDIT
    // ========================================================

    const ageRoleInterval =
        setInterval(
            async () => {
                try {
                    await checkAllGuildsAgeRoles(
                        database
                    );
                } catch (error) {
                    console.error(
                        '[AgeRole] Periodic audit failed:',
                        error
                    );
                }
            },
            AGE_ROLE_CHECK_INTERVAL
        );

    // ========================================================
    // ERROR HANDLING
    // ========================================================

    process.on(
        'unhandledRejection',
        error => {
            console.error(
                'Unhandled promise rejection:',
                error
            );
        }
    );

    process.on(
        'uncaughtException',
        error => {
            console.error(
                'Uncaught exception:',
                error
            );
        }
    );

    // ========================================================
    // GRACEFUL SHUTDOWN
    // ========================================================

    process.on(
        'SIGINT',
        () => {
            console.log(
                '\n\n🛑 Shutting down gracefully...'
            );

            clearInterval(
                ageRoleInterval
            );

            if (backgroundSync) {
                backgroundSync.stop();
            }

            if (facilityStatus) {
                facilityStatus.stop();
            }

            if (sessionAnnouncements) {
                sessionAnnouncements.stopCleanup();
            }

            if (quotaNotifications) {
                quotaNotifications.stop();
            }
            if (portalIdentities) {
                portalIdentities.stop();
            }

            if (database) {
                database.close();
            }

            if (ageVerificationServer) {
                ageVerificationServer.stop();
            }

            console.log(
                '✅ Shutdown complete'
            );

            process.exit(0);
        }
    );

    // ========================================================
    // LOGIN
    // ========================================================

    console.log(
        '🚀 Starting bot...\n'
    );

    try {
        await client.login(
            process.env.DISCORD_TOKEN
        );

        // ====================================================
        // START AGE VERIFICATION WEBHOOK
        // ====================================================

        ageVerificationServer.start();

        // ====================================================
        // INITIAL AGE ROLE AUDIT
        // ====================================================

        // Wait briefly for Discord's guild/member caches
        // to settle after login.
        setTimeout(
            async () => {
                try {
                    await checkAllGuildsAgeRoles(
                        database
                    );
                } catch (error) {
                    console.error(
                        '[AgeRole] Initial age role audit failed:',
                        error
                    );
                }
            },
            5000
        );

    } catch (error) {
        console.error(
            '❌ Failed to login:',
            error
        );
    }

})();
