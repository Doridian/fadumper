'use strict';

function parseTerms(valStr) {
    const terms = [];

    const addTerm = (term) => {
        term = term.trim();
        if (!term) {
            return;
        }
        terms.push(term);
    };

    let i = 0;
    while (i < valStr.length) {
        const nextSpace = valStr.indexOf(' ', i);
        const nextQuote = valStr.indexOf('"', i);
        if (nextQuote >= 0 && (nextSpace < 0 || nextQuote < nextSpace)) {
            if (nextQuote > i) {
                addTerm(valStr.substring(i, nextQuote));
            }
            const quoteEnd = valStr.indexOf('"', nextQuote + 1);
            if (quoteEnd < 0) {
                addTerm(valStr.substring(nextQuote + 1));
                break;
            }
            i = quoteEnd + 1;
            addTerm(valStr.substring(nextQuote + 1, quoteEnd));
            continue;
        } else if (nextSpace < 0) {
            addTerm(valStr.substring(i));
            break;
        } else {
            addTerm(valStr.substring(i, nextSpace));
            i = nextSpace + 1;
        }
    }

    return terms;
}

function processEasySearch(valStr) {
    const terms = parseTerms(valStr);

    return terms;
}

function onEasySearch() {
    document.getElementById('query').value = JSON.stringify(processEasySearch(document.getElementById('easy').value), null, 2);
}