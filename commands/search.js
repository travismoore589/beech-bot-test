const { SlashCommandBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('search quotes by keyword or phrase.')
    .setDMPermission(false)
    .addStringOption(opt =>
      opt.setName('search_string')
        .setDescription('a keyword or keyphrase by which to search for quotes.')
        .setRequired(true)
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
Note: I’ve switched to flags for ephemeral (v14 deprecation warning goes away).

3) (If needed) Define a minimal searchHandler skeleton
If your searchHandler got lost, drop this inside modules/interaction-handlers.js (in the same style as your other handlers):

js
Copy code
async function searchHandler(interaction) {
  const searchString = interaction.options.getString('search_string')?.trim();
  try {
    const includeIdentifier = true; // or however you want to control this
    const searchResults = await queries.fetchQuotesBySearchString(searchString, interaction.guildId);

    let reply = '';
    if (!searchResults || searchResults.length === 0) {
      reply = responseMessages.EMPTY_QUERY;
    } else if (searchResults.length > 10) {
      reply = responseMessages.QUERY_TOO_GENERAL;
    } else {
      reply = `Your search for "${searchString}" returned **${searchResults.length}** quotes:\n\n`;
      for (const row of searchResults) {
        reply += (await utilities.formatQuote(row, true, includeIdentifier)) + '\n';
      }
    }

    // v14: use flags to make it ephemeral if you want; otherwise plain reply
    await interaction.reply(reply);
  } catch (e) {
    console.error('searchHandler error:', e);
    await interaction.reply(responseMessages.GENERIC_ERROR);
  }
}