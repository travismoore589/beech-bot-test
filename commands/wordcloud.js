const interactionHandlers = require('../modules/interaction-handlers.js');
const { slashCommandBuilder, SlashCommandBuilder } = require('@discordjs/builders');
const { execute } = require('./save');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('wordcloud')
    .setDescription('Make a word cloud using quotes from the server.')
    .addStringOption(option =>
        option.setName('author')
            .setDescription('Make a word cloud for a specified author.')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('font')
                .setDescription('Choose which font to use. Defaults to Century Gothic, Georgia, Rockwell, or Trebuchet MS.')
                .setRequired(false)),
    async execute (interaction) {
        await interactionHandlers.worldcloudHandler(interaction);
    }
};