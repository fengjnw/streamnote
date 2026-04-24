/**
 * Text formatting helpers shared by StreamNote UI.
 */
class TextFormatters {
    static escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    static formatSummaryDisplay(summary, style) {
        if (!summary) return '';

        switch (style) {
            case 'key_takeaways':
                return TextFormatters.formatKeyTakeaways(summary);
            case 'q&a':
                return TextFormatters.formatQAFormat(summary);
            case 'paragraph':
            default:
                return TextFormatters.formatParagraph(summary);
        }
    }

    static formatParagraph(summary) {
        return `<p>${summary.replace(/\n/g, '<br>')}</p>`;
    }

    static formatKeyTakeaways(summary) {
        const lines = summary.split(/\n/).filter(line => line.trim().length > 0);
        const items = lines
            .map(line => line.replace(/^[-•*]\s*/, '').trim())
            .filter(line => line.length > 0);

        if (items.length === 0) {
            return `<p>${summary.replace(/\n/g, '<br>')}</p>`;
        }

        const listHTML = items
            .map(item => `<li>${item.replace(/\n/g, '<br>')}</li>`)
            .join('');
        return `<ul>${listHTML}</ul>`;
    }

    static formatQAFormat(summary) {
        const lines = summary.split(/\n/).filter(line => line.trim().length > 0);
        let html = '';
        let question = '';

        for (const line of lines) {
            if (line.trim().match(/^Q:|^问:|^Question:/i)) {
                if (question) {
                    html += `<div class="qa-pair"><div class="qa-question">${question}</div></div>`;
                }
                question = line.replace(/^Q:|^问:|^Question:/i, '').trim();
            } else if (line.trim().match(/^A:|^答:|^Answer:/i)) {
                if (question) {
                    const answer = line.replace(/^A:|^答:|^Answer:/i, '').trim();
                    html += `<div class="qa-pair"><div class="qa-question">${question}</div><div class="qa-answer">${answer.replace(/\n/g, '<br>')}</div></div>`;
                    question = '';
                }
            }
        }

        if (question) {
            html += `<div class="qa-pair"><div class="qa-question">${question}</div></div>`;
        }

        return html || `<p>${summary.replace(/\n/g, '<br>')}</p>`;
    }
}

window.TextFormatters = TextFormatters;
