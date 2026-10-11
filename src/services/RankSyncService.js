const { PermissionFlagsBits } = require('discord.js');

class RankSyncService {
    constructor(database, robloxService, configManager) {
        this.db = database;
        this.roblox = robloxService;
        this.config = configManager;

        // ============================================================
        // MAIN SCP FOUNDATION SERVER
        // ============================================================
        //
        // Nicknames on the main SCP Foundation server are controlled
        // by the Roblox rank mappings.
        //
        // Example:
        // Rank 3  -> [L-0] Username
        // Rank 4  -> [L-1] Username
        // Rank 10 -> [O5-#] Username
        //
        // IMPORTANT:
        // O5 nicknames containing [O5-#] are special.
        // The # is manually assigned and therefore MUST NOT be
        // automatically overwritten during background rank syncs.
        //
        this.mainScpGuildId =
            process.env.MAIN_SCP_GUILD_ID || null;

        // ============================================================
        // SERVER MEMBER / GUEST CONFIGURATION
        // ============================================================

        this.serverMemberRoleName = 'Server Member';
        this.serverMemberNicknamePrefix = '[SM] ';
    }

    // ============================================================
    // SERVER MEMBER / GUEST HELPERS
    // ============================================================

    isMainScpGuild(guildId) {
        if (this.mainScpGuildId) {
            return guildId === this.mainScpGuildId;
        }

        const serverConfig =
            this.config.getServerConfig(guildId);

        return serverConfig?.serverMemberDefaults === true;
    }

    findRole(guild, roleName) {
        return guild.roles.cache.find(
            role =>
                role.name.toLowerCase() ===
                roleName.toLowerCase()
        );
    }

    getServerMemberNickname(username) {
        const nickname =
            `${this.serverMemberNicknamePrefix}${username}`;

        return nickname.substring(0, 32);
    }

    // ============================================================
    // SPECIAL NICKNAME HELPERS
    // ============================================================

    /**
     * Determines whether a nickname prefix represents an O5
     * nickname whose number is manually assigned.
     *
     * Example:
     * [O5-#] Username
     *
     * The "#" is deliberately preserved after it has been assigned
     * manually. Background rank syncing must never overwrite it.
     */
    isO5NicknamePrefix(nicknamePrefix) {
        if (typeof nicknamePrefix !== 'string') {
            return false;
        }

        return nicknamePrefix
            .trim()
            .toUpperCase()
            .startsWith('[O5-#]');
    }

    /**
     * Determines whether a nickname prefix represents a department
     * nickname using the TIMEZONE placeholder.
     *
     * Example:
     * [TIMEZONE] Username
     *
     * These nicknames may be initially set by /verify, but background
     * rank syncing must not overwrite them afterwards.
     */
    isDepartmentNicknamePrefix(nicknamePrefix) {
        if (typeof nicknamePrefix !== 'string') {
            return false;
        }

        return nicknamePrefix
            .toUpperCase()
            .includes('[TIMEZONE]');
    }

    /**
     * Determines whether a nickname is a manually-controlled
     * nickname.
     *
     * These are:
     *
     *   [O5-#] Username
     *   [TIMEZONE] Username
     *
     * They are allowed to be set during an explicit verification /
     * update, but are protected from automatic background nickname
     * changes.
     */
    isManuallyControlledNickname(nicknamePrefix) {
        return (
            this.isO5NicknamePrefix(nicknamePrefix) ||
            this.isDepartmentNicknamePrefix(nicknamePrefix)
        );
    }

    // ============================================================
    // SERVER MEMBER STATE
    // ============================================================

