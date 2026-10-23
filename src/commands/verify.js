const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify using the Roblox account linked to your Foundation portal'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0xffffff)
            .setTitle('Foundation Account Verification')
            .setDescription(
                'Open the personnel portal, sign in with **Discord**, then connect your **Roblox** account.\n\n' +
                'Once both accounts are linked, the bot will automatically apply your existing nickname and role sync.'
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Open Personnel Portal')
                .setURL('https://janiqzscpf.info/account')
        );

        await interaction.reply({ embeds: [embed], components: [row], flags: 64 });
    }
};
