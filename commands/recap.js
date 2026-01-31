const { SlashCommandBuilder } = require('discord.js')
const handlers = require('../modules/interaction-handlers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recap')
    .setDescription('Summarize recent conversation in this channel')
    .addIntegerOption(option =>
      option
        .setName('messages')
        .setDescription('How many recent messages to summarize (max 300)')
        .setRequired(false)
        .setMinValue(25)
        .setMaxValue(300)
    )
    .addIntegerOption(option =>
      option
        .setName('hours')
        .setDescription('Only include messages from the last X hours (1-168)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(168)
    )
    .setDMPermission(false),

  async execute(interaction) {
    await handlers.recapHandler(interaction);
  }
};