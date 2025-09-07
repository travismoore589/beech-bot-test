const interactionHandlers = require('../modules/interaction-handlers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('search for quotes, optionally filtering by author.')
        .addStringOption(option =>
            option.setName('search_string')
                .setDescription('a keyword or keyphrase by which to search for quotes.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('author')
                .setDescription('narrow your search by author.')
                .setRequired(false)),
    async execute (interaction) {
        await interactionHandlers.searchHandler(interaction);
    }
};
