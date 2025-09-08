const responseMessages = require('./response-messages.js');
const queries = require('../database/queries.js');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const constants = require('./constants.js');
const utilities = require('./utilities.js');
const search = require('../commands/search.js');

// --- ADD THIS GUARDED BLOCK (1) ---
let wordcloudConstructor;        // your local wrapper (same folder)
try {
  wordcloudConstructor = require('./wordcloud-constructor.js');
} catch (e) {
  console.warn('[wordcloud] module not found; disabling wordcloud:', e.message);
}

let JSDOM, sharp;                // external libs used by the handler
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.warn('[wordcloud] jsdom not found; disabling wordcloud:', e.message); }

try { sharp = require('sharp'); }
catch (e) { console.warn('[wordcloud] sharp not found; disabling wordcloud:', e.message); }
// --- END ADD ---

module.exports = {

        helpHandler: async (interaction) => {
            console.info(`HELP command invoked by guild: ${interaction.guildId}`);
            try {
                await interaction.reply({
                    content: responseMessages.HELP_MESSAGE,
                    ephemeral: true
                });
            } catch (e) {
                console.error(e);
                await interaction.reply({
                    content: responseMessages.GENERIC_INTERACTION_ERROR,
                    ephemeral: true
                });
            }
        },

        downloadHandler: async (interaction, guildManager) => {
        console.info(`DOWNLOAD command invoked by guild: ${interaction.guildId}`);
        await interaction.deferReply({ ephemeral: true });
        let content = '';
        try {
            const allQuotesFromServer = await queries.fetchAllQuotes(interaction.guildId);
            if (allQuotesFromServer.length === 0) {
                await interaction.followUp('There haven\'t been any quotes saved from this server, so I didn\'t attach a file.');
                return;
            }
            for (const quote of allQuotesFromServer) {
                content += await utilities.formatQuote(
                    quote,
                    true,
                    true,
                    guildManager,
                    interaction
                ) + '\n';
            }
            const buffer = Buffer.from(content);
            await interaction.followUp({
                files: [new AttachmentBuilder(buffer, { name: 'quotes.txt' })],
                content: 'Here you go <:kermitGape:1406651455351558315> all the quotes saved from this server!',
                ephemeral: false
            });
        } catch (e) {
            console.error(e);
            await interaction.followUp({ content: responseMessages.GENERIC_INTERACTION_ERROR, ephemeral: true });
        }
    },
    
    addHandler: async (interaction) => {
        console.info(`ADD command invoked by guild: ${interaction.guildId}`);
        const author = interaction.options.getString('author').trim();
        const quote = interaction.options.getString('quote').trim();
        const date = interaction.options.getString('date')?.trim();
        await utilities.validateAddCommand(quote, author, date, interaction);
        console.info(`SAID BY: ${author}`);
        if (!interaction.replied) {
            const result = await queries.addQuote(quote, author, interaction.guildId, date).catch(async (e) => {
                if (e.message.includes('duplicate key')) {
                    await interaction.reply({
                        content: responseMessages.DUPLICATE_QUOTE,
                        ephemeral: true
                    });
                } else if (e.message.includes('date/time field value out of range')) {
                    await interaction.reply({ content: 'The date for your quote is invalid. Make sure it is in either MM/DD/YYYY or MM-DD-YYYY format.', ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Error adding your quote: ' + e.message, ephemeral: true});
                }
            });
            if (!interaction.replied) {
                await interaction.reply('Added the following:\n\n' + await utilities.formatQuote(result[0], date !== undefined));   
                }
            }
        },

    countHandler: async (interaction) => {
        console.info(`COUNT command invoked by guild: ${interaction.guildId}`);
        const author = interaction.options.getString('author')?.trim();
        try {
            const queryResult = author && author.length > 0
                ? await queries.fetchQuoteCountByAuthor(author, interaction.guildId)
                : await queries.fetchQuoteCount(interaction.guildId);
            if (queryResult.length > 0) {
                if (author) {
                    await interaction.reply('**' + author + '** has said **' + queryResult[0].count + '** quote(s).');
                } else {
                    await interaction.reply((queryResult[0].count === '1'
                        ? 'There is **1** quote.'
                        : 'There are **' + queryResult[0].count + '** quotes.'));
                }
            } else {
                await interaction.reply(responseMessages.QUOTE_COUNT_0);
            }
        } catch (e) {
            await interaction.reply(responseMessages.GENERIC_ERROR_COUNT_COMMAND);
        }
    },

    randomHandler: async (interaction) => {
        console.info(`RANDOM command invoked by guild: ${interaction.guildId}`);
        const author = interaction.options.getString('author')?.trim();
        try {
            const queryResult = author && author.length > 0
                ? await queries.getQuotesFromAuthor(author, interaction.guildId)
                : await queries.fetchAllQuotes(interaction.guildId);
            if (queryResult.length > 0) {
                const randomQuote = queryResult[Math.floor(Math.random() * queryResult.length)];
                await interaction.reply(await utilities.formatQuote(randomQuote, true));
            } else {
                await interaction.reply(responseMessages.NO_QUOTES_BY_AUTHOR);
            }
        } catch (e) {
            console.error(e);
            await interaction.reply(responseMessages.RANDOM_QUOTE_GENERIC_ERROR);
        }
    },

    searchHandler: async (interaction) => {
        console.info(`SEARCH command invoked by guild: ${interaction.guildId}`);
        await interaction.deferReply();
        let searchResults;
        try {
            searchResults = await utilities.getQuoteSearchResults(interaction);
        } catch (e) {
            console.error(e);
            await interaction.followUp({ content: responseMessages.GENERIC_INTERACTION_ERROR });
            return;
        }
        let reply = '';
        if (searchResults.length === 0) {
            reply += responseMessages.EMPTY_QUERY;
        } else if (searchResults.length > constants.MAX_SEARCH_RESULTS) {
            reply += responseMessages.QUERY_TOO_GENERAL;
        } else {
            for (const result of searchResults) {
                const quote = await utilities.formatQuote(result, true);
                reply += quote + '\n';
            }
        }

        if (!interaction.replied) {
            if (reply.length > constants.MAX_DISCORD_MESSAGE_LENGTH) {
                await interaction.followUp({ content: responseMessages.SEARCH_RESULT_TOO_LONG });
            } else {
                await interaction.followUp({ content: reply });
            }
        }
    },

    deleteHandler: async (interaction) => {
        await interaction.deferReply();
        console.info(`DELETE command invoked by guild: ${interaction.guildId}`);
        let searchResults;
        try {
            searchResults = await utilities.getQuoteSearchResults(interaction);
        } catch (e) {
            console.error(e);
            await interaction.followUp({ content: responseMessages.GENERIC_INTERACTION_ERROR });
            return;
        }
        if (searchResults.length === 0) {
            await interaction.followUp(responseMessages.EMPTY_QUERY);
            return;
        } else if (searchResults.length > constants.MAX_DELETE_SEARCH_RESULTS) {
            await interaction.followUp(responseMessages.DELETE_QUERY_TOO_GENERAL);
            return;
        }
        const replyComponents = await utilities.buildDeleteInteraction(searchResults);
        if (replyComponents.replyText.length > constants.MAX_DISCORD_MESSAGE_LENGTH) {
            await interaction.followUp({ content: responseMessages.DELETE_SEARCH_RESULT_TOO_LONG });
            return;
        }
        const response = await interaction.followUp({
            content: replyComponents.replyText,
            components: [new ActionRowBuilder().addComponents(replyComponents.buttons)]
        });
        const collectorFilter = i => i.user.id === interaction.user.id;
        try {
            const choice = await response.awaitMessageComponent({ filter: collectorFilter, time: 60_000 });
            queries.deleteQuoteById(choice.customId, interaction.guildId)
                .then(async (result) => {
                    if (result.length === 0) {
                        await choice.update({ content: responseMessages.NOTHING_DELETED, components: [] });
                    } else {
                        await choice.update({
                            content: 'The following quote was deleted: \n\n' +
                                await utilities.formatQuote(result[0], true),
                            components: []
                        });
                    }
                })
                .catch(async (e) => {
                    console.error(e);
                    await choice.update({ content: responseMessages.GENERIC_INTERACTION_ERROR, ephemeral: false, components: [] });
                });
        } catch (e) {
            await interaction.editReply({ content: 'A quote was not chosen within 60 seconds, so I cancelled the interaction.', components: [] });
        }
    },

    editHandler: async (interaction) => {
  console.info(`EDIT command invoked by guild: ${interaction.guildId}`);

  // must be in a server (guild)
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  // give us breathing room to search
  await interaction.deferReply();

  // 1) search (reuses your delete flow helper)
  let searchResults;
  try {
    searchResults = await utilities.getQuoteSearchResults(interaction);
  } catch (e) {
    console.error(e);
    await interaction.followUp({ content: responseMessages.GENERIC_INTERACTION_ERROR });
    return;
  }

  if (searchResults.length === 0) {
    await interaction.followUp(responseMessages.EMPTY_QUERY);
    return;
  } else if (searchResults.length > constants.MAX_DELETE_SEARCH_RESULTS) {
    await interaction.followUp(responseMessages.DELETE_QUERY_TOO_GENERAL);
    return;
  }

  // 2) build the list + buttons
  let content = `Found **${searchResults.length}** matching quote(s). Choose one to edit:\n\n`;
  for (const quote of searchResults) {
    content += (await utilities.formatQuote(quote, true, true)) + '\n';
  }

  const buttons = searchResults.map(q =>
    new ButtonBuilder()
      .setCustomId(`edit:${q.id}`)
      .setLabel(`Edit #${q.id}`)
      .setStyle(ButtonStyle.Primary)
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  const response = await interaction.followUp({
    content,
    components: rows
  });

  // 3) wait for the user's button click (defensive filter)
  const collectorFilter = (i) => {
    if (!i.isButton()) return false;
    if (i.message?.id !== response.id) return false;

    const clickerId = i.user?.id;
    const invokerId = interaction.user?.id;
    const cid = i.customId ?? '';

    if (!clickerId || !invokerId) return false;
    return clickerId === invokerId && cid.startsWith('edit:');
  };

  let choice;
  try {
    // give them up to 15 minutes to click
    choice = await response.awaitMessageComponent({
      filter: collectorFilter,
      time: 15 * 60_000
    });
  } catch (e) {
    try {
      await interaction.editReply({
        content: 'A quote was not chosen within 15 minutes, so I cancelled the interaction.',
        components: []
      });
    } catch (e2) { /* ignore */ }
    return;
  }

  const id = choice.customId.split(':')[1];

  // 4) prefill from the in-memory search results (no DB yet)
  const current = searchResults.find(q => String(q.id) === String(id));
  if (!current) {
    await choice.reply({ content: `Could not load quote #${id} for this server.`, ephemeral: true });
    return;
  }

  // 5) show modal immediately (ack the button within ~3s)
  const modal = new ModalBuilder()
    .setCustomId(`editModal:${id}`)
    .setTitle(`Edit Quote #${id}`);

  const quoteInput = new TextInputBuilder()
    .setCustomId('edit_quotation')
    .setLabel('New quote text (leave as-is if no change)')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setValue(current.quotation ?? '');

  const authorInput = new TextInputBuilder()
    .setCustomId('edit_author')
    .setLabel('New author (leave as-is if no change)')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(current.author ?? '');

  modal.addComponents(
    new ActionRowBuilder().addComponents(quoteInput),
    new ActionRowBuilder().addComponents(authorInput)
  );

  await choice.showModal(modal);

  // 6) wait for the modal submit (ack fast, then do DB)
  let submitted;
  try {
    submitted = await interaction.client.awaitModalSubmit({
      filter: (m) =>
        m.isModalSubmit() &&
        m.user?.id === interaction.user?.id &&
        m.customId === `editModal:${id}`,
      time: 120_000
    });
  } catch (e) {
    try { await response.edit({ components: [] }); } catch (e2) { /* ignore */ }
    return;
  }

  // acknowledge the submit so we have up to 15 mins for DB
  await submitted.deferReply({ ephemeral: true });

  // 7) read fields
  const newQuotation = submitted.fields.getTextInputValue('edit_quotation')?.trim();
  const newAuthor    = submitted.fields.getTextInputValue('edit_author')?.trim();

  // 8) no-change short-circuit
  const noChange =
    (newQuotation === (current.quotation ?? '')) &&
    (newAuthor === (current.author ?? ''));
  if (noChange) {
    await submitted.editReply({ content: 'No changes made.' });
    try { await response.edit({ components: [] }); } catch (e2) { /* ignore */ }
    return;
  }

  // 9) persist and show before/after
  let updatedRows;
  try {
    updatedRows = await queries.updateQuoteById(
      id,
      interaction.guildId,
      { quotation: newQuotation, author: newAuthor }
    );
  } catch (e) {
    console.error('updateQuoteById error:', e);
    await submitted.editReply({ content: responseMessages.GENERIC_INTERACTION_ERROR });
    return;
  }

  if (!updatedRows || updatedRows.length === 0) {
    await submitted.editReply({ content: 'Update failed or nothing was updated.' });
    return;
  }

  const beforeBlock = await utilities.formatQuote(current, true);
  const afterBlock  = await utilities.formatQuote(updatedRows[0], true);

  await submitted.editReply([
    `**Quote ${id} updated.**`,
    '',
    '**Before**',
    beforeBlock,
    '',
    '**After**',
    afterBlock
  ].join('\n'));

  // optional: remove buttons in the original list message
  try { await response.edit({ components: [] }); } catch (e2) { /* ignore */ }
},

    // inside module.exports = { ... }

wordcloudHandler: async (interaction) => {
  console.info(`WORDCLOUD command invoked by guild: ${interaction.guildId}`);

  // If any dependency is missing, exit gracefully BEFORE deferring.
  if (!wordcloudConstructor || !JSDOM || !sharp) {
    const { MessageFlags } = require('discord.js');
    await interaction.reply({
      content: 'Wordcloud feature is not available on this deployment.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  await interaction.deferReply(); // we’ll edit this later

  const author = interaction.options.getString('author')?.trim();
  const quotesForCloud = (author && author.length > 0)
    ? await queries.getQuotesFromAuthor(author, interaction.guildId)
    : await queries.fetchAllQuotes(interaction.guildId);

  if (!quotesForCloud || quotesForCloud.length === 0) {
    const { MessageFlags } = require('discord.js');
    // since we deferred, use editReply (you can’t mark edited replies ephemeral;
    // send a follow-up ephemeral instead if you prefer keeping it private)
    await interaction.editReply('There were no quotes to generate a word cloud.');
    await interaction.followUp({
      content: 'Tip: use `/save` to add quotes, then try again.',
      flags: MessageFlags.Ephemeral
    });
    return;
  }

  try {
    const nodeDocument = new JSDOM().window.document;
    const wordsWithOccurrences = utilities.mapQuotesToFrequencies(quotesForCloud);

    // your module can be a value or a promise; await works either way
    const constructor = await wordcloudConstructor;

    const initializationResult = constructor.initialize(
      wordsWithOccurrences
        .sort((a, b) => a.frequency >= b.frequency ? -1 : 1)
        .slice(0, constants.MAX_WORDCLOUD_WORDS),
      constants.WORDCLOUD_SIZE,
      nodeDocument,
      interaction.options.getString('font')?.toLowerCase().trim()
    );

    initializationResult.cloud.on('end', () => {
      const d3 = constructor.draw(
        initializationResult.cloud,
        initializationResult.words,
        nodeDocument.body,
        interaction.options.getString('font')?.toLowerCase().trim()
      );

      const buffer = Buffer.from(
        d3.select(nodeDocument.body).node().innerHTML.toString()
      );

      sharp(buffer)
        .resize(constants.WORDCLOUD_SIZE, constants.WORDCLOUD_SIZE)
        .png()
        .toBuffer()
        .then(async (data) => {
          let content = author && author.length > 0
            ? `Here’s a word cloud for quotes said by “${author}”!`
            : `Here’s a word cloud generated from all quotes!`;

          const reqFont = interaction.options.getString('font')?.toLowerCase().trim();
          if (reqFont && !constructor.CONFIG.FONTS[reqFont]) {
            content += ' I can’t use that font. Available fonts: Arial, Baskerville Old Face, Calibri, Century Gothic, Comic Sans MS, Consolas, Courier New, Georgia, Impact, Rockwell, Segoe UI, Tahoma, Times New Roman, Trebuchet MS, Verdana.';
          }

          // Since we deferred, edit the original reply with the image
          await interaction.editReply({
            files: [new AttachmentBuilder(data, { name: 'wordcloud.png' })],
            content
          });
        })
        .catch(async (err) => {
          console.error(err);
          await interaction.editReply({ content: responseMessages.GENERIC_INTERACTION_ERROR });
        });
    });

    initializationResult.cloud.start();
  } catch (e) {
    console.error(e);
    await interaction.editReply({ content: responseMessages.GENERIC_INTERACTION_ERROR });
  }
}
};