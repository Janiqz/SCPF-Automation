const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const AGE_VERIFIED_ROLE_NAME = '18+ Verified';
const UNVERIFIED_ROLE_NAME = '18+ Unverified';

async function ensureAgeRole(client, database, discordId) {
    let verified = false;
    let unverifiedGiven = false;

    // Check whether this Discord user has actually completed
    // the separate 18+ age verification.
    verified = database.isAgeVerified(discordId);

    for (const guild of client.guilds.cache.values()) {
        try {
            const member = await guild.members.fetch(discordId).catch(() => null);
            if (!member) continue;

            const botMember = guild.members.me;

            if (!botMember) continue;

            if (!botMember.permissions.has('ManageRoles')) {
                console.warn(
                    `[AgeRole] Bot does not have Manage Roles in ${guild.name}`
                );
                continue;
            }

            const verifiedRole = guild.roles.cache.find(
                role =>
                    role.name.toLowerCase() ===
                    AGE_VERIFIED_ROLE_NAME.toLowerCase()
            );

            const unverifiedRole = guild.roles.cache.find(
                role =>
                    role.name.toLowerCase() ===
                    UNVERIFIED_ROLE_NAME.toLowerCase()
            );

            // ========================================================
            // USER IS ALREADY 18+ VERIFIED
            // ========================================================

            if (verified) {
                if (
                    verifiedRole &&
                    !member.roles.cache.has(verifiedRole.id)
                ) {
                    if (
                        botMember.roles.highest.position >
                        verifiedRole.position
                    ) {
                        await member.roles.add(
                            verifiedRole,
                            'Existing 18+ age verification confirmed'
                        );

                        console.log(
                            `[AgeRole] Restored "${AGE_VERIFIED_ROLE_NAME}" to ${discordId} in ${guild.name}`
                        );
                    }
                }

                // If they are verified, make sure Unverified is removed.
                if (
                    unverifiedRole &&
                    member.roles.cache.has(unverifiedRole.id)
                ) {
                    if (
                        botMember.roles.highest.position >
                        unverifiedRole.position
                    ) {
                        await member.roles.remove(
                            unverifiedRole,
                            'User has completed 18+ verification'
                        );

                        console.log(
                            `[AgeRole] Removed "${UNVERIFIED_ROLE_NAME}" from ${discordId} in ${guild.name}`
                        );
                    }
                }

                continue;
            }

            // ========================================================
            // USER IS NOT 18+ VERIFIED
            // ========================================================

            // IMPORTANT:
            // Normal Roblox/Discord verification does NOT grant
            // 18+ Verified.
            //
            // Instead, make sure they have 18+ Unverified.

            if (unverifiedRole) {
                if (
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
                            'Discord/Roblox account linked but 18+ age verification not completed'
                        );

                        unverifiedGiven = true;

                        console.log(
                            `[AgeRole] Granted "${UNVERIFIED_ROLE_NAME}" to ${discordId} in ${guild.name}`
                        );
                    } else {
                        console.warn(
                            `[AgeRole] Bot role is not high enough to manage "${UNVERIFIED_ROLE_NAME}" in ${guild.name}`
                        );
                    }
                }
            }

        } catch (err) {
            console.error(
                `[AgeRole] Error in guild ${guild.name}:`,
                err.message
            );
        }
    }

    return {
        verified,
        unverifiedGiven
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify_confirm')
        .setDescription('Confirm your Roblox account verification'),

    async execute(
        interaction,
        {
            database,
            robloxService,
            rankSyncService,
            configManager,
            portalIdentities
        }
    ) {
        await interaction.deferReply({
            flags: 64
        });

        try {
            // ========================================================
            // CHECK SERVER CONFIGURATION
            // ========================================================

            if (
                !configManager.hasServerConfig(
                    interaction.guildId
                )
            ) {
                return interaction.editReply({
                    content:
                        '❌ This server is not configured for rank syncing. Please contact an administrator.'
                });
            }

            const portalIdentity = await portalIdentities.find(interaction.user.id);
            if (!portalIdentity) {
                return interaction.editReply({ content: '❌ Link and verify your Roblox account first at https://janiqzscpf.info/account. Roblox profile codes are no longer used.' });
            }
            database.setVerification(interaction.user.id, portalIdentity.roblox_user_id, portalIdentity.roblox_username);

            // ========================================================
            // CHECK EXISTING VERIFICATION
            // ========================================================

            const existingVerification =
                database.getVerification(
                    interaction.user.id
                );

            if (existingVerification) {
                const serverConfig =
                    configManager.getServerConfig(
                        interaction.guildId
                    );

                let syncResult = null;

                if (serverConfig) {
                    syncResult =
                        await rankSyncService.syncUserInGuild(
                            interaction.client,
                            interaction.guildId,
                            interaction.user.id
                        );
                }

                // IMPORTANT:
                // This no longer automatically gives 18+ Verified.
                //
                // It checks the separate age-verification record.
                const ageResult =
                    await ensureAgeRole(
                        interaction.client,
                        database,
                        interaction.user.id
                    );

                if (
                    syncResult &&
                    syncResult.success
                ) {
                    const embed =
                        new EmbedBuilder()
                            .setColor(0x00ff00)
                            .setTitle(
                                '✅ Already Verified - Roles Updated'
                            )
                            .setDescription(
                                `You are verified as **${existingVerification.roblox_username}**`
                            )
                            .addFields(
                                {
                                    name: 'Current Rank',
                                    value: `${syncResult.rank} - ${syncResult.roleName}`,
                                    inline: true
                                },
                                {
                                    name: '18+ Status',
                                    value: ageResult.verified
                                        ? '✅ 18+ Verified'
                                        : '⏳ 18+ Unverified',
                                    inline: true
                                }
                            )
                            .setTimestamp();

                    if (syncResult.rolesUpdated) {
                        embed.addFields({
                            name: 'Roles Updated',
                            value:
                                '✓ Your roles have been synced',
                            inline: true
                        });
                    }

                    if (syncResult.nicknameUpdated) {
                        embed.addFields({
                            name: 'Nickname Updated',
                            value:
                                '✓ Your nickname has been updated',
                            inline: true
                        });
                    }

                    return interaction.editReply({
                        embeds: [embed]
                    });
                }

                return interaction.editReply({
                    content:
                        `✅ You are already verified as **${existingVerification.roblox_username}**!\n\n` +
                        (
                            ageResult.verified
                                ? '✅ You are also 18+ Verified.'
                                : '⏳ You are currently marked as 18+ Unverified until you complete the separate age verification process.'
                        )
                });
            }

            // ========================================================
            // GET PENDING VERIFICATION
            // ========================================================

            const pendingVerification =
                database.getPendingVerification(
                    interaction.user.id
                );

            if (!pendingVerification) {
                return interaction.editReply({
                    content:
                        '❌ No pending verification found. Please use `/verify <username>` first.'
                });
            }

            // ========================================================
            // CHECK EXPIRATION
            // ========================================================

            const expirationTime =
                15 * 60 * 1000;

            if (
                Date.now() -
                    pendingVerification.created_at >
                expirationTime
            ) {
                database.deletePendingVerification(
                    interaction.user.id
                );

                return interaction.editReply({
                    content:
                        '❌ Verification code has expired. Please use `/verify <username>` again to get a new code.'
                });
            }

            // ========================================================
            // FETCH ROBLOX PROFILE
            // ========================================================

            const profileResult =
                await robloxService.getUserProfile(
                    pendingVerification.roblox_id
                );

            if (!profileResult.success) {
                return interaction.editReply({
                    content:
                        `❌ Failed to fetch your Roblox profile: ${profileResult.error}`
                });
            }

            const profileDescription =
                profileResult.description || '';

            const verificationCode =
                pendingVerification.verification_code;

            // ========================================================
            // CHECK VERIFICATION CODE
            // ========================================================

            if (
                !profileDescription.includes(
                    verificationCode
                )
            ) {
                return interaction.editReply({
                    content:
                        `❌ Verification code not found in your profile description.\n\n` +
                        `Please add \`${verificationCode}\` to your "About" section on your Roblox profile and try again.`
                });
            }

            // ========================================================
            // SAVE NORMAL ROBLOX/DISCORD VERIFICATION
            // ========================================================

            database.setVerification(
                interaction.user.id,
                pendingVerification.roblox_id,
                profileResult.username ||
                    pendingVerification.roblox_username
            );

            database.deletePendingVerification(
                interaction.user.id
            );

            // ========================================================
            // SYNC RANK
            // ========================================================

            const serverConfig =
                configManager.getServerConfig(
                    interaction.guildId
                );

            let syncResult = null;

            if (
                serverConfig &&
                serverConfig.syncSettings &&
                serverConfig.syncSettings.syncOnVerify
            ) {
                syncResult =
                    await rankSyncService.syncUserInGuild(
                        interaction.client,
                        interaction.guildId,
                        interaction.user.id
                    );
            }

            // ========================================================
            // AGE ROLE GATE
            // ========================================================

            // This is intentionally NOT an age verification.
            //
            // If they have already completed the separate 18+
            // verification, preserve/give 18+ Verified.
            //
            // Otherwise, give 18+ Unverified.
            const ageResult =
                await ensureAgeRole(
                    interaction.client,
                    database,
                    interaction.user.id
                );

            // ========================================================
            // SUCCESS EMBED
            // ========================================================

            const embed =
                new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle(
                        '✅ Verification Successful'
                    )
                    .setDescription(
                        `Your Discord account has been securely linked to **${pendingVerification.roblox_username}**.`
                    )
                    .addFields(
                        {
                            name: 'Roblox User ID',
                            value:
                                pendingVerification.roblox_id,
                            inline: true
                        },
                        {
                            name: '18+ Status',
                            value: ageResult.verified
                                ? '✅ 18+ Verified'
                                : '⏳ 18+ Unverified',
                            inline: true
                        },
                        {
                            name: '🔒 Account Status',
                            value:
                                'Your Roblox and Discord accounts are now linked.',
                            inline: false
                        }
                    )
                    .setTimestamp();

            if (!ageResult.verified) {
                embed.addFields({
                    name: '18+ Verification',
                    value:
                        'Your account has not completed the separate 18+ verification process, so you have been given **18+ Unverified**.',
                    inline: false
                });
            }

            if (
                syncResult &&
                syncResult.success
            ) {
                embed.addFields({
                    name: 'Current Rank',
                    value:
                        `${syncResult.rank} - ${syncResult.roleName}`,
                    inline: true
                });

                if (syncResult.rolesUpdated) {
                    embed.addFields({
                        name: 'Roles Updated',
                        value:
                            '✓ Your roles have been synced',
                        inline: true
                    });
                }

                if (syncResult.nicknameUpdated) {
                    embed.addFields({
                        name: 'Nickname Updated',
                        value:
                            '✓ Your nickname has been updated',
                        inline: true
                    });
                }
            }

            embed.setFooter({
                text:
                    '💡 You can now remove the verification code from your Roblox profile'
            });

            await interaction.editReply({
                embeds: [embed]
            });

            // ========================================================
            // LOG VERIFICATION
            // ========================================================

            if (
                serverConfig &&
                serverConfig.loggingChannelId
            ) {
                try {
                    const logChannel =
                        interaction.guild.channels.cache.get(
                            serverConfig.loggingChannelId
                        );

                    if (logChannel) {
                        const logEmbed =
                            new EmbedBuilder()
                                .setColor(0x00ff00)
                                .setTitle(
                                    '✅ New User Verification'
                                )
                                .addFields(
                                    {
                                        name: 'Discord User',
                                        value:
                                            `${interaction.user.tag} (${interaction.user.id})`,
                                        inline: false
                                    },
                                    {
                                        name: 'Roblox Account',
                                        value:
                                            `${pendingVerification.roblox_username} (${pendingVerification.roblox_id})`,
                                        inline: false
                                    },
                                    {
                                        name: 'Roblox Profile',
                                        value:
                                            `https://www.roblox.com/users/${pendingVerification.roblox_id}/profile`,
                                        inline: false
                                    },
                                    {
                                        name: '18+ Status',
                                        value:
                                            ageResult.verified
                                                ? '✅ 18+ Verified'
                                                : '⏳ 18+ Unverified',
                                        inline: false
                                    }
                                )
                                .setTimestamp();

                        if (
                            syncResult &&
                            syncResult.success
                        ) {
                            logEmbed.addFields({
                                name:
                                    'Initial Rank',
                                value:
                                    `${syncResult.rank} - ${syncResult.roleName}`,
                                inline: false
                            });
                        }

                        await logChannel.send({
                            embeds: [logEmbed]
                        });
                    }
                } catch (logError) {
                    console.error(
                        '[Verify Confirm] Failed to log to channel:',
                        logError
                    );
                }
            }

        } catch (error) {
            console.error(
                '[Verify Confirm Command] Error:',
                error
            );

            await interaction.editReply({
                content:
                    '❌ An error occurred during verification confirmation. Please try again later.'
            });
        }
    }
};
