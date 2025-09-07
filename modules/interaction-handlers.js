const responseMessages = require('./response-messages.js');
const queries = require('../database/queries.js');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');
const constants = require('./constants.js');
const utilities = require('./utilities.js');
const search = require('../commands/search.js');

module.exports = {

        helpHandler: async (interaction) => {
            console.info(`HELP command invoked by guild: ${interaction.guildID}`);
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
        console.info(`ADD command invoked by guild: ${interaction.guildID}`);
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
        console.info(`COUNT command invoked by guild: ${interaction.guildID}`);
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
        console.info(`RANDOM command invoked by guild: ${interaction.guildID}`);
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
        console.info(`SEARCH command invoked by guild: ${interaction.guildID}`);
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
        } else if (searchResults.length > constants.MAX_DELETE_SEARCH_RESULTS) {
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
        console.info(`EDIT command invoked by guild: ${interaction.guildID}`);
        await interaction.deferReply();

        let searchResults;
        try {
            searchResults = await utilities.getQuoteSearchResults(interaction);
        }   catch (e) {
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

        let content = `Found **${searchResults.length}** matching quote(s). Choose one to edit:\n\n`;
        for (const quote of searchResults) {
            content += (await utilities.formatQuote(quote, true, true)) + `\n`;
        }

        const buttons = searchResults.map(quote =>
            new ButtonBuilder()
            .setCustomId(`edit:${quote.id}`)
            .setLabel(`Edit #${quote.id}`)
            .setStyle(ButtonStyle.Primary)
        );

        const rows =[];
        for (let i = 0; i < buttons.length; i += 5) {
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
        }

        const response = await interaction.followUp({
            content,
            components: rows
        });

        const collectorFilter = i => i.user.id === interaction.user.id && i.custom.Id.startsWith(`edit`);
        let choice;
        try {
            choice = await response.awaitMessageComponent({ filter: collectorFilter, time: 60_000 });
        } catch {
          await interaction.editReply({ content: `A quote was not chosen within 60 seconds, so I cancelled teh interaction.`, components: [] });
          return;
        }
        const id = choice.customId.split(':')[1];

        const current = searchResults.find(quote => String(quote.id) === String(id));
        if (!current) {
            await choice.reply({ content: `Could not load quote #${id} for this server.`, ephemeral: true });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`editModal:${id}`)
            .setTitle(`Edit Quote #${id}`);

        const quoteInput = new TextInputBuilder()
            .setCustomId(`edit_quotation`)
            .setLabel(`new quote text (leave as-is if no change)`)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(current.quotation ?? ``);

        const authorInput = new TextInputBuilder()
            .setCustomId(`edit_author`)
            .setLabel(`new author (leave as-is if no change)`)
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setValue(current.quotation ?? ``);
            
        modal.addComponents(
            new ActionRowBuilder().addComponents(quoteInput),
            new ActionRowBuilder().addComponents(authorInput)
        );

        await choice.showModal(modal);

        let submitted;
        try {
            submitted = await interaction.client.awaitModalSubmit({
                filter: (m) => m.user.id === interaction.user.id && m.customId === `editModal:${id}`,
                time: 120_00
            });
        } catch {
          try { await response.edit({ components: [] }); } catch {}
          return;
        }

        const newQuotation = submitted.fields.getTextInputValue(`edit_quotation`)?.trim();
        const newAuthor = submitted.fields.getTextInputValue(`edit_author`)?.trim();

        const noChange =
            (new Quotation === (current.quotation ?? ``)) &&
            (newAuthor === (current.author ?? ``));
        if (noChange) {
            await submitted.reply({ content: `No changes made.`, ephemeral: true });
            try { await response.edit({ components: [] }); } catch {}
            return;
        }

        try {
            const before = current;

            const updatedRows = await queries.updateQuoteById(
                id,
                interaction.guildID,
                { quotation: newQuotation, author: newAuthor }
            );

            if (!updatedRows || updatedRows.length === 0) {
                await submitted.reply({ content: `Update failed.`, ephemeral: true });
                try { await response.edit({ components: [] }); } catch {}
                return;
            }

            const beforeBlock = await utilities.formatQuote(before, true);
            const afterBlock = await utilities.formatQuote(updatedRows[0], true);

            await submitted.reply({
                content: [
                    `**Quote ${id} updated.`,
                    '',
                    `**Before**`,
                    beforeBlock,
                    ``,
                    `**After**`,
                    '',
                    afterBlock
                ].join('\n')
            });

            try { await response.edit({ components: [] }); } catch {}
        } catch (e) {
            console.error(e);
            await submitted.reply({ content: responseMessages.GENERIC_INTERACTION_ERROR, ephemeral: true });
        }
        },

    wordcloudHandler: async (interaction) => {
        console.info(`WORDCLOUD command invoked by guild: ${interaction.guildId}`);
        await interaction.deferReply();
        const author = interaction.options.getString('author')?.trim();
        const quotesForCloud = author && author.length > 0
        ? await queries.getQuotesFromAuthor(author, interaction.guildId)
        : await queries.fetchAllQuotes(interaction.guildId);
    if (quotesForCloud.length === 0) {
        await interaction.followUp({
            content: 'There were no quotes to generate a word cloud.',
            ephemeral: true
        });
        return;
    }
    try {
        const nodeDocument = new JSDOM().window.document;
        const wordsWithOccurrences = utilities.mapQuotesToFrequencies(quotesForCloud);
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
            const buffer = Buffer.from(d3.select(nodeDocument.body).node().innerHTML.toString());
            sharp(buffer)
                .resize(constants.WORDCLOUD_SIZE, constants.WORDCLOUD_SIZE)
                .png()
                .toBuffer()
                .then(async data => {
                    let content = author && author.length > 0
                        ? 'Here\'s a word cloud for quotes said by "' + author + '"!'
                        : 'Here\'s a word cloud generated from all quotes!';
                    if (interaction.options.getString('font')
                        && !constructor.CONFIG.FONTS[interaction.options.getString('font')?.toLowerCase().trim()]) {
                        content += 'I can\'t use that font. Here are the available fonts: Arial, Baskerville Old Face, Calibri, Century Gothic, Comic Sans MS, Consolas, Courier New, Georgia, Impact, Rockwell, Segoe UI, Tahoma, Times New Roman, Trebuchet MS, Verdana.';
                    }
                    await interaction.followUp({
                        files: [new AttachmentBuilder(data, {name: 'wordcloud.png' })],
                        content
                    });
                })
                .catch(async err => {
                    console.error(err);
                    await interaction.followUp({
                        content: responseMessages.GENERIC_INTERACTION_ERROR
                    });
                });
        });
        initializationResult.cloud.start();
    } catch (e) {
        console.error(e);
        await interaction.followUp({
            content: responseMessages.GENERIC_INTERACTION_ERROR
        });
    }
    }
};