let results = { match: [], diff: [], missing: [] };
let currentView = 'match';
let lastCompareTime = '';

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

function normalizeFilename(filename) {
    return filename
        .trim()
        .replace(/^[^\w\uAC00-\uD7A3\[]+/, '')
        .replace(/_[A-Za-z0-9]+절갠(?=\.[^.]+$|$)/, '');
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

function compareData() {
    const list1 = parseRawText(document.getElementById('input1').value);
    const list2 = parseRawText(document.getElementById('input2').value);

    results.match = [];
    results.diff = [];
    results.missing = [];

    const map2ByNormalizedTitle = new Map();
    list2.forEach(item => map2ByNormalizedTitle.set(normalizeFilename(item.filename), item));

    const checkedTitlesIn2 = new Set();

    list1.forEach(item1 => {
        const normalizedTitle = normalizeFilename(item1.filename);
        const item2 = map2ByNormalizedTitle.get(normalizedTitle);

        if (item2) {
            checkedTitlesIn2.add(normalizedTitle);
            if (item1.contentId === item2.contentId) {
                results.match.push(item1);
            } else {
                results.diff.push({ filename: normalizedTitle, side1: item1, side2: item2 });
            }
        } else {
            results.missing.push({ source: '1번 박스', item: item1 });
        }
    });

    list2.forEach(item2 => {
        const normalizedTitle = normalizeFilename(item2.filename);
        if (!checkedTitlesIn2.has(normalizedTitle)) {
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
        vTitle.innerHTML = `<div>1. 완벽 일치 리스트 <span class="badge bg-success">${results.match.length}건</span></div> ${timeHtml}`;
        tHead.innerHTML = `
            <tr>
                <th style="width: 45%;">파일명</th>
                <th style="width: 15%;">내부 파일 개수</th>
                <th style="width: 20%;">총 데이터 크기(Bytes)</th>
                <th style="width: 20%;">Contents-ID</th>
            </tr>`;

        if (results.match.length === 0) {
            tBody.innerHTML = `<tr><td colspan="4" class="text-muted">일치하는 내역이 존재하지 않습니다.</td></tr>`;
        } else {
            tBody.innerHTML = results.match.map(item => `
                <tr>
                    <td><strong>${item.filename}</strong></td>
                    <td>${item.fileCount}</td>
                    <td>${Number(item.size).toLocaleString()}</td>
                    <td><code>${item.contentId}</code></td>
                </tr>
            `).join('');
        }

    } else if (currentView === 'diff') {
        vTitle.innerHTML = `<div>2. 제목 일치 / Contents-ID 상이 리스트 <span class="badge bg-warning">${results.diff.length}건</span></div> ${timeHtml}`;
        tHead.innerHTML = `
            <tr>
                <th style="width: 40%;">비교 기준 제목</th>
                <th style="width: 12%;">구분</th>
                <th style="width: 13%;">내부 파일 개수</th>
                <th style="width: 15%;">데이터 크기(Bytes)</th>
                <th style="width: 20%;">Contents-ID</th>
            </tr>`;

        if (results.diff.length === 0) {
            tBody.innerHTML = `<tr><td colspan="5" class="text-muted">해당하는 불일치 내역이 없습니다.</td></tr>`;
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
        vTitle.innerHTML = `<div>3. 일치하는 제목이 없는 항목 리스트 <span class="badge bg-danger">${results.missing.length}건</span></div> ${timeHtml}`;
        tHead.innerHTML = `
            <tr>
                <th style="width: 20%;">발견 위치</th>
                <th style="width: 40%;">파일명</th>
                <th style="width: 12%;">파일 개수</th>
                <th style="width: 13%;">크기(Bytes)</th>
                <th style="width: 15%;">Contents-ID</th>
            </tr>`;

        if (results.missing.length === 0) {
            tBody.innerHTML = `<tr><td colspan="5" class="text-muted">어느 한쪽에도 누락된 데이터가 없이 완벽히 정렬되어 있습니다.</td></tr>`;
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
