const { SlashCommandBuilder } = require('@discordjs/builders');

let interactionHandlers;
try {
  interactionHandlers = require('../modules/interaction-handlers.js');
} catch (e) {
  console.warn('[wordcloud] interaction-handlers load error:', e.message);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('wordcloud')
    .setDescription('Generate a word cloud from saved quotes.')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('author')
        .setDescription('Generate wordcloud for specific author')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!interactionHandlers?.wordcloudHandler) {
      const { MessageFlags } = require('discord.js');

      await interaction.reply({
        content: 'Wordcloud feature is not available on this deployment.',
        flags: MessageFlags.Ephemeral
      });

      return;
    }

    await interactionHandlers.wordcloudHandler(interaction);
  }
};