    async syncServerMemberState(
        member,
        robloxUsername = null,
        reason = 'Automatic Server Member synchronization'
    ) {
        try {
            if (!member || !member.guild) {
                return {
                    success: false,
                    updated: false,
                    error: 'Invalid member'
                };
            }

            if (!this.isMainScpGuild(member.guild.id)) {
                return {
                    success: true,
                    updated: false,
                    skipped: true,
                    reason:
                        'Not the main SCP Foundation server'
                };
            }

            const username =
                robloxUsername ||
                member.user.username;

            const serverMemberRole =
                this.findRole(
                    member.guild,
                    this.serverMemberRoleName
                );

            if (!serverMemberRole) {
                console.warn(
                    `[ServerMember] "${this.serverMemberRoleName}" does not exist in ${member.guild.name}`
                );

                return {
                    success: false,
                    updated: false,
                    error:
                        `Role "${this.serverMemberRoleName}" not found`
                };
            }

            const botMember =
                await member.guild.members.fetchMe();

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                console.warn(
                    `[ServerMember] Missing MANAGE_ROLES permission in ${member.guild.name}`
                );

                return {
                    success: false,
                    updated: false,
                    error:
                        'Missing MANAGE_ROLES permission'
                };
            }

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageNicknames
                )
            ) {
                console.warn(
                    `[ServerMember] Missing MANAGE_NICKNAMES permission in ${member.guild.name}`
                );

                return {
                    success: false,
                    updated: false,
                    error:
                        'Missing MANAGE_NICKNAMES permission'
                };
            }

            if (
                botMember.roles.highest.position <=
                serverMemberRole.position
            ) {
                console.warn(
                    `[ServerMember] Bot cannot manage "${this.serverMemberRoleName}" in ${member.guild.name} because its role is too high.`
                );
            }

            // ========================================================
            // ADD SERVER MEMBER ROLE
            // ========================================================

            let roleUpdated = false;

            if (
                !member.roles.cache.has(
                    serverMemberRole.id
                )
            ) {
                if (
                    botMember.roles.highest.position >
                    serverMemberRole.position
                ) {
                    await member.roles.add(
                        serverMemberRole,
                        reason
                    );

                    roleUpdated = true;

                    console.log(
                        `[ServerMember] Granted "${this.serverMemberRoleName}" to ${member.user.tag} in ${member.guild.name}`
                    );
                }
            }

            // ========================================================
            // SET GUEST NICKNAME
            // ========================================================

            let nicknameUpdated = false;

            if (
                member.id !==
                member.guild.ownerId
            ) {
                if (
                    member.roles.highest.position <
                    botMember.roles.highest.position
                ) {
                    const newNickname =
                        this.getServerMemberNickname(
                            username
                        );

                    if (
                        member.nickname !==
                        newNickname
                    ) {
                        await member.setNickname(
                            newNickname,
                            reason
                        );

                        nicknameUpdated = true;

                        console.log(
                            `[ServerMember] Set guest nickname for ${member.user.tag} to "${newNickname}" in ${member.guild.name}`
                        );
                    }
                }
            }

            return {
                success: true,
                updated:
                    roleUpdated ||
                    nicknameUpdated,
                roleUpdated,
                nicknameUpdated,
                role:
                    this.serverMemberRoleName,
                nickname:
                    this.getServerMemberNickname(
                        username
                    )
            };

        } catch (error) {
            console.error(
                `[ServerMember] Error syncing guest state for ${member?.user?.tag || 'unknown user'}:`,
                error
            );

            return {
                success: false,
                updated: false,
                error: error.message
            };
        }
    }

    // ============================================================
    // REMOVE SERVER MEMBER ROLE
    // ============================================================

    async removeServerMemberRole(
        member,
        reason =
            'User has received a Roblox group rank'
    ) {
        try {
            if (!member || !member.guild) {
                return {
                    success: false,
                    updated: false
                };
            }

            if (
                !this.isMainScpGuild(
                    member.guild.id
                )
            ) {
                return {
                    success: true,
                    updated: false,
                    skipped: true
                };
            }

            const serverMemberRole =
                this.findRole(
                    member.guild,
                    this.serverMemberRoleName
                );

            if (!serverMemberRole) {
                return {
                    success: true,
                    updated: false,
                    reason:
                        'Server Member role does not exist'
                };
            }

            if (
                !member.roles.cache.has(
                    serverMemberRole.id
                )
            ) {
                return {
                    success: true,
                    updated: false
                };
            }

            const botMember =
                await member.guild.members.fetchMe();

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageRoles
                )
            ) {
                return {
                    success: false,
                    updated: false,
                    error:
                        'Missing MANAGE_ROLES permission'
                };
            }

            if (
                botMember.roles.highest.position <=
                serverMemberRole.position
            ) {
                return {
                    success: false,
                    updated: false,
                    error:
                        'Server Member role is higher than or equal to bot role'
                };
            }

            await member.roles.remove(
                serverMemberRole,
                reason
            );

            console.log(
                `[ServerMember] Removed "${this.serverMemberRoleName}" from ${member.user.tag} in ${member.guild.name}`
            );

            return {
                success: true,
                updated: true
            };

        } catch (error) {
            console.error(
                `[ServerMember] Error removing guest role from ${member?.user?.tag || 'unknown user'}:`,
                error
            );

            return {
                success: false,
                updated: false,
                error: error.message
            };
        }
    }

    // ============================================================
    // SYNC USER
    // ============================================================

    /**
     * Sync a user's rank in a specific guild.
     *
     * options:
     *
     *   updateNickname: true
     *      Explicit verification/update.
     *
     *   updateNickname: false
     *      Automatic/background synchronization.
     *
     * Default is TRUE so existing /verify calls that use the
     * original three arguments continue to update nicknames.
     */
    async syncUserInGuild(
        client,
        guildId,
        discordId,
        options = {}
    ) {
        try {
            const updateNickname =
                options.updateNickname !== false;

            const guild =
                await client.guilds.fetch(
                    guildId
                );

            if (!guild) {
                return {
                    success: false,
                    error:
                        'Guild not found'
                };
            }

            const serverConfig =
                this.config.getServerConfig(
                    guildId
                );

            if (!serverConfig) {
                return {
                    success: false,
                    error:
                        'Server not configured'
                };
            }

            // ========================================================
            // GET VERIFICATION
            // ========================================================

            const verification =
                this.db.getVerification(
                    discordId
                );

            if (!verification) {
                return {
                    success: false,
                    error:
                        'User not verified'
                };
            }

            // ========================================================
            // GET MEMBER
            // ========================================================

            let member;

            try {
                member =
                    await guild.members.fetch(
                        discordId
                    );
            } catch (error) {
                return {
                    success: false,
                    error:
                        'Member not in server'
                };
            }

            // ========================================================
            // REFRESH ROBLOX USERNAME
            // ========================================================

            let robloxUsername =
                verification.roblox_username;

            try {
                const profileResult =
                    await this.roblox.getUserProfile(
                        verification.roblox_id
                    );

                if (
                    profileResult.success &&
                    profileResult.username &&
                    profileResult.username !==
                        robloxUsername
                ) {
                    console.log(
                        `[RankSyncService] Username changed for ${discordId}: ${robloxUsername} → ${profileResult.username}`
                    );

                    robloxUsername =
                        profileResult.username;

                    this.db.setVerification(
                        discordId,
                        verification.roblox_id,
                        robloxUsername
                    );
                }
            } catch (err) {
                console.warn(
                    '[RankSyncService] Could not refresh Roblox username:',
                    err.message
                );
            }

            // ========================================================
            // GET CURRENT ROBLOX RANK
            // ========================================================

            const rankResult =
                await this.roblox.getUserRankInGroup(
                    verification.roblox_id,
                    serverConfig.robloxGroupId
                );

            if (!rankResult.success) {
                if (
                    this.isMainScpGuild(
                        guildId
                    )
                ) {
                    await this.syncServerMemberState(
                        member,
                        robloxUsername,
                        'Roblox group rank could not be confirmed'
                    );
                }

                return {
                    success: false,
                    error:
                        'Failed to fetch Roblox rank'
                };
            }

            const currentRank =
                rankResult.rank;

            const roleName =
                rankResult.roleName;

            // ========================================================
            // GUEST / NOT IN GROUP
            // ========================================================

            const isGuest =
                currentRank === 0 ||
                !roleName ||
                roleName === '@everyone';

            if (isGuest) {
                const guestResult =
                    await this.syncServerMemberState(
                        member,
                        robloxUsername,
                        'User is verified but is not currently in the Roblox group'
                    );

                this.db.setGuildRank(
                    discordId,
                    guildId,
                    currentRank
                );

                return {
                    success: true,
                    rank:
                        currentRank,
                    roleName:
                        roleName,
                    rankChanged:
                        false,
                    previousRank:
                        currentRank,
                    rolesUpdated:
                        guestResult.roleUpdated ||
                        false,
                    nicknameUpdated:
                        guestResult.nicknameUpdated ||
                        false,
                    guest:
                        true
                };
            }

            // ========================================================
            // GET STORED RANK
            // ========================================================

            const storedRank =
                this.db.getGuildRank(
                    discordId,
                    guildId
                );

            const previousRank =
                storedRank
                    ? storedRank.last_known_rank
                    : null;

            // ========================================================
            // UPDATE STORED RANK
            // ========================================================

            this.db.setGuildRank(
                discordId,
                guildId,
                currentRank
            );

            // ========================================================
            // NORMAL ROLE SYNC
            // ========================================================

            const roleResult =
                await this.syncRoles(
                    member,
                    serverConfig,
                    currentRank
                );

            // ========================================================
            // REMOVE SERVER MEMBER ROLE
            // ========================================================

            await this.removeServerMemberRole(
                member,
                'User is now in the Roblox group with a valid rank'
            );

            // ========================================================
            // NORMAL / SPECIAL NICKNAME SYNC
            // ========================================================
            //
            // updateNickname is TRUE for explicit verification/update.
            //
            // updateNickname is FALSE for background synchronization.
            //
            // This is what prevents:
            //
            // [O5-3] Username
            //
            // from being changed back to:
            //
            // [O5-#] Username
            //
            // during background rank syncing.
            //
            // The same protection applies to:
            //
            // [TIMEZONE] Username
            //
            // ========================================================

            const nicknameResult =
                await this.syncNickname(
                    member,
                    serverConfig,
                    robloxUsername,
                    currentRank,
                    {
                        updateNickname
                    }
                );

            // ========================================================
            // LOG RANK CHANGE
            // ========================================================

            if (
                serverConfig.loggingChannelId &&
                previousRank !== null &&
                previousRank !== currentRank
            ) {
                await this.logRankChange(
                    client,
                    serverConfig,
                    member,
                    robloxUsername,
                    previousRank,
                    currentRank,
                    roleName
                );
            }

            // ========================================================
            // DM RANK CHANGE
            // ========================================================

            if (
                previousRank !== null &&
                previousRank !== currentRank
            ) {
                await this.dmRankChange(
                    member,
                    guild,
                    robloxUsername,
                    previousRank,
                    currentRank,
                    roleName
                );
            }

            return {
                success: true,
                rank:
                    currentRank,
                roleName:
                    roleName,
                rankChanged:
                    previousRank !==
                    currentRank,
                previousRank:
                    previousRank,
                rolesUpdated:
                    roleResult.updated,
                nicknameUpdated:
                    nicknameResult.updated,
                guest:
                    false
            };

        } catch (error) {
            console.error(
                '[RankSyncService] Error syncing user:',
                error
            );

            return {
                success: false,
                error:
                    error.message
            };
        }
    }

    // ============================================================
    // SYNC GUEST
    // ============================================================

    async syncGuestInGuild(member) {
        try {
            if (!member || !member.guild) {
                return {
                    success: false,
                    error:
                        'Invalid member'
                };
            }

            if (
                !this.isMainScpGuild(
                    member.guild.id
                )
            ) {
                return {
                    success: true,
                    skipped: true,
                    reason:
                        'Guest system only applies to the main SCP Foundation server'
                };
            }

            let robloxUsername =
                member.user.username;

            const verification =
                this.db.getVerification(
                    member.id
                );

            if (verification) {
                robloxUsername =
                    verification.roblox_username;

                try {
                    const profileResult =
                        await this.roblox.getUserProfile(
                            verification.roblox_id
                        );

                    if (
                        profileResult.success &&
                        profileResult.username
                    ) {
                        robloxUsername =
                            profileResult.username;

                        if (
                            robloxUsername !==
                            verification.roblox_username
                        ) {
                            this.db.setVerification(
                                member.id,
                                verification.roblox_id,
                                robloxUsername
                            );
                        }
                    }
                } catch (error) {
                    console.warn(
                        `[ServerMember] Could not refresh Roblox username for ${member.user.tag}:`,
                        error.message
                    );
                }
            }

            return await this.syncServerMemberState(
                member,
                robloxUsername,
                'User is not currently in a valid Roblox group rank state'
            );

        } catch (error) {
            console.error(
                `[ServerMember] Error syncing guest ${member?.user?.tag || 'unknown user'}:`,
                error
            );

            return {
                success: false,
                error:
                    error.message
            };
        }
    }

    // ============================================================
    // ROLE SYNC
    // ============================================================

    async syncRoles(
        member,
        serverConfig,
        rank
    ) {
        try {
            const rankMapping =
                this.config.getRankMapping(
                    member.guild.id,
                    rank
                );

            if (!rankMapping) {
                return {
                    success: true,
                    updated: false,
                    reason:
                        'No rank mapping found'
                };
            }

            const targetRoleName =
                rankMapping.roleName;

            const allConfiguredRoles =
                this.config.getAllRoleNames(
                    member.guild.id
                );

            const targetRole =
                member.guild.roles.cache.find(
                    r =>
                        r.name ===
                        targetRoleName
                );

            if (!targetRole) {
                console.warn(
                    `[RankSyncService] Role "${targetRoleName}" not found in guild ${member.guild.name}`
                );

                return {
                    success: false,
                    error:
                        `Role "${targetRoleName}" not found`
                };
            }

            // ========================================================
            // REMOVE OTHER CONFIGURED RANK ROLES
            // ========================================================

            const rolesToRemove =
                member.roles.cache.filter(
                    role =>
                        allConfiguredRoles.includes(
                            role.name
                        ) &&
                        role.id !==
                            targetRole.id
                );

            for (
                const [, role] of
                rolesToRemove
            ) {
                await member.roles.remove(
                    role
                );
            }

            // ========================================================
            // ADD TARGET ROLE
            // ========================================================

            let updated = false;

            if (
                !member.roles.cache.has(
                    targetRole.id
                )
            ) {
                await member.roles.add(
                    targetRole
                );

                updated = true;

            } else if (
                rolesToRemove.size > 0
            ) {
                updated = true;
            }

            return {
                success: true,
                updated,
                role:
                    targetRoleName
            };

        } catch (error) {
            console.error(
                '[RankSyncService] Error syncing roles:',
                error
            );

            return {
                success: false,
                error:
                    error.message
            };
        }
    }

    // ============================================================
    // NICKNAME SYNC
    // ============================================================

    /**
     * Sync Discord nickname based on the Roblox rank.
     *
     * updateNickname:
     *
     * TRUE:
     *   Explicit verification/update.
     *   Special nicknames are allowed to be changed.
     *
     * FALSE:
     *   Automatic/background sync.
     *   Special nicknames are protected.
     *
     * Special nicknames:
     *
     *   [O5-#] Username
     *   [TIMEZONE] Username
     *
     * Normal nicknames continue to automatically sync.
     */
    async syncNickname(
        member,
        serverConfig,
        robloxUsername,
        rank,
        options = {}
    ) {
        try {
            const updateNickname =
                options.updateNickname !== false;

            const botMember =
                await member.guild.members.fetchMe();

            if (
                !botMember.permissions.has(
                    PermissionFlagsBits.ManageNicknames
                )
            ) {
                return {
                    success: false,
                    updated: false,
                    error:
                        'Missing MANAGE_NICKNAMES permission'
                };
            }

            // Can't change owner's nickname.
            if (
                member.id ===
                member.guild.ownerId
            ) {
                return {
                    success: false,
                    updated: false,
                    error:
                        'Cannot change server owner nickname'
                };
            }

            // Check role hierarchy.
            if (
                member.roles.highest.position >=
                botMember.roles.highest.position
            ) {
                return {
                    success: false,
                    updated: false,
                    error:
                        'User has higher or equal role'
                };
            }

            // ========================================================
            // GET RANK MAPPING
            // ========================================================

            const rankMapping =
                this.config.getRankMapping(
                    member.guild.id,
                    rank
                );

            if (!rankMapping) {
                return {
                    success: true,
                    updated: false,
                    reason:
                        'No nickname mapping found for rank'
                };
            }

            const nicknamePrefix =
                typeof rankMapping.nicknamePrefix === 'string'
                    ? rankMapping.nicknamePrefix
                    : '';

            // ========================================================
            // SPECIAL NICKNAME PROTECTION
            // ========================================================
            //
            // O5:
            //
            // [O5-#] Username
            //
            // The # is manually assigned.
            //
            // Department:
            //
            // [TIMEZONE] Username
            //
            // The timezone is manually assigned.
            //
            // During background sync, do NOTHING to these
            // nicknames.
            //
            // During /verify or another explicit update, allow
            // the nickname to be set.
            //
            // ========================================================

            const manuallyControlled =
                this.isManuallyControlledNickname(
                    nicknamePrefix
                );

            if (
                manuallyControlled &&
                !updateNickname
            ) {
                return {
                    success: true,
                    updated: false,
                    skipped: true,
                    reason:
                        this.isO5NicknamePrefix(
                            nicknamePrefix
                        )
                            ? 'O5 nickname is manually controlled'
                            : 'Department nickname is manually controlled'
                };
            }

            // ========================================================
            // EMPTY PREFIX
            // ========================================================

            if (!nicknamePrefix) {
                return {
                    success: true,
                    updated: false,
                    skipped: true,
                    reason:
                        'No nickname prefix configured'
                };
            }

            // ========================================================
            // BUILD NICKNAME
            // ========================================================

            const newNickname =
                `${nicknamePrefix}${robloxUsername}`
                    .substring(0, 32);

            if (
                member.nickname !==
                newNickname
            ) {
                await member.setNickname(
                    newNickname
                );

                console.log(
                    `[RankSyncService] Set nickname for ${member.user.tag} to "${newNickname}"${manuallyControlled ? ' (explicit verification/update)' : ''}`
                );

                return {
                    success: true,
                    updated: true,
                    nickname:
                        newNickname
                };
            }

            return {
                success: true,
                updated: false,
                nickname:
                    newNickname
            };

        } catch (error) {
            console.error(
                '[RankSyncService] Error syncing nickname:',
                error
            );

            return {
                success: false,
                updated: false,
                error:
                    error.message
            };
        }
    }

    // ============================================================
    // RANK CHANGE LOGGING
    // ============================================================

    async logRankChange(
        client,
        serverConfig,
        member,
        robloxUsername,
        previousRank,
        newRank,
        newRoleName
    ) {
        try {
            if (
                !serverConfig.loggingChannelId
            ) {
                return;
            }

            const channel =
                await client.channels.fetch(
                    serverConfig.loggingChannelId
                );

            if (
                !channel ||
                !channel.isTextBased()
            ) {
                return;
            }

            const embed = {
                color:
                    newRank > previousRank
                        ? 0x00ff00
                        : 0xff9900,

                title:
                    '📊 Rank Changed',

                fields: [
                    {
                        name:
                            'User',
                        value:
                            `${member.user.tag} (${member.user.id})`,
                        inline: true
                    },
                    {
                        name:
                            'Roblox Username',
                        value:
                            robloxUsername,
                        inline: true
                    },
                    {
                        name:
                            'Previous Rank',
                        value:
                            previousRank.toString(),
                        inline: true
                    },
                    {
                        name:
                            'New Rank',
                        value:
                            `${newRank} - ${newRoleName}`,
                        inline: true
                    }
                ],

                timestamp:
                    new Date().toISOString()
            };

            await channel.send({
                embeds: [embed]
            });

        } catch (error) {
            console.error(
                '[RankSyncService] Error logging rank change:',
                error
            );
        }
    }

    // ============================================================
    // RANK CHANGE DM
    // ============================================================

    async dmRankChange(
        member,
        guild,
        robloxUsername,
        previousRank,
        newRank,
        newRoleName
    ) {
        try {
            const promoted =
                newRank > previousRank;

            const embed = {
                color:
                    promoted
                        ? 0x00c26f
                        : 0xff4444,

                author: {
                    name:
                        guild.name,

                    icon_url:
                        guild.iconURL({
                            dynamic: true
                        }) ?? undefined
                },

                title:
                    promoted
                        ? '⬆️ Rank Update'
                        : '⬇️ Rank Update',

                description:
                    promoted
                        ? `Congratulations **${robloxUsername}**, you've been promoted!`
                        : `**${robloxUsername}**, your rank has been updated.`,

                fields: [
                    {
                        name:
                            'New Rank',

                        value:
                            `**${newRoleName}**`,

                        inline: true
                    },
                    {
                        name:
                            'Previous Rank',

                        value:
                            `Rank ${previousRank}`,

                        inline: true
                    }
                ],

                footer: {
                    text:
                        `${guild.name} • Rank Sync`
                },

                timestamp:
                    new Date().toISOString()
            };

            await member.send({
                embeds: [embed]
            });

        } catch (error) {
            console.log(
                `[RankSyncService] Could not DM ${member.user.tag}:`,
                error.message
            );
        }
    }

    // ============================================================
    // BACKGROUND SYNC
    // ============================================================

    /**
     * Sync all verified users in a guild.
     *
     * IMPORTANT:
     *
     * Background sync passes:
     *
     *     updateNickname: false
     *
     * Therefore:
     *
     *   [O5-#] Username
     *   [TIMEZONE] Username
     *
     * are NEVER automatically changed.
     *
     * Normal rank nicknames such as [L-1], [L-2], etc. continue
     * to update automatically.
     */
    async syncAllInGuild(
        client,
        guildId
    ) {
        try {
            const serverConfig =
                this.config.getServerConfig(
                    guildId
                );

            if (!serverConfig) {
                return {
                    success: false,
                    error:
                        'Server not configured'
                };
            }

            if (
                !serverConfig.syncSettings
                    .backgroundSyncEnabled
            ) {
                return {
                    success: false,
                    error:
                        'Background sync disabled for this server'
                };
            }

            const guild =
                await client.guilds.fetch(
                    guildId
                );

            if (!guild) {
                return {
                    success: false,
                    error:
                        'Guild not found'
                };
            }

            const verifiedUsers =
                this.db.getAllVerifiedUsersInGuild(
                    guildId
                );

            const results = {
                total:
                    verifiedUsers.length,

                synced:
                    0,

                failed:
                    0,

                errors:
                    []
            };

            for (
                const user of
                verifiedUsers
            ) {
                try {
                    const member =
                        await guild.members
                            .fetch(
                                user.discord_id
                            )
                            .catch(
                                () => null
                            );

                    if (!member) {
                        continue;
                    }

                    // ====================================================
                    // IMPORTANT:
                    // Background sync MUST NOT automatically modify
                    // O5 or department nicknames.
                    // ====================================================

                    const result =
                        await this.syncUserInGuild(
                            client,
                            guildId,
                            user.discord_id,
                            {
                                updateNickname:
                                    false
                            }
                        );

                    if (
                        result.success
                    ) {
                        results.synced++;
                    } else {
                        results.failed++;

                        results.errors.push({
                            userId:
                                user.discord_id,

                            error:
                                result.error
                        });
                    }

                    // Small delay to avoid rate limits.
                    await new Promise(
                        resolve =>
                            setTimeout(
                                resolve,
                                1000
                            )
                    );

                } catch (error) {
                    results.failed++;

                    results.errors.push({
                        userId:
                            user.discord_id,

                        error:
                            error.message
                    });
                }
            }

            console.log(
                `[RankSyncService] Background sync completed for ${guild.name}: ${results.synced} synced, ${results.failed} failed`
            );

            return {
                success: true,
                results
            };

        } catch (error) {
            console.error(
                '[RankSyncService] Error in background sync:',
                error
            );

            return {
                success: false,
                error:
                    error.message
            };
        }
    }
}

module.exports = RankSyncService;
