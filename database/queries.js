const pool = require('./db');

module.exports = {

 fetchQuotesByAuthor: (author, guildId) => {
    return query({
        text: `
            SELECT quotation
            FROM quotes
            WHERE author = $1
              AND guild_id = $2;
        `,
        values: [author, guildId]
    });
},   

    fetchAllQuotes: (guildId) => {
        return query({
            text: 'SELECT * FROM quotes WHERE guild_id = $1;',
            values: [guildId]
        });
    },

    addQuote: (quote, author, guildId, date) => {
        return query({
            text: `
      INSERT INTO quotes (quotation, author, said_at, guild_id)
      VALUES (
        $1,
        $2,
        COALESCE(
          CASE
            WHEN $3::text IS NULL OR btrim($3::text) = '' THEN NULL::date
            WHEN strpos($3::text, '-') > 0 THEN to_date($3::text, 'MM-DD-YYYY')
            ELSE to_date($3::text, 'MM/DD/YYYY')
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
                date ?? null,   // IMPORTANT: null, not undefined
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

    fetchQuotesBySearchStringAndAuthor: (searchString, guildId, author) => {
        return query({
            text: 'SELECT * FROM quotes WHERE quotation LIKE $1 AND guild_id = $2 AND author = $3;',
            values: ['%' + searchString + '%', guildId, author]
        });
    },

    updateQuoteById: (id, guildId, fields) => {
    const quotation =
        typeof fields.quotation === 'string' && fields.quotation.trim() !== ''
            ? fields.quotation.trim()
            : null;

    const author =
        typeof fields.author === 'string' && fields.author.trim() !== ''
            ? fields.author.trim()
            : null;

    return query({
        text: `
            UPDATE quotes
            SET
                quotation = COALESCE($3, quotation),
                author    = COALESCE($4, author)
            WHERE id = $1 AND guild_id = $2
            RETURNING *;
        `,
        values: [id, guildId, quotation, author]
    });
},

fetchQuoteLeaderboard: (guildId, limit = 10) => {
    return query({
        text: `
            SELECT author, COUNT(*) AS count
            FROM quotes
            WHERE guild_id = $1
            GROUP BY author
            ORDER BY count DESC
            LIMIT $2;
        `,
        values: [guildId, limit]
    });
},

    deleteQuoteById: (id, guildId) => {
        return query({
            text: 'DELETE FROM quotes WHERE id = $1 AND guild_id = $2 RETURNING *;',
            values: [id, guildId]
        });
    }

};

function query(queryParams) {
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
