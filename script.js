let results = { match: [], diff: [], missing: [] };
let currentView = 'match';
let lastCompareTime = '';

const FILENAME_SIMILARITY_THRESHOLD = 0.72;

function parseRawText(text) {
    const lines = text.split('\n');
    const dataList = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('파일명') || trimmed.includes('Contents-ID')) return;

        let tokens = trimmed.split('\t');
        if (tokens.length < 4) tokens = trimmed.split(/\s{2,}/);

        if (tokens.length >= 4) {
            dataList.push({
                filename: tokens[0].trim(),
                fileCount: tokens[1].trim(),
                size: tokens[2].trim(),
                contentId: tokens[3].trim()
            });
        }
    });
    return dataList;
}

function normalizeContentId(contentId) {
    return String(contentId || '').trim().toUpperCase();
}

function normalizeFilename(filename) {
    return String(filename || '')
        .trim()
        .replace(/^[^\w\uAC00-\uD7A3\[]+/, '')
        .replace(/\.[^.]+$/, '')
        .replace(/_[^_]+절갠$/i, '')
        .replace(/[\[\](){}]/g, '')
        .replace(/[\s_\-!.,:;]+/g, '')
        .toLowerCase();
}

function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a) return b.length;
    if (!b) return a.length;

    const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    const curr = new Array(b.length + 1);

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(
                curr[j - 1] + 1,
                prev[j] + 1,
                prev[j - 1] + cost
            );
        }
        for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
    }
    return prev[b.length];
}

function getFilenameSimilarity(filename1, filename2) {
    const a = normalizeFilename(filename1);
    const b = normalizeFilename(filename2);
    if (!a && !b) return 1;
    if (!a || !b) return 0;
    if (a === b) return 1;

    const maxLength = Math.max(a.length, b.length);
    return 1 - (levenshteinDistance(a, b) / maxLength);
}

function getFormattedTimestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function buildContentIdIndex(list) {
    const index = new Map();
    list.forEach((item, idx) => {
        const key = normalizeContentId(item.contentId);
        if (!index.has(key)) index.set(key, []);
        index.get(key).push({ item, idx });
    });
    return index;
}

function compareData() {
    const list1 = parseRawText(document.getElementById('input1').value);
    const list2 = parseRawText(document.getElementById('input2').value);

    results.match = [];
    results.diff = [];
    results.missing = [];

    const matched1 = new Set();
    const matched2 = new Set();
    const contentIdIndex2 = buildContentIdIndex(list2);

    // 1순위: Contents-ID가 같으면 파일명이 다르거나 유사하지 않아도 동일 파일로 판정
    list1.forEach((item1, idx1) => {
        const candidates = contentIdIndex2.get(normalizeContentId(item1.contentId)) || [];
        const candidate = candidates
            .filter(entry => !matched2.has(entry.idx))
            .sort((a, b) => getFilenameSimilarity(item1.filename, b.item.filename) - getFilenameSimilarity(item1.filename, a.item.filename))[0];

        if (candidate) {
            matched1.add(idx1);
            matched2.add(candidate.idx);
            results.match.push({
                filename: item1.filename,
                side1: item1,
                side2: candidate.item,
                similarity: getFilenameSimilarity(item1.filename, candidate.item.filename)
            });
        }
    });

    // 2순위: 아직 매칭되지 않은 항목끼리 파일명이 같거나 유사하지만 Contents-ID가 다른 경우를 의심 목록으로 분류
    const unmatched1 = list1
        .map((item, idx) => ({ item, idx }))
        .filter(entry => !matched1.has(entry.idx));
    const unmatched2 = list2
        .map((item, idx) => ({ item, idx }))
        .filter(entry => !matched2.has(entry.idx));

    unmatched1.forEach(entry1 => {
        const best = unmatched2
            .filter(entry2 => !matched2.has(entry2.idx))
            .map(entry2 => ({
                ...entry2,
                similarity: getFilenameSimilarity(entry1.item.filename, entry2.item.filename)
            }))
            .filter(entry2 => entry2.similarity >= FILENAME_SIMILARITY_THRESHOLD)
            .sort((a, b) => b.similarity - a.similarity)[0];

        if (best) {
            matched1.add(entry1.idx);
            matched2.add(best.idx);
            results.diff.push({
                filename: normalizeFilename(entry1.item.filename) || entry1.item.filename,
                side1: entry1.item,
                side2: best.item,
                similarity: best.similarity
            });
        }
    });

    // 3순위: Contents-ID도 다르고 파일명도 충분히 유사하지 않은 항목은 한쪽에만 존재하는 데이터로 분류
    list1.forEach((item1, idx1) => {
        if (!matched1.has(idx1)) {
            results.missing.push({ source: '1번 박스', item: item1 });
        }
    });

    list2.forEach((item2, idx2) => {
        if (!matched2.has(idx2)) {
            results.missing.push({ source: '2번 박스', item: item2 });
        }
    });

    const total = results.match.length + results.diff.length + results.missing.length;
    document.getElementById('count-total').innerText = total;
    document.getElementById('count-match').innerText = results.match.length;
    document.getElementById('count-diff').innerText = results.diff.length;
    document.getElementById('count-missing').innerText = results.missing.length;

    lastCompareTime = getFormattedTimestamp();

    renderView();
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.nav-card').forEach(card => card.classList.remove('active'));
    document.querySelector(`.${viewName}-card`).classList.add('active');
    renderView();
}

