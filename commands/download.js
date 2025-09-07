const interactionHandlers = require('../modules/interaction-handlers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('download')
        .setDescription('get a text file of the server quotes.'),
    async execute (interaction, guildManager) {
        await interactionHandlers.downloadHandler(interaction, guildManager);
    }
};