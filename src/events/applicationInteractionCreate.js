const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, { database, applicationManager, robloxService, rankSyncService, configManager }) {
        try {
            // Handle application button clicks
            if (interaction.isButton() && interaction.customId.startsWith('apply_')) {
                const applicationId = interaction.customId.replace('apply_', '');
                
                // Check if user is verified
                const verification = database.getVerification(interaction.user.id);
                if (!verification) {
                    return interaction.reply({
                        content: '❌ You must be verified to submit an application. Use `/verify` first.',
                        flags: 64
                    });
                }

                // Get application config
                const application = applicationManager.getApplication(interaction.guildId, applicationId);
                if (!application) {
                    return interaction.reply({
                        content: '❌ Application not found.',
                        flags: 64
                    });
                }

                // Get user's current rank
                const serverConfig = configManager.getServerConfig(interaction.guildId);
                const rankResult = await robloxService.getUserRankInGroup(
                    verification.roblox_id,
                    serverConfig.robloxGroupId
                );

                if (!rankResult.success) {
                    return interaction.reply({
                        content: '❌ Failed to fetch your rank from Roblox.',
                        flags: 64
                    });
                }

                // Check if user can apply
                const canApply = applicationManager.canUserApply(
                    interaction.guildId,
                    applicationId,
                    rankResult.rank
                );

                if (!canApply.canApply) {
                    // Use custom rank display if available, otherwise fallback to rank names
                    const requiredRankDisplay = application.requiredRankDisplay || configManager.getRankName(interaction.guildId, application.requiredRank);
                    const targetRankDisplay = application.targetRankDisplay || configManager.getRankName(interaction.guildId, application.targetRank);
                    
                    let errorMessage = canApply.reason;
                    
                    if (rankResult.rank >= application.targetRank) {
                        errorMessage = `❌ You are already **${rankResult.roleName}** (Rank ${rankResult.rank}), which is at or above **${targetRankDisplay}**.`;
                    } else if (rankResult.rank < application.requiredRank) {
                        errorMessage = `❌ You need to be at least **${requiredRankDisplay}** to apply. You are currently **${rankResult.roleName}** (Rank ${rankResult.rank}).`;
                    }
                    
                    return interaction.reply({
                        content: errorMessage,
                        flags: 64
                    });
                }

                // Check reapplication cooldown (3 days after denial)
                const reapplicationCooldown = applicationManager.getReapplicationCooldown(
                    database,
                    interaction.user.id,
                    interaction.guildId,
                    applicationId
                );

                if (reapplicationCooldown.onCooldown) {
                    const canApplyDate = new Date(reapplicationCooldown.canApplyAt);
                    return interaction.reply({
                        content: `❌ Your previous application was denied. You must wait **${reapplicationCooldown.daysRemaining} more day(s)** before reapplying.\n\nYou can apply again: <t:${Math.floor(canApplyDate.getTime() / 1000)}:R>`,
                        flags: 64
                    });
                }

                // Check if user has a pending application (3 day cooldown)
                const pendingCooldown = applicationManager.getPendingApplicationCooldown(
                    database,
                    interaction.user.id,
                    interaction.guildId
                );

                if (pendingCooldown.onCooldown) {
                    const canApplyDate = new Date(pendingCooldown.canApplyAt);
                    return interaction.reply({
                        content: `❌ You already have a pending application. You must wait **${pendingCooldown.daysRemaining} more day(s)** before submitting another.\n\nYou can apply again: <t:${Math.floor(canApplyDate.getTime() / 1000)}:R>`,
                        flags: 64
                    });
                }

                // Check progression cooldown (after acceptance)
                const cooldown = applicationManager.getUserCooldown(
                    database,
                    interaction.user.id,
                    interaction.guildId,
                    applicationId
                );

                if (cooldown.onCooldown) {
                    const canApplyDate = new Date(cooldown.canApplyAt);
                    return interaction.reply({
                        content: `❌ You must wait **${cooldown.daysRemaining} more day(s)** since your last accepted application before applying for the next level.\n\nYou can apply again: <t:${Math.floor(canApplyDate.getTime() / 1000)}:R>`,
                        flags: 64
                    });
                }

                // Create modal with questions
                const modal = new ModalBuilder()
                    .setCustomId(`submit_application_${applicationId}`)
                    .setTitle(application.name);

                // Add questions as text inputs
                for (let i = 0; i < Math.min(application.questions.length, 5); i++) {
                    const question = application.questions[i];
                    const input = new TextInputBuilder()
                        .setCustomId(`question_${i}`)
                        .setLabel(question.label)
                        .setStyle(question.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
                        .setRequired(question.required)
                        .setMaxLength(question.maxLength);

                    const row = new ActionRowBuilder().addComponents(input);
                    modal.addComponents(row);
                }

                await interaction.showModal(modal);
            }

            // Handle modal submissions
            if (interaction.isModalSubmit() && interaction.customId.startsWith('submit_application_')) {
                const applicationId = interaction.customId.replace('submit_application_', '');
                
                await interaction.deferReply({ flags: 64 });

                const application = applicationManager.getApplication(interaction.guildId, applicationId);
                const verification = database.getVerification(interaction.user.id);

                // Collect responses
                const responses = [];
                for (let i = 0; i < application.questions.length; i++) {
                    const value = interaction.fields.getTextInputValue(`question_${i}`);
                    responses.push({
                        question: application.questions[i].label,
                        answer: value
                    });
                }

                // Save to database
                const appDbId = database.submitApplication(
                    interaction.user.id,
                    interaction.guildId,
                    applicationId,
                    verification.roblox_username,
                    verification.roblox_id,
                    responses
                );

                // Send to review channel
                const reviewChannel = interaction.guild.channels.cache.get(application.reviewChannelId);
                if (reviewChannel) {
                    const requiredRankDisplay = application.requiredRankDisplay || `Rank ${application.requiredRank}`;
                    const targetRankDisplay = application.targetRankDisplay || `Rank ${application.targetRank}`;

                    const reviewEmbed = new EmbedBuilder()
                        .setColor(0xffa500)
                        .setTitle(`📋 ${application.name} Application`)
                        .setDescription(`**Applicant:** ${interaction.user.tag} (${interaction.user.id})\n**Roblox:** ${verification.roblox_username}`)
                        .addFields({
                            name: 'Application ID',
                            value: `${appDbId}`,
                            inline: true
                        })
                        .addFields({
                            name: 'Status',
                            value: '⏳ Pending Review',
                            inline: true
                        })
                        .setTimestamp()
                        .setFooter({ text: `Submitted by ${interaction.user.tag}` });

                    // Get current rank
                    const serverConfig = configManager.getServerConfig(interaction.guildId);
                    if (serverConfig) {
                        const currentRankResult = await robloxService.getUserRankInGroup(
                            verification.roblox_id,
                            serverConfig.robloxGroupId
                        );
                        
                        if (currentRankResult.success) {
                            reviewEmbed.addFields({
                                name: 'Current Rank',
                                value: `${currentRankResult.rank} - ${currentRankResult.roleName}`,
                                inline: true
                            });
                        }
                    }

                    reviewEmbed.addFields({
                        name: 'Required Rank',
                        value: requiredRankDisplay,
                        inline: true
                    });

                    reviewEmbed.addFields({
                        name: 'Target Rank',
                        value: targetRankDisplay,
                        inline: true
                    });

                    // Add responses
                    for (const response of responses) {
                        reviewEmbed.addFields({
                            name: response.question,
                            value: response.answer,
                            inline: false
                        });
                    }

                    // Create review buttons
                    const acceptButton = new ButtonBuilder()
                        .setCustomId(`accept_app_${appDbId}`)
                        .setLabel('Accept')
                        .setStyle(ButtonStyle.Success);

                    const denyButton = new ButtonBuilder()
                        .setCustomId(`deny_app_${appDbId}`)
                        .setLabel('Deny')
                        .setStyle(ButtonStyle.Danger);

                    const row = new ActionRowBuilder().addComponents(acceptButton, denyButton);

                    await reviewChannel.send({
                        content: `${application.reviewerRoleIds.map(id => `<@&${id}>`).join(' ')}`,
                        embeds: [reviewEmbed],
                        components: [row],
                        allowedMentions: { parse: ['roles'] }
                    });
                }

                await interaction.editReply({
                    content: `✅ Your application for **${application.name}** has been submitted!\n\nStaff will review it soon.`
                });
            }

            // Handle accept button
            if (interaction.isButton() && interaction.customId.startsWith('accept_app_')) {
                const appDbId = parseInt(interaction.customId.replace('accept_app_', ''));

                await interaction.deferReply({ flags: 64 });

                const app = database.getApplication(appDbId);
                if (!app) {
                    return interaction.editReply({ content: '❌ Application not found in database.' });
                }

                if (app.status !== 'pending') {
                    return interaction.editReply({ content: '❌ This application has already been reviewed.' });
                }

                // Update status
                database.updateApplicationStatus(appDbId, 'accepted', interaction.user.id);

                // Get application config
                const application = applicationManager.getApplication(interaction.guildId, app.application_id);
                const serverConfig = applicationManager.getServerConfig(interaction.guildId);

                // Auto-rank if enabled and accepted
                if (application && application.autoRank) {
                    const serverConfigMain = configManager.getServerConfig(interaction.guildId);
                    if (serverConfigMain) {
                        await rankSyncService.syncUserInGuild(
                            interaction.client,
                            interaction.guildId,
                            app.user_id
                        );
                    }
                }

                // Update the review message
                const originalEmbed = interaction.message.embeds[0];
                const updatedEmbed = EmbedBuilder.from(originalEmbed)
                    .setColor(0x00ff00);

                // Update the Status field
                const fields = updatedEmbed.data.fields;
                const statusFieldIndex = fields.findIndex(f => f.name === 'Status');
                if (statusFieldIndex !== -1) {
                    fields[statusFieldIndex].value = `✅ Accepted by ${interaction.user.tag}`;
                }

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: []
                });

                // Notify applicant via DM
                try {
                    const applicant = await interaction.client.users.fetch(app.user_id);
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle('✅ Application Accepted')
                        .setDescription(`Your application for **${application ? application.name : 'Unknown'}** has been **accepted**!`)
                        .addFields({
                            name: 'Server',
                            value: interaction.guild.name,
                            inline: true
                        })
                        .setTimestamp();

                    if (application) {
                        if (application.autoRank) {
                            dmEmbed.addFields({
                                name: 'Next Steps',
                                value: 'Your rank has been automatically updated! Rejoin the server to see your new roles.',
                                inline: false
                            });
                        } else {
                            dmEmbed.addFields({
                                name: 'Next Steps',
                                value: 'A staff member will rank you shortly.',
                                inline: false
                            });
                        }
                    }

                    await applicant.send({ embeds: [dmEmbed] });
                } catch (error) {
                    console.log('[ApplicationHandler] Could not DM applicant:', error.message);
                }

                // Notify in notification channel
                if (serverConfig && serverConfig.notificationChannelId) {
                    const notificationChannel = interaction.guild.channels.cache.get(serverConfig.notificationChannelId);
                    if (notificationChannel) {
                        const notifEmbed = new EmbedBuilder()
                            .setColor(0x00ff00)
                            .setTitle('✅ Application Accepted')
                            .setDescription(`<@${app.user_id}>'s application for **${application ? application.name : 'Unknown'}** has been accepted by ${interaction.user.tag}!`)
                            .setTimestamp();

                        await notificationChannel.send({
                            content: `<@${app.user_id}>`,
                            embeds: [notifEmbed],
                            allowedMentions: { parse: ['users'] }
                        });
                    }
                }

                await interaction.editReply({
                    content: `✅ Application accepted successfully!`
                });
            }

            // Handle deny button - show modal for reason
            if (interaction.isButton() && interaction.customId.startsWith('deny_app_')) {
                const appDbId = interaction.customId.replace('deny_app_', '');

                // Check if application exists first
                const app = database.getApplication(parseInt(appDbId));
                if (!app) {
                    return interaction.reply({ 
                        content: '❌ Application not found in database.',
                        flags: 64 
                    });
                }

                if (app.status !== 'pending') {
                    return interaction.reply({ 
                        content: '❌ This application has already been reviewed.',
                        flags: 64 
                    });
                }

                // Show modal for denial reason
                const modal = new ModalBuilder()
                    .setCustomId(`deny_reason_${appDbId}`)
                    .setTitle('Denial Reason');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('denial_reason')
                    .setLabel('Why are you denying this application?')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000)
                    .setPlaceholder('Please provide a clear reason for the denial...');

                const row = new ActionRowBuilder().addComponents(reasonInput);
                modal.addComponents(row);

                await interaction.showModal(modal);
            }

            // Handle denial reason modal submission
            if (interaction.isModalSubmit() && interaction.customId.startsWith('deny_reason_')) {
                const appDbId = parseInt(interaction.customId.replace('deny_reason_', ''));
                const denialReason = interaction.fields.getTextInputValue('denial_reason');

                await interaction.deferReply({ flags: 64 });

                const app = database.getApplication(appDbId);
                if (!app) {
                    return interaction.editReply({ content: '❌ Application not found in database.' });
                }

                if (app.status !== 'pending') {
                    return interaction.editReply({ content: '❌ This application has already been reviewed.' });
                }

                // Update status
                database.updateApplicationStatus(appDbId, 'denied', interaction.user.id);

                // Get application config
                const application = applicationManager.getApplication(interaction.guildId, app.application_id);
                const serverConfig = applicationManager.getServerConfig(interaction.guildId);

                // Find and update the review message
                const reviewChannel = interaction.guild.channels.cache.get(application.reviewChannelId);
                if (reviewChannel) {
                    // Search for the message with this application
                    const messages = await reviewChannel.messages.fetch({ limit: 100 });
                    const reviewMessage = messages.find(msg => 
                        msg.embeds[0] && 
                        msg.embeds[0].fields && 
                        msg.embeds[0].fields.some(f => f.name === 'Application ID' && f.value === `${appDbId}`)
                    );

                    if (reviewMessage) {
                        const originalEmbed = reviewMessage.embeds[0];
                        const updatedEmbed = EmbedBuilder.from(originalEmbed)
                            .setColor(0xff0000);

                        // Update the Status field
                        const fields = updatedEmbed.data.fields;
                        const statusFieldIndex = fields.findIndex(f => f.name === 'Status');
                        if (statusFieldIndex !== -1) {
                            fields[statusFieldIndex].value = `❌ Denied by ${interaction.user.tag}`;
                        }

                        // Add denial reason field
                        updatedEmbed.addFields({
                            name: '❌ Denial Reason',
                            value: denialReason,
                            inline: false
                        });

                        await reviewMessage.edit({
                            embeds: [updatedEmbed],
                            components: []
                        });
                    }
                }

                // Notify applicant via DM
                try {
                    const applicant = await interaction.client.users.fetch(app.user_id);
                    const dmEmbed = new EmbedBuilder()
                        .setColor(0xff0000)
                        .setTitle('❌ Application Denied')
                        .setDescription(`Your application for **${application ? application.name : 'Unknown'}** has been **denied**.`)
                        .addFields({
                            name: 'Server',
                            value: interaction.guild.name,
                            inline: true
                        })
                        .addFields({
                            name: 'Reason',
                            value: denialReason,
                            inline: false
                        })
                        .addFields({
                            name: 'Reapplication',
                            value: 'You can reapply in **3 days**.',
                            inline: false
                        })
                        .setTimestamp();

                    await applicant.send({ embeds: [dmEmbed] });
                } catch (error) {
                    console.log('[ApplicationHandler] Could not DM applicant:', error.message);
                }

                // Notify in notification channel
                if (serverConfig && serverConfig.notificationChannelId) {
                    const notificationChannel = interaction.guild.channels.cache.get(serverConfig.notificationChannelId);
                    if (notificationChannel) {
                        const notifEmbed = new EmbedBuilder()
                            .setColor(0xff0000)
                            .setTitle('❌ Application Denied')
                            .setDescription(`<@${app.user_id}>'s application for **${application ? application.name : 'Unknown'}** has been denied by ${interaction.user.tag}.`)
                            .addFields({
                                name: 'Reason',
                                value: denialReason,
                                inline: false
                            })
                            .setTimestamp();

                        await notificationChannel.send({
                            content: `<@${app.user_id}>`,
                            embeds: [notifEmbed],
                            allowedMentions: { parse: ['users'] }
                        });
                    }
                }

                await interaction.editReply({
                    content: `✅ Application denied successfully.`
                });
            }

        } catch (error) {
            console.error('[Application InteractionCreate] Error:', error);
            
            if (interaction.isModalSubmit() || interaction.isButton()) {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: '❌ An error occurred processing this application.',
                        flags: 64
                    }).catch(() => {});
                } else if (interaction.deferred) {
                    await interaction.editReply({
                        content: '❌ An error occurred processing this application.'
                    }).catch(() => {});
                }
            }
        }
    }
};