function renderView() {
    const tHead = document.getElementById('table-head');
    const tBody = document.getElementById('table-body');
    const vTitle = document.getElementById('viewport-title');

    if (results.match.length === 0 && results.diff.length === 0 && results.missing.length === 0) {
        return;
    }

    const timeHtml = lastCompareTime ? `<span class="time-stamp">검증시간: ${lastCompareTime}</span>` : '';

    if (currentView === 'match') {
        vTitle.innerHTML = `<div>1. Contents-ID 일치 리스트 <span class="badge bg-success">${results.match.length}건</span></div> ${timeHtml}`;
        tHead.innerHTML = `
            <tr>
                <th style="width: 32%;">1번 파일명</th>
                <th style="width: 32%;">2번 파일명</th>
                <th style="width: 10%;">파일명 유사도</th>
                <th style="width: 10%;">내부 파일 개수</th>
                <th style="width: 16%;">Contents-ID</th>
            </tr>`;

        if (results.match.length === 0) {
            tBody.innerHTML = `<tr><td colspan="5" class="text-muted">Contents-ID가 일치하는 내역이 존재하지 않습니다.</td></tr>`;
        } else {
            tBody.innerHTML = results.match.map(group => `
                <tr>
                    <td><strong>${group.side1.filename}</strong></td>
                    <td><strong>${group.side2.filename}</strong></td>
                    <td>${Math.round(group.similarity * 100)}%</td>
                    <td>${group.side1.fileCount} / ${group.side2.fileCount}</td>
                    <td><code>${group.side1.contentId}</code></td>
                </tr>
            `).join('');
        }

    } else if (currentView === 'diff') {
        vTitle.innerHTML = `<div>2. 파일명 유사 / Contents-ID 상이 리스트 <span class="badge bg-warning">${results.diff.length}건</span></div> ${timeHtml}`;
        tHead.innerHTML = `
            <tr>
                <th style="width: 33%;">비교 기준 파일명</th>
                <th style="width: 10%;">구분</th>
                <th style="width: 10%;">유사도</th>
                <th style="width: 12%;">내부 파일 개수</th>
                <th style="width: 15%;">데이터 크기(Bytes)</th>
                <th style="width: 20%;">Contents-ID</th>
            </tr>`;

        if (results.diff.length === 0) {
            tBody.innerHTML = `<tr><td colspan="6" class="text-muted">파일명은 같거나 유사하지만 Contents-ID가 다른 내역이 없습니다.</td></tr>`;
        } else {
            let html = '';
            results.diff.forEach(group => {
                html += `
                    <tr style="background-color: #fafafa;">
                        <td rowspan="2" style="vertical-align: middle; border-bottom: 2px solid var(--border-color);">
                            <strong>${group.filename}</strong>
                            <div class="small text-muted mt-1">1번: ${group.side1.filename}</div>
                            <div class="small text-muted">2번: ${group.side2.filename}</div>
                        </td>
                        <td style="color:#0d6efd; font-weight:bold;">1번 데이터</td>
                        <td rowspan="2" style="vertical-align: middle; border-bottom: 2px solid var(--border-color);">${Math.round(group.similarity * 100)}%</td>
                        <td>${group.side1.fileCount}</td>
                        <td>${Number(group.side1.size).toLocaleString()}</td>
                        <td><span class="diff-text">${group.side1.contentId}</span></td>
                    </tr>
                    <tr style="border-bottom: 2px solid var(--border-color);">
                        <td style="color:#6c757d; font-weight:bold;">2번 데이터</td>
                        <td>${group.side2.fileCount}</td>
                        <td>${Number(group.side2.size).toLocaleString()}</td>
                        <td><span class="diff-text">${group.side2.contentId}</span></td>
                    </tr>
                `;
            });
            tBody.innerHTML = html;
        }

    } else if (currentView === 'missing') {
        vTitle.innerHTML = `<div>3. Contents-ID/파일명 유사도 모두 미일치 리스트 <span class="badge bg-danger">${results.missing.length}건</span></div> ${timeHtml}`;
        tHead.innerHTML = `
            <tr>
                <th style="width: 20%;">발견 위치</th>
                <th style="width: 40%;">파일명</th>
                <th style="width: 12%;">파일 개수</th>
                <th style="width: 13%;">크기(Bytes)</th>
                <th style="width: 15%;">Contents-ID</th>
            </tr>`;

        if (results.missing.length === 0) {
            tBody.innerHTML = `<tr><td colspan="5" class="text-muted">누락으로 분류된 데이터가 없습니다.</td></tr>`;
        } else {
            tBody.innerHTML = results.missing.map(m => `
                <tr>
                    <td style="color: ${m.source === '1번 박스' ? '#0d6efd' : '#dc3545'}; font-weight:bold;">${m.source}에만 존재</td>
                    <td><strong>${m.item.filename}</strong></td>
                    <td>${m.item.fileCount}</td>
                    <td>${Number(m.item.size).toLocaleString()}</td>
                    <td><code>${m.item.contentId}</code></td>
                </tr>
            `).join('');
        }
    }
}
