const { SlashCommandBuilder } = require('discord.js');
const handlers = require('../modules/interaction-handlers');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Show top quote authors'),

    async execute(interaction) {
        await handlers.leaderboardHandler(interaction);
    }
};
