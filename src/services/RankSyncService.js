const { PermissionFlagsBits } = require('discord.js');

class RankSyncService {
    constructor(database, robloxService, configManager) {
        this.db = database;
        this.roblox = robloxService;
        this.config = configManager;
    }

    /**
     * Sync a user's rank in a specific guild
     */
    async syncUserInGuild(client, guildId, discordId) {
        try {
            const guild = await client.guilds.fetch(guildId);
            if (!guild) {
                return { success: false, error: 'Guild not found' };
            }

            const serverConfig = this.config.getServerConfig(guildId);
            if (!serverConfig) {
                return { success: false, error: 'Server not configured' };
            }

            const verification = this.db.getVerification(discordId);
            if (!verification) {
                return { success: false, error: 'User not verified' };
            }

            // Get member
            let member;
            try {
                member = await guild.members.fetch(discordId);
            } catch (error) {
                return { success: false, error: 'Member not in server' };
            }

            // Get current Roblox rank
            const rankResult = await this.roblox.getUserRankInGroup(
                verification.roblox_id,
                serverConfig.robloxGroupId
            );

            if (!rankResult.success) {
                return { success: false, error: 'Failed to fetch Roblox rank' };
            }

            const currentRank = rankResult.rank;
            const roleName = rankResult.roleName;

            // Get stored rank
            const storedRank = this.db.getGuildRank(discordId, guildId);
            const previousRank = storedRank ? storedRank.last_known_rank : null;

            // Update stored rank
            this.db.setGuildRank(discordId, guildId, currentRank);

            // Sync roles
            const roleResult = await this.syncRoles(member, serverConfig, currentRank);

            // Sync nickname
            const nicknameResult = await this.syncNickname(
                member,
                serverConfig,
                verification.roblox_username,
                currentRank
            );

            // Log if configured
            if (serverConfig.loggingChannelId && previousRank !== null && previousRank !== currentRank) {
                await this.logRankChange(
                    client,
                    serverConfig,
                    member,
                    verification.roblox_username,
                    previousRank,
                    currentRank,
                    roleName
                );
            }

            return {
                success: true,
                rank: currentRank,
                roleName: roleName,
                rankChanged: previousRank !== currentRank,
                previousRank: previousRank,
                rolesUpdated: roleResult.updated,
                nicknameUpdated: nicknameResult.updated
            };
        } catch (error) {
            console.error('[RankSyncService] Error syncing user:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync Discord roles based on Roblox rank
     */
    async syncRoles(member, serverConfig, rank) {
        try {
            const rankMapping = this.config.getRankMapping(member.guild.id, rank);
            
            if (!rankMapping) {
                return { success: true, updated: false, reason: 'No rank mapping found' };
            }

            const targetRoleName = rankMapping.roleName;
            const allConfiguredRoles = this.config.getAllRoleNames(member.guild.id);

            // Find the target role
            const targetRole = member.guild.roles.cache.find(r => r.name === targetRoleName);
            
            if (!targetRole) {
                console.warn(`[RankSyncService] Role "${targetRoleName}" not found in guild ${member.guild.name}`);
                return { success: false, error: `Role "${targetRoleName}" not found` };
            }

            // Remove all other configured roles
            const rolesToRemove = member.roles.cache.filter(role => 
                allConfiguredRoles.includes(role.name) && role.id !== targetRole.id
            );

            for (const [, role] of rolesToRemove) {
                await member.roles.remove(role);
            }

            // Add target role if not already present
            let updated = false;
            if (!member.roles.cache.has(targetRole.id)) {
                await member.roles.add(targetRole);
                updated = true;
            } else if (rolesToRemove.size > 0) {
                updated = true;
            }

            return { success: true, updated, role: targetRoleName };
        } catch (error) {
            console.error('[RankSyncService] Error syncing roles:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Sync Discord nickname based on server config
     */
    async syncNickname(member, serverConfig, robloxUsername, rank) {
        try {
            // Check if bot has permission
            const botMember = await member.guild.members.fetchMe();
            if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
                return { success: false, error: 'Missing MANAGE_NICKNAMES permission' };
            }

            // Can't change owner's nickname
            if (member.id === member.guild.ownerId) {
                return { success: false, error: 'Cannot change server owner nickname' };
            }

            // Check role hierarchy
            if (member.roles.highest.position >= botMember.roles.highest.position) {
                return { success: false, error: 'User has higher or equal role' };
            }

            const newNickname = this.config.formatNickname(member.guild.id, robloxUsername, rank);
            
            if (member.nickname !== newNickname) {
                await member.setNickname(newNickname);
                return { success: true, updated: true, nickname: newNickname };
            }

            return { success: true, updated: false, nickname: newNickname };
        } catch (error) {
            console.error('[RankSyncService] Error syncing nickname:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Log rank change to configured channel
     */
    async logRankChange(client, serverConfig, member, robloxUsername, previousRank, newRank, newRoleName) {
        try {
            if (!serverConfig.loggingChannelId) return;

            const channel = await client.channels.fetch(serverConfig.loggingChannelId);
            if (!channel || !channel.isTextBased()) return;

            const embed = {
                color: newRank > previousRank ? 0x00ff00 : 0xff9900,
                title: '📊 Rank Changed',
                fields: [
                    {
                        name: 'User',
                        value: `${member.user.tag} (${member.user.id})`,
                        inline: true
                    },
                    {
                        name: 'Roblox Username',
                        value: robloxUsername,
                        inline: true
                    },
                    {
                        name: 'Previous Rank',
                        value: previousRank.toString(),
                        inline: true
                    },
                    {
                        name: 'New Rank',
                        value: `${newRank} - ${newRoleName}`,
                        inline: true
                    }
                ],
                timestamp: new Date().toISOString()
            };

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('[RankSyncService] Error logging rank change:', error);
        }
    }

    /**
     * Sync all verified users in a guild (for background sync)
     */
    async syncAllInGuild(client, guildId) {
        try {
            const serverConfig = this.config.getServerConfig(guildId);
            if (!serverConfig) {
                return { success: false, error: 'Server not configured' };
            }

            if (!serverConfig.syncSettings.backgroundSyncEnabled) {
                return { success: false, error: 'Background sync disabled for this server' };
            }

            const guild = await client.guilds.fetch(guildId);
            if (!guild) {
                return { success: false, error: 'Guild not found' };
            }

            const verifiedUsers = this.db.getAllVerifiedUsersInGuild(guildId);
            const results = {
                total: verifiedUsers.length,
                synced: 0,
                failed: 0,
                errors: []
            };

            for (const user of verifiedUsers) {
                try {
                    // Check if member is in guild
                    const member = await guild.members.fetch(user.discord_id).catch(() => null);
                    if (!member) {
                        continue; // Skip users not in server
                    }

                    const result = await this.syncUserInGuild(client, guildId, user.discord_id);
                    
                    if (result.success) {
                        results.synced++;
                    } else {
                        results.failed++;
                        results.errors.push({
                            userId: user.discord_id,
                            error: result.error
                        });
                    }

                    // Small delay to avoid rate limits
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    results.failed++;
                    results.errors.push({
                        userId: user.discord_id,
                        error: error.message
                    });
                }
            }

            console.log(`[RankSyncService] Background sync completed for ${guild.name}: ${results.synced} synced, ${results.failed} failed`);

            return { success: true, results };
        } catch (error) {
            console.error('[RankSyncService] Error in background sync:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = RankSyncService;
