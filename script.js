let results = { match: [], nameMismatch: [], contentDiff: [], missing: [] };
let currentView = 'match';
let lastCompareTime = '';

// 1. 깨진 줄바꿈 복원 및 텍스트 파싱 로직
function parseRawText(text) {
    if (!text) return [];
    const lines = text.split('\n');
    const dataList = [];
    let buffer = '';

    lines.forEach(line => {
        let trimmed = line.trim();
        // 헤더 및 메타데이터 행 제외
        if (!trimmed || trimmed.startsWith('파일명') || trimmed.includes('Contents-ID') || trimmed.startsWith('.trim(),
            fileCount: tokens[1].trim(),
            size: tokens[2].trim(),
            contentId: tokens[3].trim()
        });
    });
    return dataList;
}

// 2. 비교를 위한 제목 정규화 (특수문자, 접미어, 확장자, 공백 제거)
function normalizeTitle(filename) {
    let title = filename;
    title = title.replace(/[◆◇■□▲▼○●]/g, ''); 
    title = title.replace(/_CA절갠/g, '');        
    title = title.replace(/\.epub$/i, '');       
    title = title.replace(/\s+/g, '');           
    return title;
}

function getFormattedTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
}

// 3. 메인 데이터 분석 로직
function compareData() {
    const list1 = parseRawText(document.getElementById('input1').value);
    const list2 = parseRawText(document.getElementById('input2').value);

    results.match = [];
    results.nameMismatch = [];
    results.contentDiff = [];
    results.missing = [];

    // 매칭 속도 향상을 위한 Map 자료구조 구성
    const map2ById = new Map();
    list2.forEach(item => map2ById.set(item.contentId, item));

    const map2ByNormTitle = new Map();
    list2.forEach(item => map2ByNormTitle.set(normalizeTitle(item.filename), item));

    const matchedIdsIn2 = new Set();
    const matchedNormTitlesIn2 = new Set();

    // 1번 데이터 기준 매칭 검증
    list1.forEach(item1 => {
        const normTitle1 = normalizeTitle(item1.filename);
        const item2ById = map2ById.get(item1.contentId);
        
        if (item2ById) {
            matchedIdsIn2.add(item2ById.contentId);
            matchedNormTitlesIn2.add(normalizeTitle(item2ById.filename));

            if (item1.filename === item2ById.filename) {
                // [1단계] 완벽 일치 (파일명 & ID 모두 동일)
                results.match.push(item1);
            } else {
                // [2단계] 데이터 일치 / 파일명 상이 (ID 동일, 파일명 다름)
                results.nameMismatch.push({ side1: item1, side2: item2ById });
            }
        } else {
            const item2ByTitle = map2ByNormTitle.get(normTitle1);
            
            if (item2ByTitle) {
                matchedIdsIn2.add(item2ByTitle.contentId);
                matchedNormTitlesIn2.add(normalizeTitle(item2ByTitle.filename));
                
                // [3단계] 동일 작품 내용 변경 (제목은 일치, ID 변경됨)
                results.contentDiff.push({ side1: item1, side2: item2ByTitle });
            } else {
                // [4단계] 1번 박스 누락 데이터
                results.missing.push({ source: '1번 박스', item: item1 });
            }
        }
    });

    // 2번 데이터 중 미매칭된 항목 추출 (2번 박스 누락 데이터)
    list2.forEach(item2 => {
        const normTitle2 = normalizeTitle(item2.filename);
        if (!matchedIdsIn2.has(item2.contentId) && !matchedNormTitlesIn2.has(normTitle2)) {
            results.missing.push({ source: '2번 박스', item: item2 });
        }
    });

    // 대시보드 카운터 렌더링
    const total = results.match.length + results.nameMismatch.length + results.contentDiff.length + results.missing.length;
    document.getElementById('count-total').innerText = total;
    document.getElementById('count-match').innerText = results.match.length;
    document.getElementById('count-namemismatch').innerText = results.nameMismatch.length;
    document.getElementById('count-contentdiff').innerText = results.contentDiff.length;
    document.getElementById('count-missing').innerText = results.missing.length;

    lastCompareTime = getFormattedTimestamp();
    renderView();
}

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.nav-card').forEach(card => card.classList.remove('active'));
    document.querySelector('.' + viewName + '-card').classList.add('active');
    renderView();
}

