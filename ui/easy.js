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

function termToQuery(query, term, negate) {
    if (term.charAt(0) === '-') {
        termToQuery(query, term.substring(1), true);
        return;
    }

    const isWildcard = term.includes('*');

    const termQueryBool = [];

    const addFieldToQuery = (field) => {
        if (isWildcard) {
            termQueryBool.push({
                wildcard: {
                    [field]: {
                        value: term,
                    },
                },
            });
            return;
        }
        termQueryBool.push({
            term: {
                [field]: term,
            },
        });
    };

    addFieldToQuery('title');
    addFieldToQuery('tags');
    addFieldToQuery('description');
    addFieldToQuery('createdBy');
    addFieldToQuery('createdByUsername');
    addFieldToQuery('descriptionRefersToUsers');

    if (negate) {
        query.bool.must_not.push(...termQueryBool);
    } else {
        query.bool.must.push({
            bool: {
                should: termQueryBool,
            },
        });
    }
}

function processEasySearch(valStr) {
    const terms = parseTerms(valStr);

    const query = {
        bool: {
            must: [
                {
                    term: {
                        downloaded: true,
                    },
                }
            ],
            must_not: [],
        },
    };
    terms.forEach(term => termToQuery(query, term, false));
    return query;
}

function onEasySearch() {
    document.getElementById('query').value = JSON.stringify(processEasySearch(document.getElementById('easy').value), null, 2);
}