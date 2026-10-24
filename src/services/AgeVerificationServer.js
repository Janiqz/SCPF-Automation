const http = require('http');
const { timingSafeEqual } = require('crypto');
const { EmbedBuilder } = require('discord.js');

const WEBHOOK_SECRET = process.env.AGE_WEBHOOK_SECRET;

const AGE_VERIFIED_ROLE_NAME = '18+ Verified';
const UNVERIFIED_ROLE_NAME = '18+ Unverified';

const PORT = Number(process.env.AGE_WEBHOOK_PORT) || 26111;
const MAX_WEBHOOK_BYTES = 16 * 1024;

function secretMatches(supplied, expected) {
    if (typeof supplied !== 'string' || typeof expected !== 'string') return false;
    const suppliedBuffer = Buffer.from(supplied);
    const expectedBuffer = Buffer.from(expected);
    return suppliedBuffer.length === expectedBuffer.length
        && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

class AgeVerificationServer {
    constructor(client, database) {
        this.client = client;
        this.database = database;
        this.server = null;

        // Prevent the role protection system from reacting
        // to role changes made by this service itself.
        this.roleChangeInProgress = new Set();

        // Bind the Discord event handler.
        this._handleMemberUpdate = this._handleMemberUpdate.bind(this);

        // Listen for Discord member updates so manually assigned
        // 18+ Verified roles can be checked immediately.
        this.client.on(
            'guildMemberUpdate',
            this._handleMemberUpdate
        );

        console.log(
            '[AgeVerification] Role protection system initialized'
        );
    }

    // ============================================================
    // HTTP SERVER
    // ============================================================

    start() {
        if (!WEBHOOK_SECRET) {
            console.error('[AgeVerification] AGE_WEBHOOK_SECRET is not configured; webhook server will remain disabled.');
            return false;
        }
        this.server = http.createServer((req, res) => {
            if (
                req.method !== 'POST' ||
                req.url !== '/age-verify'
            ) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            let body = '';
            let bodyBytes = 0;

            req.on('data', chunk => {
                bodyBytes += chunk.length;
                if (bodyBytes > MAX_WEBHOOK_BYTES) {
                    res.writeHead(413);
                    res.end('Payload too large');
                    req.destroy();
                    return;
                }
                body += chunk.toString();
            });

            req.on('end', () => {
                if (bodyBytes > MAX_WEBHOOK_BYTES) return;
                this._handleRequest(req, res, body);
            });
        });

        this.server.listen(
            PORT,
            '0.0.0.0',
            () => {
                console.log(
                    `[AgeVerification] HTTP server listening on port ${PORT}`
                );
            }
        );

        this.server.on('error', err => {
            console.error(
                '[AgeVerification] Server error:',
                err
            );
        });
        return true;
    }

    stop() {
        if (this.server) {
            this.server.close();
            this.server = null;

            console.log(
                '[AgeVerification] HTTP server stopped'
            );
        }

        this.client.off(
            'guildMemberUpdate',
            this._handleMemberUpdate
        );

        console.log(
            '[AgeVerification] Role protection stopped'
        );
    }

    // ============================================================
    // ROLE HELPERS
    // ============================================================

    _getVerifiedRole(guild) {
        return guild.roles.cache.find(
            role =>
                role.name.toLowerCase() ===
                AGE_VERIFIED_ROLE_NAME.toLowerCase()
        );
    }

    _getUnverifiedRole(guild) {
        return guild.roles.cache.find(
            role =>
                role.name.toLowerCase() ===
                UNVERIFIED_ROLE_NAME.toLowerCase()
        );
    }

    // ============================================================
    // SUCCESS EMBED
    // ============================================================

    _createSuccessEmbed() {
        return new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('18+ Age Verification Successful')
            .setDescription(
                'Your Roblox account has successfully passed the 18+ age verification check.'
            )
            .addFields(
                {
                    name: 'Verification Status',
                    value: 'You are now confirmed as 18+.',
                    inline: false
                },
                {
                    name: 'Discord Role',
                    value: `You have been given the **${AGE_VERIFIED_ROLE_NAME}** role.`,
                    inline: false
                },
                {
                    name: 'Adult Departments',
                    value: 'Your verified status may be used to place you with other verified adults in applicable departments within the game.',
                    inline: false
                }
            )
            .setFooter({
                text: 'Area-37 • Age Verification'
            })
            .setTimestamp();
    }

    // ============================================================
    // UNAUTHORIZED ROLE EMBED
    // ============================================================

    _createUnauthorizedEmbed() {
        return new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('18+ Verification Required')
            .setDescription(
                `The **${AGE_VERIFIED_ROLE_NAME}** role has been removed because our system could not find a valid 18+ age verification record for your account.`
            )
            .addFields(
                {
                    name: 'What happened?',
                    value:
                        'The role can only be assigned to users who have successfully completed the Roblox 18+ verification process.',
                    inline: false
                },
                {
                    name: 'What should I do?',
                    value:
                        'If you have already completed the verification process, please contact a member of staff so your verification can be checked.',
                    inline: false
                }
            )
            .setFooter({
                text: 'Area-37 • Age Verification'
            })
            .setTimestamp();
    }

    // ============================================================
    // DISCORD ROLE PROTECTION
    // ============================================================

    async _handleMemberUpdate(oldMember, newMember) {
        try {
            const verifiedRole =
                this._getVerifiedRole(newMember.guild);

            if (!verifiedRole) {
                return;
            }

            const previouslyHadRole =
                oldMember.roles.cache.has(
                    verifiedRole.id
                );

            const currentlyHasRole =
                newMember.roles.cache.has(
                    verifiedRole.id
                );

            // The 18+ Verified role did not change.
            if (
                previouslyHadRole ===
                currentlyHasRole
            ) {
                return;
            }

            // The role was removed.
            if (!currentlyHasRole) {
                return;
            }

            console.log(
                `[AgeVerification] "${AGE_VERIFIED_ROLE_NAME}" added to ${newMember.user.tag} in ${newMember.guild.name}`
            );

            // Ignore changes caused by this service itself.
            if (
                this.roleChangeInProgress.has(
                    newMember.id
                )
            ) {
                return;
            }

            // Check the actual age verification database record.
            const isAgeVerified =
                this.database.isAgeVerified(
                    newMember.id
                );

            if (isAgeVerified) {
                console.log(
                    `[AgeVerification] ${newMember.user.tag} is legitimately age verified`
                );

                return;
            }

            // User does not have a legitimate age verification record.
            console.warn(
                `[AgeVerification] UNAUTHORIZED "${AGE_VERIFIED_ROLE_NAME}" assignment detected for ${newMember.user.tag} in ${newMember.guild.name}`
            );

            await this._removeUnauthorizedVerifiedRole(
                newMember
            );

        } catch (err) {
            console.error(
                '[AgeVerification] Error checking role assignment:',
                err
            );
        }
    }

    // ============================================================
    // REMOVE UNAUTHORIZED VERIFIED ROLE
    // ============================================================

    async _removeUnauthorizedVerifiedRole(member) {
        const guild = member.guild;

        const verifiedRole =
            this._getVerifiedRole(guild);

        const unverifiedRole =
            this._getUnverifiedRole(guild);

        if (!verifiedRole) {
            return;
        }

        const botMember = guild.members.me;

        if (!botMember) {
            console.warn(
                `[AgeVerification] Could not find bot member in ${guild.name}`
            );

            return;
        }

        if (
            !botMember.permissions.has(
                'ManageRoles'
            )
        ) {
            console.warn(
                `[AgeVerification] Bot does not have Manage Roles in ${guild.name}`
            );

            return;
        }

        if (
            botMember.roles.highest.position <=
            verifiedRole.position
        ) {
            console.warn(
                `[AgeVerification] Bot cannot remove "${AGE_VERIFIED_ROLE_NAME}" because its role is not high enough`
            );

            return;
        }

        try {
            this.roleChangeInProgress.add(
                member.id
            );

            await member.roles.remove(
                verifiedRole,
                'Unauthorized 18+ Verified role assignment'
            );

            console.log(
                `[AgeVerification] Removed unauthorized "${AGE_VERIFIED_ROLE_NAME}" from ${member.user.tag} in ${guild.name}`
            );

            // Restore 18+ Unverified where possible.
            if (unverifiedRole) {
                if (
                    botMember.roles.highest.position >
                    unverifiedRole.position
                ) {
                    if (
                        !member.roles.cache.has(
                            unverifiedRole.id
                        )
                    ) {
                        await member.roles.add(
                            unverifiedRole,
                            'User has not completed 18+ age verification'
                        );

                        console.log(
                            `[AgeVerification] Restored "${UNVERIFIED_ROLE_NAME}" to ${member.user.tag} in ${guild.name}`
                        );
                    }
                } else {
                    console.warn(
                        `[AgeVerification] Bot cannot manage "${UNVERIFIED_ROLE_NAME}" in ${guild.name}`
                    );
                }
            }

            // Send an explanatory embed.
            try {
                await member.send({
                    embeds: [
                        this._createUnauthorizedEmbed()
                    ]
                });

                console.log(
                    `[AgeVerification] Sent unauthorized-role notification to ${member.user.tag}`
                );

            } catch (err) {
                console.warn(
                    `[AgeVerification] Could not DM ${member.user.tag}: ${err.message}`
                );
            }

        } catch (err) {
            console.error(
                `[AgeVerification] Failed to remove unauthorized role from ${member.user.tag}:`,
                err
            );

        } finally {
            setTimeout(() => {
                this.roleChangeInProgress.delete(
                    member.id
                );
            }, 2000);
        }
    }

    // ============================================================
    // LEGITIMATE AGE VERIFICATION
    // ============================================================

    async _grantVerifiedRole(discordId) {
        let memberFound = false;
        let roleGranted = false;
        let roleRemoved = false;
        let dmSent = false;

        for (
            const guild of this.client.guilds.cache.values()
        ) {
            try {
                const member =
                    await guild.members.fetch(
                        discordId
                    ).catch(() => null);

                if (!member) {
                    continue;
                }

                memberFound = true;

                const botMember =
                    guild.members.me;

                if (!botMember) {
                    console.warn(
                        `[AgeVerification] Bot member not found in ${guild.name}`
                    );

                    continue;
                }

                if (
                    !botMember.permissions.has(
                        'ManageRoles'
                    )
                ) {
                    console.warn(
                        `[AgeVerification] Missing Manage Roles permission in ${guild.name}`
                    );

                    continue;
                }

                const verifiedRole =
                    this._getVerifiedRole(guild);

                const unverifiedRole =
                    this._getUnverifiedRole(guild);

                if (!verifiedRole) {
                    console.warn(
                        `[AgeVerification] "${AGE_VERIFIED_ROLE_NAME}" not found in ${guild.name}`
                    );
                }

                if (!unverifiedRole) {
                    console.warn(
                        `[AgeVerification] "${UNVERIFIED_ROLE_NAME}" not found in ${guild.name}`
                    );
                }

                // ----------------------------------------------------
                // Give 18+ Verified
                // ----------------------------------------------------

                if (verifiedRole) {
                    if (
                        !member.roles.cache.has(
                            verifiedRole.id
                        )
                    ) {
                        if (
                            botMember.roles.highest.position >
                            verifiedRole.position
                        ) {
                            this.roleChangeInProgress.add(
                                member.id
                            );

                            await member.roles.add(
                                verifiedRole,
                                'Age confirmed via Roblox 18+ game'
                            );

                            roleGranted = true;

                            console.log(
                                `[AgeVerification] Granted "${AGE_VERIFIED_ROLE_NAME}" to ${member.user.tag} in ${guild.name}`
                            );

                            setTimeout(() => {
                                this.roleChangeInProgress.delete(
                                    member.id
                                );
                            }, 2000);

                        } else {
                            console.warn(
                                `[AgeVerification] Bot role is not high enough to manage "${AGE_VERIFIED_ROLE_NAME}" in ${guild.name}`
                            );
                        }

                    } else {
                        roleGranted = true;

                        console.log(
                            `[AgeVerification] ${member.user.tag} already has "${AGE_VERIFIED_ROLE_NAME}" in ${guild.name}`
                        );
                    }
                }

                // ----------------------------------------------------
                // Remove 18+ Unverified
                // ----------------------------------------------------

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
                        this.roleChangeInProgress.add(
                            member.id
                        );

                        await member.roles.remove(
                            unverifiedRole,
                            'Upgraded to 18+ Verified'
                        );

                        roleRemoved = true;

                        console.log(
                            `[AgeVerification] Removed "${UNVERIFIED_ROLE_NAME}" from ${member.user.tag} in ${guild.name}`
                        );

                        setTimeout(() => {
                            this.roleChangeInProgress.delete(
                                member.id
                            );
                        }, 2000);

                    } else {
                        console.warn(
                            `[AgeVerification] Bot role is not high enough to manage "${UNVERIFIED_ROLE_NAME}" in ${guild.name}`
                        );
                    }
                }

            } catch (err) {
                console.error(
                    `[AgeVerification] Error in guild ${guild.name}:`,
                    err.message
                );

                this.roleChangeInProgress.delete(
                    discordId
                );
            }
        }

        // ------------------------------------------------------------
        // Send success DM
        // ------------------------------------------------------------

        if (memberFound) {
            try {
                const user =
                    await this.client.users.fetch(
                        discordId
                    );

                await user.send({
                    embeds: [
                        this._createSuccessEmbed()
                    ]
                });

                dmSent = true;

                console.log(
                    `[AgeVerification] Sent verification DM to ${user.tag}`
                );

            } catch (err) {
                console.warn(
                    `[AgeVerification] Could not DM user ${discordId}: ${err.message}`
                );
            }
        }

        return {
            memberFound,
            roleGranted,
            roleRemoved,
            dmSent
        };
    }

    // ============================================================
    // WEBHOOK REQUEST HANDLER
    // ============================================================

    async _handleRequest(req, res, body) {
        try {
            let payload;

            try {
                payload = JSON.parse(body);

            } catch {
                res.writeHead(400);
                res.end('Bad JSON');
                return;
            }

            // --------------------------------------------------------
            // Check webhook secret
            // --------------------------------------------------------

            if (!secretMatches(payload.secret, WEBHOOK_SECRET)) {
                console.warn(
                    '[AgeVerification] Invalid webhook secret from',
                    req.socket.remoteAddress
                );

                res.writeHead(401);
                res.end('Unauthorized');
                return;
            }

            // --------------------------------------------------------
            // Validate Roblox data
            // --------------------------------------------------------

            const {
                robloxUserId,
                robloxUsername
            } = payload;

            if (
                !/^\d{1,20}$/.test(String(robloxUserId || '')) ||
                typeof robloxUsername !== 'string' ||
                !/^[A-Za-z0-9_]{3,20}$/.test(robloxUsername)
            ) {
                res.writeHead(400);
                res.end('Missing fields');
                return;
            }

            console.log(
                `[AgeVerification] Request for ${robloxUsername} (${robloxUserId})`
            );

            // --------------------------------------------------------
            // Find linked Discord account
            // --------------------------------------------------------

            const verification =
                this.database.getVerificationByRobloxId(
                    robloxUserId.toString()
                );

            if (!verification) {
                console.log(
                    `[AgeVerification] ${robloxUsername} has no linked Discord account`
                );

                res.writeHead(200, {
                    'Content-Type':
                        'application/json'
                });

                res.end(
                    JSON.stringify({
                        status: 'unverified',
                        reason:
                            'no_linked_discord'
                    })
                );

                return;
            }

            const discordId =
                verification.discord_id;

            console.log(
                `[AgeVerification] Linked Discord ID: ${discordId}`
            );

            // --------------------------------------------------------
            // Record successful age verification.
            // This is the source of truth for the role protection
            // system.
            // --------------------------------------------------------

            this.database.setAgeVerification(
                discordId,
                robloxUserId.toString(),
                robloxUsername
            );

            console.log(
                `[AgeVerification] Recorded legitimate 18+ verification for ${robloxUsername}`
            );

            // --------------------------------------------------------
            // Grant/remove roles and DM the user.
            // --------------------------------------------------------

            const result =
                await this._grantVerifiedRole(
                    discordId
                );

            console.log(
                `[AgeVerification] Result for ${robloxUsername}:`,
                result
            );

            // --------------------------------------------------------
            // Respond to Roblox.
            // --------------------------------------------------------

            res.writeHead(200, {
                'Content-Type':
                    'application/json'
            });

            res.end(
                JSON.stringify({
                    status: 'verified',
                    memberFound:
                        result.memberFound,
                    roleGranted:
                        result.roleGranted,
                    roleRemoved:
                        result.roleRemoved,
                    dmSent:
                        result.dmSent
                })
            );

        } catch (err) {
            console.error(
                '[AgeVerification] Unhandled error:',
                err
            );

            if (!res.headersSent) {
                res.writeHead(500);
                res.end(
                    'Internal server error'
                );
            }
        }
    }
}

module.exports = AgeVerificationServer;
