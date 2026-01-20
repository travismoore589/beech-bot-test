const pool = require('./db');

module.exports = {

    fetchAllQuotes: (guildId) => {
        return query({
            text: 'SELECT * FROM quotes WHERE guild_id = $1;',
            values: [guildId]
        });
    },

    addQuote: (quote, author, guildId, date) => {
  // date is optional (expects MM/DD/YYYY or MM-DD-YYYY). If missing, defaults to today.
  return query({
    text: `
      INSERT INTO quotes (quotation, author, said_at, guild_id)
      VALUES (
        $1,
        $2,
        COALESCE(
          CASE
            WHEN $3 IS NULL OR btrim($3) = '' THEN NULL
            WHEN strpos($3, '-') > 0 THEN to_date($3, 'MM-DD-YYYY')
            ELSE to_date($3, 'MM/DD/YYYY')
          END,
          CURRENT_DATE
        ),
        $4
      )
      RETURNING quotation, author, said_at;
    `,
    values: [
      quote,
      author,
      date ?? null,
      guildId
    ]
  });
},

    getQuotesFromAuthor: (author, guildId) => {
        return query({
            text: 'SELECT * FROM quotes WHERE author = $1 AND guild_id = $2;',
            values: [author, guildId]
        });
    },

    fetchQuoteCount: (guildId) => {
        return query({
            text: 'SELECT COUNT(*) FROM quotes WHERE guild_id = $1;',
            values: [guildId]
        });
    },

    fetchQuoteCountByAuthor: (author, guildId) => {
        return query({
            text: 'SELECT COUNT(*) FROM quotes WHERE author = $1 AND guild_id = $2;',
            values: [author, guildId]
        });
    },

    fetchQuotesBySearchString: (searchString, guildId) => {
        return query({
            text: 'SELECT * FROM quotes WHERE quotation LIKE $1 AND guild_id = $2;',
            values: ['%' + searchString + '%', guildId]
        });
    },

    deleteQuoteById: (id, guildId) => {
        return query({
            text: 'DELETE FROM quotes WHERE id = $1 AND guild_id = $2 RETURNING *;',
            values: [id, guildId]
        });
    }

};

function query (queryParams) {
    return new Promise((resolve, reject) => {
        pool.connect().then((client) => client.query(queryParams, (err, res) => {
            if (err) {
                client.release();
                reject(err.message);
            } else {
                client.release();
                resolve(res.rows);
            }
        }));
    });
}
