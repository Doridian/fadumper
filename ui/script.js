'use strict';

function renderBBCode(bbcodeStr) {
    const element = document.createElement('span');
    element.innerText = bbcodeStr;
    return element;
}

function renderResult(hit) {
    const resultElement = document.createElement('span');

    const link = document.createElement('a');
    link.href = hit._source.image;
    link.target = '_blank';

    const imgUrl = hit._source.image;
    const ext = imgUrl.split('.').pop();
    switch (ext) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'bmp':
        case 'webp':
            const imgThumbnail = document.createElement('img');
            imgThumbnail.src = hit._source.image;
            imgThumbnail.width = 320;
            imgThumbnail.title = hit._source.description;
            link.appendChild(imgThumbnail);
            break;
        default:
            return undefined;
    }

    resultElement.appendChild(link);

    //resultElement.appendChild(document.createElement('br'));
    //resultElement.appendChild(renderBBCode(hit._source.description));
    return resultElement;
}

async function asyncSearch(query, size = 100, from = 0) {
    if (size < 1 || size > 1000) {
        alert('Size must be between 1 and 1000');
    }
    if (from < 0) {
        alert('From must be greater than or equal to 0');
    }

    const res = await fetch(`/api/v1/submissions?size=${size}&from=${from}`, {
        body: query,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
    });
    const data = await res.json();

    const fromEnd = from + data.hits.length - 1;
    const totalStr = `${data.total.relation} ${data.total.value}`;
    for (const ele of document.getElementsByClassName('result-total')) {
        ele.innerText = totalStr;
    }
    for (const ele of document.getElementsByClassName('result-start')) {
        ele.innerText = from;
    }
    for (const ele of document.getElementsByClassName('result-end')) {
        ele.innerText = fromEnd;
    }

    const resultsElement = document.getElementById('results');
    resultsElement.innerHTML = '';
    for (const hit of data.hits) {
        const res = renderResult(hit);
        if (res) {
            resultsElement.appendChild(res);
        }
    }
}

function firstPage() {
    document.getElementById('from').value = '0';
    runSearch();
}

function prevPage() {
    const from = parseIntInput('from');
    const size = parseIntInput('size');
    document.getElementById('from').value = Math.max(0, from - size);
    runSearch();
}

function nextPage() {
    const from = parseIntInput('from');
    const size = parseIntInput('size');
    document.getElementById('from').value = from + size;
    runSearch();
}

function parseIntInput(id) {
    const input = document.getElementById(id);
    return parseInt(input.value, 10);
}

function runSearch() {
    const query = document.getElementById('query').value;
    asyncSearch(query, parseIntInput('size'), parseIntInput('from')).catch(console.error);
}
