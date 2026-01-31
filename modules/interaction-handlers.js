const responseMessages = require('./response-messages.js');
const queries = require('../database/queries.js');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const constants = require('./constants.js');
const utilities = require('./utilities.js');

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

recapHandler: async (interaction) => {
  console.info(`RECAP command invoked by guild: ${interaction.guildId} channel: ${interaction.channelId}`);

  // Only works in text-based channels
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased?.()) {
    await interaction.reply({ content: 'This command can only be used in a text channel.', ephemeral: true });
    return;
  }

  const maxMessages = Math.min(interaction.options.getInteger('messages') ?? 150, 300);
  const hours = interaction.options.getInteger('hours'); // optional
  const sinceTs = hours ? (Date.now() - hours * 60 * 60 * 1000) : null;

  await interaction.deferReply();

  // --- helpers (no extra deps) ---
  const STOPWORDS = new Set([
    'a','an','and','are','as','at','be','but','by','for','from','has','have','he','her','his','i','if','in','into',
    'is','it','its','just','me','my','no','not','of','on','or','our','she','so','than','that','the','their','them',
    'then','there','these','they','this','to','too','up','us','was','we','were','what','when','where','who','why',
    'will','with','you','your','yours','im','dont','cant','didnt','doesnt','wont','ok','yeah','lol','lmao'
  ]);

  const clean = (s) =>
    String(s || '')
      .replace(/https?:\/\/\S+/g, ' ')         // remove links (we track them separately)
      .replace(/<@!?(\d+)>/g, ' ')             // remove mentions
      .replace(/<#[0-9]+>/g, ' ')
      .replace(/<a?:\w+:\d+>/g, ' ')          // custom emojis
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')     // keep letters/numbers/apostrophe
      .toLowerCase()
      .trim();

  const tokenize = (s) =>
    clean(s)
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOPWORDS.has(t));

  const chunkText = (text, limit = 1900) => {
    const chunks = [];
    let i = 0;
    while (i < text.length) {
      chunks.push(text.slice(i, i + limit));
      i += limit;
    }
    return chunks;
  };

  // --- fetch messages from THIS channel ---
  let fetched = [];
  try {
    let lastId;
    while (fetched.length < maxMessages) {
      const batch = await channel.messages.fetch({ limit: Math.min(100, maxMessages - fetched.length), before: lastId });
      if (!batch.size) break;

      const arr = Array.from(batch.values());
      fetched.push(...arr);

      lastId = arr[arr.length - 1].id;

      // stop early if we hit time window
      if (sinceTs && arr[arr.length - 1].createdTimestamp < sinceTs) break;
    }
  } catch (e) {
    console.error('recap fetch error:', e);
    await interaction.editReply('❌ I couldn’t read message history in this channel (missing permissions?).');
    return;
  }

  // Filter to human messages, within time window, non-empty
  let messages = fetched
    .filter(m => !m.author?.bot)
    .filter(m => (sinceTs ? m.createdTimestamp >= sinceTs : true))
    .filter(m => (m.content && m.content.trim().length > 0))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp); // chronological

  if (messages.length < 5) {
    await interaction.editReply('Not enough recent messages to summarize in this channel.');
    return;
  }

  // --- compute stats, keywords, highlights ---
  const userCounts = {};
  const wordCounts = {};
  const linkCounts = {};
  const allTokensByMsg = [];

  const urlRegex = /(https?:\/\/\S+)/g;

  for (const m of messages) {
    userCounts[m.author.id] = (userCounts[m.author.id] || 0) + 1;

    const links = m.content.match(urlRegex);
    if (links) {
      for (const l of links) linkCounts[l] = (linkCounts[l] || 0) + 1;
    }

    const toks = tokenize(m.content);
    allTokensByMsg.push(toks);

    for (const t of toks) {
      wordCounts[t] = (wordCounts[t] || 0) + 1;
    }
  }

  const topUsers = Object.entries(userCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, c]) => `<@${id}> (${c})`);

  const topKeywords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w, c]) => `${w}(${c})`);

  const topLinks = Object.entries(linkCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([l, c]) => `${l} (${c})`);

  // Score messages by keyword density (simple extractive highlight selection)
  const keywordSet = new Set(Object.entries(wordCounts).sort((a,b)=>b[1]-a[1]).slice(0, 12).map(x => x[0]));

  const scored = messages.map((m, idx) => {
    const toks = allTokensByMsg[idx];
    let score = 0;
    for (const t of toks) if (keywordSet.has(t)) score += 1;
    // small boost if contains a link (often important)
    if (urlRegex.test(m.content)) score += 2;
    // prefer medium-length messages
    const len = m.content.length;
    if (len > 40 && len < 300) score += 2;
    return { m, score };
  });

  const highlights = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ m }) => {
      const ts = new Date(m.createdTimestamp).toLocaleString();
      const text = m.content.length > 180 ? m.content.slice(0, 177) + '…' : m.content;
      return `• **${m.author.username}**: ${text}`;
    });

  // Build a “text recap” paragraph
  const start = new Date(messages[0].createdTimestamp).toLocaleString();
  const end = new Date(messages[messages.length - 1].createdTimestamp).toLocaleString();

  const recap =
