const interactionHandlers = require('../modules/interaction-handlers.js');
const queries = require('../database/queries.js');
const responseMessages = require('../response-messages.js');

describe('interaction handlers', () => {
    describe('#addHandler', () => {
        let interaction;

        beforeAll(() => {
            interaction = {
                options: {
                    getString: (string) => {
                        if (string === 'author') {
                            return 'author';
                        } else if (string === 'quote') {
                            return 'quote';
                        }

                        return null;
                    }
                },
                guildId: '123',
                reply: async (message) => { this.replied = true; },
                replied: false
            };

            spyOn(interaction, 'reply');
        });

        it('should echo back a successfully added quote', async () => {
            spyOn(queries, 'addQuote').and.callFake(async (quote, author, guildId) => {
                interaction.replied = false;
                return {
                    0: {
                        quotation: 'test',
                        author: 'jane doe',
                        said_at: '2022-02-02'
                    },
                    catch: (e) => {}
                };
            });

            await interactionHandlers.addHandler(interaction);

            expect(queries.addQuote).toHaveBeenCalledWith('quote', 'author', '123');
            expect(interaction.reply).toHaveBeenCalledWith('Added the following:\n\n_"test"_ - jane doe');
        });

        it('should throw a duplicate key exception', async () => {
            spyOn(queries, 'addQuote').and.callFake(async (quote, author, guildId) => {
                interaction.replied = true;
                throw 'duplicate key error';
            });
            try {
                await interactionHandlers.addHandler(interaction);
            } catch (e) {
                expect(queries.addQuote).toThrow();
                expect(interaction.reply).toHaveBeenCalledWith(responseMessages.DUPLICATE_QUOTE);
            }
        });

        it('should throw a generic exception', async () => {
            spyOn(queries, 'addQuote').and.callFake(async (quote, author, guildId) => {
                interaction.replied = true;
                throw 'could not connect to database';
            });
            try {
                await interactionHandlers.addHandler(interaction);
            } catch (e) {
                expect(queries.addQuote).toThrow();
                expect(interaction.reply).toHaveBeenCalledWith(responseMessages.GENERIC_ERROR);
            }
        });
    });

    describe('#randomHandler', () => {
        let interaction;

        beforeAll(() => {
            interaction = {
                options: {
                    getString: (string) => {
                        if (string === 'author') {
                            return null;
                        }
                    }
                },
                reply: async (message) => { this.replied = true; },
                replied: false,
                guildId: '123'
            };

            spyOn(interaction, 'reply');
        });

        it('should get a random quote from any author if the author is not provided', async () => {
            spyOn(queries, 'fetchAllQuotes').and.returnValue([
                {
                    author: 'jane',
                    said_at: '2022-02-02',
                    quotation: 'hi'
                }
            ]);

            await interactionHandlers.randomHandler(interaction);

            expect(queries.fetchAllQuotes).toHaveBeenCalledWith('123');
            expect(interaction.reply).toHaveBeenCalled();
        });

        it('should get a random quote from a specific author if the author is provided', async () => {
            spyOn(interaction.options, 'getString').and.returnValue('jane');

            spyOn(queries, 'getQuotesFromAuthor').and.returnValue([
                {
                    author: 'jane',
                    said_at: '2022-02-02',
                    quotation: 'hi'
                }
            ]);

            await interactionHandlers.randomHandler(interaction);

            expect(queries.getQuotesFromAuthor).toHaveBeenCalledWith('jane', '123');
            expect(interaction.reply).toHaveBeenCalled();
        });
    });
});
