const interactionHandlers = require('../modules/interaction-handlers.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('edit')
    .setDescription('edit quotes that match your search.')
    .addStringOption(option =>
      option.setName('search_string')
        .setDescription('a keyword or keyphrase by which to search for quotes.')
        .setRequired(true)),
  async execute(interaction) {
    await interactionHandlers.editHandler(interaction);
  }
};