`🧾 **Channel Recap** (#${channel.name})
**Window:** ${start} → ${end}
**Messages summarized:** ${messages.length}

**Main themes:** ${topKeywords.length ? topKeywords.join(', ') : 'N/A'}
**Most active:** ${topUsers.length ? topUsers.join(', ') : 'N/A'}

**Highlights**
${highlights.join('\n')}
${topLinks.length ? `\n**Links mentioned:**\n${topLinks.map(l => `• ${l}`).join('\n')}` : ''}`;

  // Send, chunk if needed
  const parts = chunkText(recap, 1900);
  await interaction.editReply(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    await interaction.followUp({ content: parts[i] });
  }
},

leaderboardHandler: async (interaction) => {
    console.info(`LEADERBOARD command invoked by guild: ${interaction.guildId}`);

    await interaction.deferReply();

    try {
        const results = await queries.fetchQuoteLeaderboard(
            interaction.guildId,
            10
        );

        if (!results.length) {
            await interaction.editReply('No quotes found for this server.');
            return;
        }

        let message = '🏆 **Quote Leaderboard** 🏆\n\n';

        results.forEach((row, index) => {
            message +=
                `${index + 1}. **${row.author}** — ${row.count} quotes\n`;
        });

        await interaction.editReply(message);

    } catch (err) {
        console.error('Leaderboard error:', err);

        await interaction.editReply(
            '❌ Error generating leaderboard.'
        );
    }
},

    downloadHandler: async (interaction, guildManager) => {
    console.info(`DOWNLOAD command invoked by guild: ${interaction.guildId}`);

    // Defer so Discord doesn't timeout
    await interaction.deferReply();

    try {
        const allQuotes = await queries.fetchAllQuotes(interaction.guildId);

        if (!allQuotes.length) {
            await interaction.editReply('No quotes found for this server.');
            return;
        }

        // CSV header
        let csv = 'ID,Quote,Author,Date\n';

        // Helper to escape CSV values
        const escapeCSV = (value) => {
            if (value === null || value === undefined) return '';
            const str = value.toString().replace(/"/g, '""');
            return `"${str}"`;
        };

        // Build rows
        for (const quote of allQuotes) {
            csv += [
                escapeCSV(quote.id),
                escapeCSV(quote.quotation),
                escapeCSV(quote.author),
                escapeCSV(quote.said_at)
            ].join(',') + '\n';
        }

        const buffer = Buffer.from(csv, 'utf8');

        // Send CSV file
        await interaction.editReply({
            content: '📄 Here is your quote export (CSV format):',
            files: [
                new AttachmentBuilder(buffer, {
                    name: 'quotes.csv'
                })
            ]
        });

    } catch (err) {
        console.error('CSV download error:', err);

        await interaction.editReply(
            '❌ There was an error generating the CSV file.'
        );
    }
},

    
    addHandler: async (interaction) => {
  console.info(`ADD command invoked by guild: ${interaction.guildId}`);

  const author = interaction.options.getString('author', true).trim();
  const quote  = interaction.options.getString('quote', true).trim();
  const dateRaw = interaction.options.getString('date'); // may be null
  const date = dateRaw ? dateRaw.trim() : null;

  // Validate (only if your validator expects it). Stop if it replied.
  try {
    await utilities.validateAddCommand(quote, author, date, interaction);
    if (interaction.replied || interaction.deferred) return;
  } catch (e) {
    console.error('validateAddCommand error:', e);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: responseMessages.GENERIC_INTERACTION_ERROR, ephemeral: true });
    }
    return;
  }

  console.info(`SAID BY: ${author}`);

  try {
    const result = await queries.addQuote(quote, author, interaction.guildId, date);

    // Use the returned row to display the stored date (after parsing/defaulting)
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(
        'Added the following:\n\n' + await utilities.formatQuote(result[0], true)
      );
    }
  } catch (e) {
    console.error(e);

    if (interaction.replied || interaction.deferred) return;

    const msg = String(e?.message ?? e);

    if (msg.includes('duplicate key')) {
      await interaction.reply({ content: responseMessages.DUPLICATE_QUOTE, ephemeral: true });
    } else if (msg.includes('date/time field value out of range')) {
      await interaction.reply({
        content: 'The date for your quote is invalid. Make sure it is in either MM/DD/YYYY or MM-DD-YYYY format.',
        ephemeral: true
      });
    } else {
      await interaction.reply({ content: 'Error adding your quote: ' + msg, ephemeral: true });
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

  // guild-only? (optional)
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  // Defer, then edit the same reply instead of mixing followUp
  await interaction.deferReply();

  let searchResults;
  try {
    searchResults = await utilities.getQuoteSearchResults(interaction);
  } catch (e) {
    console.error(e);
    await interaction.editReply({ content: responseMessages.GENERIC_INTERACTION_ERROR });
    return;
  }

  // limit results (define this in constants if you haven’t)
  const MAX = Number(constants?.MAX_SEARCH_RESULTS ?? 10);

  if (!searchResults || searchResults.length === 0) {
    await interaction.editReply(responseMessages.EMPTY_QUERY);
    return;
  }
  if (searchResults.length > MAX) {
    await interaction.editReply(responseMessages.QUERY_TOO_GENERAL);
    return;
  }

  // build reply
  let reply = '';
  for (const result of searchResults) {
    reply += (await utilities.formatQuote(result, true)) + '\n';
  }

  if (reply.length > constants.MAX_DISCORD_MESSAGE_LENGTH) {
    await interaction.editReply({ content: responseMessages.SEARCH_RESULT_TOO_LONG });
  } else {
    await interaction.editReply({ content: reply });
  }
},

    deleteHandler: async (interaction) => {
    console.info(`DELETE command invoked by guild: ${interaction.guildId}`);

    await interaction.deferReply();

    let searchResults;
    try {
        searchResults = await utilities.getQuoteSearchResults(interaction);
    } catch (e) {
        console.error(e);
        await interaction.editReply({ content: responseMessages.GENERIC_INTERACTION_ERROR, components: [] });
        return;
    }

    if (searchResults.length === 0) {
        await interaction.editReply({ content: responseMessages.EMPTY_QUERY, components: [] });
        return;
    } else if (searchResults.length > constants.MAX_DELETE_SEARCH_RESULTS) {
        await interaction.editReply({ content: responseMessages.DELETE_QUERY_TOO_GENERAL, components: [] });
        return;
    }

    const replyComponents = await utilities.buildDeleteInteraction(searchResults);

    if (replyComponents.replyText.length > constants.MAX_DISCORD_MESSAGE_LENGTH) {
        await interaction.editReply({ content: responseMessages.DELETE_SEARCH_RESULT_TOO_LONG, components: [] });
        return;
    }

    // Use editReply so the deferred message becomes the interactive one.
    const response = await interaction.editReply({
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
                await choice.update({ content: responseMessages.GENERIC_INTERACTION_ERROR, components: [] });
            });

    } catch (e) {
        await interaction.editReply({
            content: 'A quote was not chosen within 60 seconds, so I cancelled the interaction.',
            components: []
        });
    }
},


    editHandler: async (interaction) => {
  console.info(`EDIT command invoked by guild: ${interaction.guildId}`);

  // Guild-only guard
  if (!interaction.guildId) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  // Give us time to search
  await interaction.deferReply();

  // 1) Search results (reuse your helper)
  let searchResults;
  try {
    searchResults = await utilities.getQuoteSearchResults(interaction);
  } catch (e) {
    console.error(e);
    await interaction.editReply({ content: responseMessages.GENERIC_INTERACTION_ERROR });
    return;
  }

  if (!searchResults || searchResults.length === 0) {
    await interaction.editReply(responseMessages.EMPTY_QUERY);
    return;
  }
  if (searchResults.length > constants.MAX_DELETE_SEARCH_RESULTS) {
    await interaction.editReply(responseMessages.DELETE_QUERY_TOO_GENERAL);
    return;
  }

  // 2) Build listing + buttons
  let content = `Found **${searchResults.length}** matching quote(s). Choose one to edit:\n\n`;
  for (const q of searchResults) {
    content += (await utilities.formatQuote(q, true, true)) + '\n';
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

  // Show the list on the original deferred reply
  const response = await interaction.editReply({
    content,
    components: rows
  });

  // 3) Wait for the invoker to click one of OUR edit buttons
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
    // Let them take up to 15 minutes to choose
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
    } catch {}
    return;
  }

  const id = choice.customId.split(':')[1];

  // 4) Prefill from in-memory results (no DB yet)
  const current = searchResults.find(q => String(q.id) === String(id));
  if (!current) {
    await choice.reply({ content: `Could not load quote #${id} for this server.`, ephemeral: true });
    return;
  }

  // 5) Build and show the modal IMMEDIATELY (this acknowledges the button)
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

  // 6) Wait for the modal submit — listen defensively and ACK fast
  const { Events } = require('discord.js');
  const client = interaction.client;

  const submitted = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off(Events.InteractionCreate, onInteraction);
      reject(new Error('Modal submit timed out'));
    }, 120_000); // 2 minutes

    const onInteraction = (i) => {
      try {
        if (!i || typeof i.isModalSubmit !== 'function' || !i.isModalSubmit()) return;
        const cid = i.customId ?? '';
        const submitterId = i.user?.id;
        const invokerId = interaction.user?.id;
        if (!submitterId || !invokerId) return;
        if (submitterId !== invokerId) return;
        if (cid !== `editModal:${id}`) return;

        clearTimeout(timeout);
        client.off(Events.InteractionCreate, onInteraction);
        resolve(i);
      } catch (err) {
        console.error('modal submit handler error (ignored):', err);
      }
    };

    client.on(Events.InteractionCreate, onInteraction);
  }).catch(async () => {
    try {
      await response.edit({
        content: 'A quote was not chosen within 2 minutes, so I cancelled the interaction.',
        components: []
      });
    } catch {}
    return null;
  });

  if (!submitted) return;

  // ACK the modal submit immediately (gives you ~15 minutes)
  try {
    await submitted.deferReply({ ephemeral: true });
  } catch (e) {
    console.error('deferReply on modal submit failed:', e);
    return;
  }

  // 7) Read fields
  const newQuotation = submitted.fields.getTextInputValue('edit_quotation')?.trim();
  const newAuthor    = submitted.fields.getTextInputValue('edit_author')?.trim();

  // 8) No-change short-circuit
  const noChange =
    (newQuotation === (current.quotation ?? '')) &&
    (newAuthor === (current.author ?? ''));
  if (noChange) {
    await submitted.editReply({ content: 'No changes made.' });
    try { await response.edit({ components: [] }); } catch {}
    return;
  }

  // 9) Persist and show before/after
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

  // Optional: remove the buttons on the original list message
  try { await response.edit({ components: [] }); } catch {}
},

    // inside module.exports = { ... }

