const interactionHandlers = require('../modules/interaction-handlers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('count')
        .setDescription('get the total number of quotes saved, optionally filtering by author.')
        .addStringOption(option =>
            option.setName('author')
                .setDescription('the author by which to get the number of quotes.')
                .setRequired(false)),
    async execute (interaction) {
        await interactionHandlers.countHandler(interaction);
    }
};
