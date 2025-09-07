const interactionHandlers = require('../modules/interaction-handlers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('save')
        .setDescription('Add a new quote.')
        .addStringOption(option =>
            option.setName('author')
                .setDescription('The person(s) who said this quote')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('quote')
                .setDescription('What was said')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('date')
                .setDescription('When the quote was said (MM/DD/YYYY or MM-DD-YYYY). Default is today.')
                .setRequired(false)),    
    async execute (interaction) {
        await interactionHandlers.addHandler(interaction);
    }
};