wordcloudHandler: async (interaction) => {
  console.info(`WORDCLOUD command invoked by guild: ${interaction.guildId}`);

  // If any dependency is missing, exit gracefully
  if (!wordcloudConstructor || !JSDOM || !sharp) {
    const { MessageFlags } = require('discord.js');

    await interaction.reply({
      content: 'Wordcloud feature is not available on this deployment.',
      flags: MessageFlags.Ephemeral
    });

    return;
  }

  await interaction.deferReply();

  const author = interaction.options.getString('author')?.trim();

  let quotesForCloud;

  // ---- Fetch quotes safely ----
  try {
    if (author && author.length > 0) {
      quotesForCloud = await queries.fetchQuotesByAuthor(
        author,
        interaction.guildId
      );
    } else {
      quotesForCloud = await queries.fetchAllQuotes(
        interaction.guildId
      );
    }
  } catch (err) {
    console.error('Wordcloud DB error:', err);

    await interaction.editReply(
      '❌ Error retrieving quotes for wordcloud.'
    );

    return;
  }

  // ---- No data case ----
  if (!quotesForCloud || quotesForCloud.length === 0) {
    await interaction.editReply(
      'There were no quotes to generate a word cloud.'
    );

    return;
  }

  try {
    const nodeDocument = new JSDOM().window.document;

    // Convert quotes → word frequencies
    const wordsWithOccurrences =
      utilities.mapQuotesToFrequencies(quotesForCloud);

    const constructor = await wordcloudConstructor;

    const initializationResult = constructor.initialize(
      wordsWithOccurrences
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, constants.MAX_WORDCLOUD_WORDS),

      constants.WORDCLOUD_SIZE,
      nodeDocument,

      interaction.options
        .getString('font')
        ?.toLowerCase()
        .trim()
    );

    initializationResult.cloud.on('end', () => {
      const d3 = constructor.draw(
        initializationResult.cloud,
        initializationResult.words,
        nodeDocument.body,

        interaction.options
          .getString('font')
          ?.toLowerCase()
          .trim()
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
            ? `☁️ Wordcloud for quotes by **${author}**`
            : `☁️ Wordcloud for all quotes`;

          const reqFont = interaction.options
            .getString('font')
            ?.toLowerCase()
            .trim();

          if (reqFont && !constructor.CONFIG.FONTS[reqFont]) {
            content +=
              '\n⚠️ Unknown font requested. Using default.';
          }

          await interaction.editReply({
            files: [
              new AttachmentBuilder(data, {
                name: 'wordcloud.png'
              })
            ],
            content
          });
        })

        .catch(async (err) => {
          console.error('Sharp error:', err);

          await interaction.editReply(
            responseMessages.GENERIC_INTERACTION_ERROR
          );
        });
    });

    initializationResult.cloud.start();

  } catch (e) {
    console.error('Wordcloud generation error:', e);

    await interaction.editReply(
      responseMessages.GENERIC_INTERACTION_ERROR
    );
  }
},
};
