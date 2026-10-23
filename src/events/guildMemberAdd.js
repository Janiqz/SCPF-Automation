const { Events } = require('discord.js');

module.exports = {
    name: Events.GuildMemberAdd,

    async execute(
        member,
        { database, rankSyncService, configManager, sessionAnnouncements }
    ) {
        try {
            if (member.user.bot) {
                return;
            }

            await sessionAnnouncements.ensureMemberSubscribed(member).catch(error => {
                console.error(`[GuildMemberAdd] Could not enable session notifications for ${member.user.tag}: ${error.message}`);
            });

            const serverConfig =
                configManager.getServerConfig(
                    member.guild.id
                );

            // Server isn't configured.
            if (!serverConfig) {
                return;
            }

            // ========================================================
            // UNVERIFIED / GUEST
            // ========================================================
            //
            // This MUST happen even when there is no verification
            // record.
            //
            // syncGuestInGuild() handles the D Class Personnel role and
            // [CD] nickname specifically for the main Foundation server.
            //

            const verification =
                database.getVerification(
                    member.user.id
                );

            if (!verification) {
                console.log(
                    `[GuildMemberAdd] ${member.user.tag} is unverified in ${member.guild.name} - assigning D Class Personnel`
                );

                const result =
                    await rankSyncService.syncGuestInGuild(
                        member
                    );

                if (result.success) {
                    console.log(
                        `[GuildMemberAdd] Assigned D Class Personnel status to ${member.user.tag}`
                    );
                } else {
                    console.error(
                        `[GuildMemberAdd] Failed to assign D Class Personnel status to ${member.user.tag}: ${result.error}`
                    );
                }

                return;
            }

            // ========================================================
            // VERIFIED USER
            // ========================================================

            if (
                !serverConfig.syncSettings
                    .syncOnJoin
            ) {
                return;
            }

            console.log(
                `[GuildMemberAdd] Syncing verified user ${member.user.tag} in ${member.guild.name}`
            );

            const result =
                await rankSyncService.syncUserInGuild(
                    member.client,
                    member.guild.id,
                    member.user.id
                );

            if (result.success) {
                console.log(
                    `[GuildMemberAdd] Successfully synced ${member.user.tag} - Rank: ${result.rank}`
                );
            } else {
                console.error(
                    `[GuildMemberAdd] Failed to sync ${member.user.tag}: ${result.error}`
                );
            }

        } catch (error) {
            console.error(
                '[GuildMemberAdd] Error:',
                error
            );
        }
    }
};