// 4. 뷰포트 테이블 출력 렌더러
function renderView() {
    const tHead = document.getElementById('table-head');
    const tBody = document.getElementById('table-body');
    const vTitle = document.getElementById('viewport-title');

    if (lastCompareTime === '') return;
    const timeHtml = '<span class="time-stamp">검증시간: ' + lastCompareTime + '</span>';

    if (currentView === 'match') {
        vTitle.innerHTML = '<div>1. 완벽 일치 내역 <span class="badge bg-success">' + results.match.length + '건</span></div> ' + timeHtml;
        tHead.innerHTML = '<tr><th style="width: 45%;">파일명</th><th style="width: 15%;">내부 파일 개수</th><th style="width: 20%;">총 데이터 크기(Bytes)</th><th style="width: 20%;">Contents-ID</th></tr>';
        
        if (results.match.length === 0) {
            tBody.innerHTML = '<tr><td colspan="4" class="text-muted">완벽히 일치하는 내역이 없습니다.</td></tr>';
        } else {
            tBody.innerHTML = results.match.map(item => 
                '<tr><td><strong>' + item.filename + '</strong></td><td>' + item.fileCount + '</td><td>' + Number(item.size).toLocaleString() + '</td><td><code>' + item.contentId + '</code></td></tr>'
            ).join('');
        }

    } else if (currentView === 'namemismatch') {
        vTitle.innerHTML = '<div>2. 데이터 일치 (파일명 상이) <span class="badge bg-info">' + results.nameMismatch.length + '건</span></div> ' + timeHtml;
        tHead.innerHTML = '<tr><th style="width: 45%;">파일명 (원본 유지 표시)</th><th style="width: 15%;">구분</th><th style="width: 10%;">파일 개수</th><th style="width: 15%;">데이터 크기(Bytes)</th><th style="width: 15%;">Contents-ID (일치)</th></tr>';

        if (results.nameMismatch.length === 0) {
            tBody.innerHTML = '<tr><td colspan="5" class="text-muted">파일명만 상이한 내역이 없습니다.</td></tr>';
        } else {
            let html = '';
            results.nameMismatch.forEach(group => {
                html += '<tr style="background-color: #fafafa;"><td rowspan="2" style="vertical-align: middle; border-bottom: 2px solid var(--border-color);"><strong>' + group.side1.filename + '</strong><br><small style="color: #6c757d;">⬇ 변형됨</small><br><strong>' + group.side2.filename + '</strong></td><td style="color:#0d6efd; font-weight:bold;">1번 데이터</td><td>' + group.side1.fileCount + '</td><td>' + Number(group.side1.size).toLocaleString() + '</td><td rowspan="2" style="vertical-align: middle; border-bottom: 2px solid var(--border-color);"><code>' + group.side1.contentId + '</code></td></tr>' +
                        '<tr style="border-bottom: 2px solid var(--border-color);"><td style="color:#6c757d; font-weight:bold;">2번 데이터</td><td>' + group.side2.fileCount + '</td><td>' + Number(group.side2.size).toLocaleString() + '</td></tr>';
            });
            tBody.innerHTML = html;
        }

    } else if (currentView === 'contentdiff') {
        vTitle.innerHTML = '<div>3. 동일 작품 내용 변경 <span class="badge bg-warning">' + results.contentDiff.length + '건</span></div> ' + timeHtml;
        tHead.innerHTML = '<tr><th style="width: 40%;">파일명 (원본 유지 표시)</th><th style="width: 12%;">구분</th><th style="width: 13%;">내부 파일 개수</th><th style="width: 15%;">데이터 크기(Bytes)</th><th style="width: 20%;">Contents-ID (상이항목 강조)</th></tr>';

        if (results.contentDiff.length === 0) {
            tBody.innerHTML = '<tr><td colspan="5" class="text-muted">동일 작품 중 내용이 바뀐 내역이 없습니다.</td></tr>';
        } else {
            let html = '';
            results.contentDiff.forEach(group => {
                html += '<tr style="background-color: #fffaf0;"><td rowspan="2" style="vertical-align: middle; border-bottom: 2px solid var(--border-color);"><strong>' + group.side1.filename + '</strong><br><small style="color:#ca8a04;">▼ 매칭작품</small><br><strong>' + group.side2.filename + '</strong></td><td style="color:#0d6efd; font-weight:bold;">1번 데이터</td><td>' + group.side1.fileCount + '</td><td>' + Number(group.side1.size).toLocaleString() + '</td><td><span class="diff-text">' + group.side1.contentId + '</span></td></tr>' +
                        '<tr style="border-bottom: 2px solid var(--border-color);"><td style="color:#6c757d; font-weight:bold;">2번 데이터</td><td>' + group.side2.fileCount + '</td><td>' + Number(group.side2.size).toLocaleString() + '</td><td><span class="diff-text" style="background-color: #fed7aa; color: #ea580c;">' + group.side2.contentId + '</span></td></tr>';
            });
            tBody.innerHTML = html;
        }

    } else if (currentView === 'missing') {
        vTitle.innerHTML = '<div>4. 미매칭 (누락 데이터) <span class="badge bg-danger">' + results.missing.length + '건</span></div> ' + timeHtml;
        tHead.innerHTML = '<tr><th style="width: 20%;">발견 위치</th><th style="width: 40%;">파일명</th><th style="width: 12%;">파일 개수</th><th style="width: 13%;">크기(Bytes)</th><th style="width: 15%;">Contents-ID</th></tr>';

        if (results.missing.length === 0) {
            tBody.innerHTML = '<tr><td colspan="5" class="text-muted">누락된 데이터가 전혀 없습니다.</td></tr>';
        } else {
            tBody.innerHTML = results.missing.map(m => 
                '<tr><td style="color: ' + (m.source === '1번 박스' ? '#0d6efd' : '#dc3545') + '; font-weight:bold;">' + m.source + '에만 존재</td><td><strong>' + m.item.filename + '</strong></td><td>' + m.item.fileCount + '</td><td>' + Number(m.item.size).toLocaleString() + '</td><td><code>' + m.item.contentId + '</code></td></tr>'
            ).join('');
        }
    }
}