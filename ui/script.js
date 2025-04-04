'use strict';

function renderBBCode(bbcodeStr) {
    const element = document.createElement('span');
    element.innerText = bbcodeStr;
    return element;
}

function renderResult(hit) {
    const fileUrl = hit._source.fileLocal;

    const resultElement = document.createElement('span');

    const link = document.createElement('a');
    link.href = `https://www.furaffinity.net/view/${hit._source.id}/`;
    link.target = '_blank';
    link.onclick = (e) => {
        e.stopPropagation();
        window.open(fileUrl, '_blank');
        return false;
    };

    const titleText = `[TITLE]\n${hit._source.title}\n\n[DESCRIPTION]\n${hit._source.description}`;

    const ext = fileUrl.split('.').pop();
    switch (ext) {
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif':
        case 'bmp':
        case 'webp':
            const imgThumbnail = document.createElement('img');
            imgThumbnail.src = fileUrl;
            imgThumbnail.width = 320;
            imgThumbnail.title = titleText;
            link.appendChild(imgThumbnail);
            break;
        case 'swf':
        case 'fla':
            const descFlash = document.createElement('p');
            descFlash.title = titleText;
            descFlash.innerText = 'Flash content';
            link.appendChild(descFlash);
            break;
        default:
            return undefined;
    }

    resultElement.appendChild(link);

    //resultElement.appendChild(document.createElement('br'));
    //resultElement.appendChild(renderBBCode(hit._source.description));
    return resultElement;
}

let latestSearchHolder = undefined;

async function asyncSearch(query, searchHolder, size, from) {
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
    if (searchHolder !== latestSearchHolder) {
        return;
    }
    const data = await res.json();
    if (searchHolder !== latestSearchHolder) {
        return;
    }
    if (res.status !== 200) {
        alert(`Search failed: ${data.error ?? JSON.stringify(data)}`);
        return;
    }

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

function handleSearchDone(searchHolder) {
    if (searchHolder !== latestSearchHolder) {
        return;
    }
    latestSearchHolder = undefined;
    document.title = 'Idle - FADumper';
}

function handleSearchStart() {
    document.title = 'Searching... - FADumper';
    latestSearchHolder = Symbol('SearchHolder');
    return latestSearchHolder;
}

function handleSearchError(err) {
    alert('Search error:\n' + err);
    console.error('Search error', err);
}

function runSearch() {
    const query = document.getElementById('query').value;
    const searchHolder = handleSearchStart();
    asyncSearch(query, searchHolder, parseIntInput('size'), parseIntInput('from'))
        .catch(handleSearchError)
        .then(() => {
            handleSearchDone(searchHolder);
        });
}
