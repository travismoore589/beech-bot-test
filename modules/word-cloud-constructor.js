const cloud = require('d3-cloud');
const randomColor = require('randomcolor');

const CONFIG = {
    FONT_SIZE_EXPONENT: 3,
    MIN_FONT_SIZE: 25,
    MAX_FONT_SIZE: 100,
    WORD_PADDING: 5,
    WORD_ROTATION: () => { return 0; },
    COLORS: null,
    FONTS: {
        arial: 'Arial',
        verdana: 'Verdana',
        tahoma: 'Tahoma',
        'trebuchet ms': 'Trebuchet MS',
        trebuchet: 'Trebuchet MS',
        impact: 'Impact',
        'times new roman': 'Times New Roman',
        times: 'Times New Roman',
        georgia: 'Georgia',
        baskerville: 'Baskerville Old Face',
        'baskerville old face': 'Baskerville Old Face',
        courier: 'Courier New',
        'courier new': 'Courier New',
        'comic sans': 'Comic Sans MS',
        'comic sans ms': 'Comic Sans MS',
        calibri: 'Calibri',
        'century gothic': 'Century Gothic',
        consolas: 'Consolas',
        rockwell: 'Rockwell',
        'segoe ui': 'Segoe UI',
        segoe: 'Segoe UI'
    },
    DEFAULT_FONTS: [
        'Century Gothic',
        'Rockwell',
        'Georgia',
        'Trebuchet MS'
    ]
};

module.exports = import('d3').then((d3) => {
    return {
        initialize: (wordsWithOccurrences, size, nodeDocument, font) => {
            const wordcloud = cloud();
            CONFIG.COLORS = randomColor({
                luminosity: 'light',
                count: 3
            });
            wordcloud
                .size([size, size])
                .words(wordsWithOccurrences = wordsWithOccurrences.map(function (d) {
                    return {
                        text: d.word,
                        size: CONFIG.MIN_FONT_SIZE +
                            Math.min(Math.pow(d.frequency, CONFIG.FONT_SIZE_EXPONENT), CONFIG.MAX_FONT_SIZE)
                    };
                }))
                .padding(CONFIG.WORD_PADDING)
                .rotate(CONFIG.WORD_ROTATION)
                .timeInterval(10)
                .font(CONFIG.FONTS[font] || CONFIG.DEFAULT_FONTS[
                    Math.floor(Math.random() * CONFIG.DEFAULT_FONTS.length)])
                .canvas(() => nodeDocument.createElement('canvas'))
                .fontSize(function (d) {
                    return d.size;
                });

            return { cloud: wordcloud, words: wordsWithOccurrences, config: CONFIG };
        },

        draw: (wordcloud, words, element, font) => {
            d3.select(element).append('svg')
                .attr('preserveAspectRatio', 'xMinYMin meet')
                .attr('width', wordcloud.size()[0])
                .attr('height', wordcloud.size()[1])
                .attr('xmlns', 'http://www.w3.org/2000/svg')
                .attr('viewBox', '0 0 ' + wordcloud.size()[0] + ' ' + wordcloud.size()[1])
                .append('g')
                .attr('transform', 'translate(' + wordcloud.size()[0] / 2 + ',' + wordcloud.size()[1] / 2 + ')')
                .selectAll('text')
                .data(words)
                .enter().append('text')
                .style('font-size', function (d) {
                    return d.size + 'px';
                })
                .style('font-family', CONFIG.FONTS[font] || CONFIG.DEFAULT_FONTS[
                    Math.floor(Math.random() * CONFIG.DEFAULT_FONTS.length)])
                .style('fill', () => {
                    return CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];
                })
                .attr('text-anchor', 'middle')
                .attr('transform', function (d) {
                    return 'translate(' + [d.x, d.y] + ')rotate(' + d.rotate + ')';
                })
                .text(function (d) {
                    return d.text;
                });

            return d3;
        },
        CONFIG
    };
});