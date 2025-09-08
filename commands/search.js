const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search quotes by keyword or phrase.')
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName('search_string')
        .setDescription('a keyword or keyphrase by which to search for quotes.')
        .setRequired(true)
    .addStringOption(opt =>
        opt.setName('author')
        .setDescription('narrow your search by author.')
        .setRequired(false)
    )
    ),
  async execute(interaction) {
    // Lazy-require to avoid circular require timing
    let interactionHandlers;
    try {
      interactionHandlers = require('../modules/interaction-handlers.js');
    } catch (e) {
      console.error('[search] failed to load interaction-handlers:', e);
      await interaction.reply({
        content: 'Search is unavailable right now.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (typeof interactionHandlers?.searchHandler !== 'function') {
      console.warn('[search] searchHandler missing on interaction-handlers export.');
      await interaction.reply({
        content: 'Search is unavailable right now.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    await interactionHandlers.searchHandler(interaction);
  }
};