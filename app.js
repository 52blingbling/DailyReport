// DOM 元素引用
const fields = [
    'project-name', 'report-date', 'weather',
    'worker-count', 'manager-count', 'progress-slider'
];

const dynamicLists = ['today-done', 'tomorrow-plan', 'issues'];

// 多项目管理核心逻辑
let workspaces = []; // 存储所有标签页配置及数据 { id: 'tab_xxx', name: '项目名', data: {} }
let activeTabId = null;

// 生成唯一 ID
function genId() {
    return 'tab_' + Math.random().toString(36).substr(2, 9);
}

// 触觉震动提示补充（增强原生APP体感）
function vibrateShort() {
    if (navigator.vibrate) navigator.vibrate(40);
}

// 历史项目名称存储
function saveProjectHistory(projectName) {
    if (!projectName) return;
    let history = JSON.parse(localStorage.getItem('ribao_project_history_v1') || '[]');
    // 去重并提前
    history = history.filter(name => name !== projectName);
    history.unshift(projectName);
    // 只保留最近 10 个
    if (history.length > 10) history.length = 10;
    localStorage.setItem('ribao_project_history_v1', JSON.stringify(history));
    updateProjectDatalist();
}

function updateProjectDatalist() {
    const listEl = document.getElementById('project-list');
    if (!listEl) return;
    const history = JSON.parse(localStorage.getItem('ribao_project_history_v1') || '[]');
    listEl.innerHTML = '';
    history.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        listEl.appendChild(option);
    });
}

// 核心功能 4：自动保存草稿箱（新老逻辑融合，使用多工作区设计）
function saveDraft() {
    if (!activeTabId) return;
    const tabObj = workspaces.find(t => t.id === activeTabId);
    if (!tabObj) return;

    const data = {};
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) data[f] = el.value;
    });
    dynamicLists.forEach(listId => {
        const items = [];
        document.querySelectorAll(`#${listId}-list textarea`).forEach(ta => {
            items.push(ta.value);
        });
        data[listId] = items;
    });

    // 更新当前 tab 名称 (若有项目名则取项目名)
    const pName = document.getElementById('project-name').value.trim();
    if (pName) {
        tabObj.name = pName;
    } else {
        tabObj.name = '新项目';
    }

    tabObj.data = data;
    forceSaveWorkspaces();
    renderTabs(); // 项目名可能会实时变更
    console.log('工作区草稿已自动保存');
}

function forceSaveWorkspaces() {
    localStorage.setItem('ribao_workspaces_v1', JSON.stringify(workspaces));
    localStorage.setItem('ribao_active_tab_v1', activeTabId);
}

// 初始化/还原 多项目工作区与数据渲染
function initWorkspaces() {
    try {
        const savedWs = localStorage.getItem('ribao_workspaces_v1');
        if (savedWs) {
            workspaces = JSON.parse(savedWs);
        }

        // 兼容处理老版本单页面 localStorage 迁移
        if (!workspaces || workspaces.length === 0) {
            const legacyDraft = localStorage.getItem('ribao_draft_v1');
            const dataObj = legacyDraft ? JSON.parse(legacyDraft) : {};
            const pName = LegacyGetPName(dataObj);
            workspaces = [{ id: genId(), name: pName || '新项目', data: dataObj }];
        }

    } catch (e) {
        workspaces = [{ id: genId(), name: '新项目', data: {} }];
    }

    const savedActive = localStorage.getItem('ribao_active_tab_v1');
    if (savedActive && workspaces.find(t => t.id === savedActive)) {
        activeTabId = savedActive;
    } else {
        activeTabId = workspaces[0].id;
    }

    renderTabs();
    loadWorkspaceData(activeTabId);
    updateProjectDatalist();
}

function LegacyGetPName(dataObj) {
    if (dataObj && dataObj['project-name']) return dataObj['project-name'];
    return null;
}

function renderTabs() {
    const listEl = document.getElementById('project-tabs');
    if (!listEl) return;
    listEl.innerHTML = '';

    workspaces.forEach(tab => {
        const el = document.createElement('div');
        el.className = 'tab-item' + (tab.id === activeTabId ? ' active' : '');
        el.onclick = () => switchTab(tab.id);

        const nameNode = document.createTextNode(tab.name || '新项目');
        el.appendChild(nameNode);

        if (workspaces.length > 1) {
            const closeBtn = document.createElement('span');
            closeBtn.className = 'tab-close';
            closeBtn.innerHTML = '&times;';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                closeTab(tab.id);
            };
            el.appendChild(closeBtn);
        }
        listEl.appendChild(el);
    });
}

function createNewTab() {
    vibrateShort();
    const newId = genId();
    workspaces.push({ id: newId, name: '新项目', data: {} });
    switchTab(newId);
}

function closeTab(id) {
    vibrateShort();
    if (workspaces.length <= 1) return;

    const index = workspaces.findIndex(t => t.id === id);
    if (index === -1) return;

    workspaces.splice(index, 1);

    if (activeTabId === id) {
        // 如果删除的是当前激活的 tab，切换到前一个(或后一个)
        const nextActive = workspaces[Math.max(0, index - 1)];
        switchTab(nextActive.id);
    } else {
        forceSaveWorkspaces();
        renderTabs();
    }
}

function switchTab(id) {
    if (activeTabId === id) return;
    vibrateShort();
    activeTabId = id;
    forceSaveWorkspaces();
    renderTabs();

    // 触发平滑过渡动画
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.classList.remove('form-animate');
        void mainContent.offsetWidth; // 触发重绘，重置动画
        mainContent.classList.add('form-animate');
    }

    loadWorkspaceData(id);
}

// 渲染某个项目的数据回页面
function loadWorkspaceData(id) {
    const tabObj = workspaces.find(t => t.id === id);
    if (!tabObj) return;

    const data = tabObj.data || {};

    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
            el.value = data[f] !== undefined ? data[f] : (f === 'worker-count' && !data[f] ? '2' : (f === 'manager-count' && !data[f] ? '0' : ''));
            if (f === 'worker-count' && data[f] == undefined) el.value = '2';
            if (f === 'manager-count' && data[f] == undefined) el.value = '0';
            if (f === 'progress-slider' && data[f] == undefined) el.value = '65';
        }
    });

    dynamicLists.forEach(listId => {
        const listEl = document.getElementById(`${listId}-list`);
        if (listEl) listEl.innerHTML = '';
        const items = data[listId];
        if (items && items.length > 0) {
            items.forEach(val => addDynamicItem(`${listId}-list`, getPlaceholder(listId), val));
        } else {
            addDynamicItem(`${listId}-list`, getPlaceholder(listId));
        }
    });

    updateProgressVal();

    // 如果日期为空，默认填今天，并且触发一次 saveDraft() 把空白项目初始化
    const dateEl = document.getElementById('report-date');
    if (dateEl && !dateEl.value) {
        const today = new Date().toISOString().split('T')[0];
        dateEl.value = today;
    }

    // 如果问题需求为空，自动补无
    if (!data['issues']) {
        const ta = document.querySelector(`#issues-list textarea`);
        if (ta) ta.value = '无';
    }
}

// 防抖函数，避免频繁触发存储
function debounce(func, timeout = 500) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}
const debounceSaveDraft = debounce(saveDraft, 800);

function getPlaceholder(listId) {
    if (listId === 'today-done') return '填写今日完成工作...';
    if (listId === 'tomorrow-plan') return '填写明日的计划...';
    if (listId === 'issues') return '填写遇到的问题或需求，无则填无';
    return '';
}

function addDynamicItem(listId, placeholder = '', value = '') {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    vibrateShort();
    const itemDiv = document.createElement('div');
    itemDiv.className = 'dynamic-item';

    const count = listEl.children.length + 1;

    const countSpan = document.createElement('span');
    countSpan.className = 'item-num';
    countSpan.innerText = count + '.';

    const ta = document.createElement('textarea');
    ta.rows = 2;
    ta.placeholder = placeholder;
    ta.value = value;
    ta.addEventListener('input', debounceSaveDraft);

    itemDiv.appendChild(countSpan);
    itemDiv.appendChild(ta);

    if (count > 1) {
        const btn = document.createElement('button');
        btn.className = 'remove-btn';
        btn.innerHTML = '&times;';
        btn.onclick = function () { removeDynamicItem(this, listId); };
        itemDiv.appendChild(btn);
    } else {
        const placeholderDiv = document.createElement('div');
        placeholderDiv.style.width = '30px';
        placeholderDiv.style.flexShrink = '0';
        itemDiv.appendChild(placeholderDiv);
    }

    listEl.appendChild(itemDiv);

    updateItemNumbers(listId);
    debounceSaveDraft();
}

function removeDynamicItem(btnEl, listId) {
    vibrateShort();
    const item = btnEl.closest('.dynamic-item');
    item.remove();
    updateItemNumbers(listId);
    debounceSaveDraft();
}

function updateItemNumbers(listId) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    const items = listEl.querySelectorAll('.dynamic-item');
    items.forEach((item, index) => {
        item.querySelector('.item-num').innerText = (index + 1) + '.';
        if (index === 0) {
            const btn = item.querySelector('.remove-btn');
            if (btn) {
                const placeholderDiv = document.createElement('div');
                placeholderDiv.style.width = '30px';
                placeholderDiv.style.flexShrink = '0';
                item.replaceChild(placeholderDiv, btn);
            }
        } else {
            if (!item.querySelector('.remove-btn')) {
                const placeholderDiv = item.querySelector('div[style]');
                if (placeholderDiv) {
                    const btn = document.createElement('button');
                    btn.className = 'remove-btn';
                    btn.innerHTML = '&times;';
                    btn.onclick = function () { removeDynamicItem(this, listId); };
                    item.replaceChild(btn, placeholderDiv);
                }
            }
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initWorkspaces();

    // 绑定所有输入框的 input 事件以实现【自动保存草稿】
    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.addEventListener('input', debounceSaveDraft);
    });

    // 进度条拖动监听
    const slider = document.getElementById('progress-slider');
    if (slider) {
        slider.addEventListener('input', function () {
            updateProgressVal();
        });
    }
});

// 核心功能 5：拖拽进度条显示与文字追加
function updateProgressVal() {
    const slider = document.getElementById('progress-slider');
    const valEl = document.getElementById('progress-val');
    if (slider && valEl) {
        valEl.innerText = slider.value;
    }
}

function appendProgress() {
    const textareas = document.querySelectorAll('#today-done-list textarea');
    if (textareas.length === 0) return;
    const ta = textareas[textareas.length - 1];
    const val = document.getElementById('progress-slider').value;

    vibrateShort();

    // 追加到文本域最后
    const currentText = ta.value.trim();
    const appendText = `，进度${val}%`;

    if (currentText.length > 0) {
        ta.value = currentText + appendText;
    } else {
        ta.value = `进度${val}%`;
    }

    saveDraft();
    showToast('已追加进度到今日完成最后一条');
}

// 增减人数控制
function stepVal(id, step) {
    vibrateShort();
    const el = document.getElementById(id);
    if (!el) return;
    let val = parseInt(el.value) || 0;
    val += step;
    if (val < 0) val = 0;
    el.value = val;
    saveDraft();
}

// 获取动态列表文本
function getDynamicListText(listId) {
    const items = [];
    document.querySelectorAll(`#${listId}-list textarea`).forEach((ta, index) => {
        const text = ta.value.trim();
        if (text) {
            items.push(`${index + 1}. ${text}`);
        }
    });
    if (items.length === 1 && items[0].replace(/^\d+\.\s*/, '') === '无') {
        return '无';
    }
    if (items.length === 0 && listId === 'issues') return '无';
    return items.join('\n');
}

// 单独复制动态列表内容
function copyDynamicField(listId) {
    const text = getDynamicListText(listId);
    if (!text) {
        showToast('内容为空');
        return;
    }
    doCopy(text, '已复制该项记录');
}

// 格式化日期： 2026-02-07 -> 2026年2月7日
function formatDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// 生成并复制完整日报
document.getElementById('generate-btn').addEventListener('click', () => {
    vibrateShort();
    const pName = document.getElementById('project-name').value;

    // 存入历史记录
    saveProjectHistory(pName);

    const rawDate = document.getElementById('report-date').value;
    const weather = document.getElementById('weather').value;
    const workers = document.getElementById('worker-count').value;
    const managers = document.getElementById('manager-count').value;

    const today = getDynamicListText('today-done') || '无';
    const tomorrow = getDynamicListText('tomorrow-plan') || '无';
    const issues = getDynamicListText('issues') || '无';

    const formattedDate = formatDate(rawDate);

    // 模板拼接
    const reportText = `项目：${pName}\n日期：${formattedDate}\n天气：${weather}\n一、管理人员：${managers}名，工人：${workers}名\n二、今日已完成\n${today}\n三、明日计划\n${tomorrow}\n四、问题需求\n${issues}`;

    doCopy(reportText, '✅ 完整日报已生成并复制，可直接粘贴到飞书等OA软件');
});

// 清空草稿
document.getElementById('clear-draft-btn').addEventListener('click', () => {
    if (confirm('确定要清空本页面的所有内容吗？')) {
        const tabObj = workspaces.find(t => t.id === activeTabId);
        if (tabObj) {
            tabObj.data = {};
            tabObj.name = '新项目';
        }
        forceSaveWorkspaces();
        loadWorkspaceData(activeTabId);
        renderTabs();
    }
});

// --- 日报汇总逻辑 ---
function openSummary() {
    vibrateShort();

    // 生成之前，先把当前页数据最新保存在内容里
    saveDraft();

    // 隐藏主视图，显示汇总视图
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('summary-app').style.display = 'block';

    // 取出各个部分的内容聚合
    document.getElementById('summary-today-done').value = buildSummaryText('today-done');
    document.getElementById('summary-tomorrow-plan').value = buildSummaryText('tomorrow-plan');
    document.getElementById('summary-issues').value = buildSummaryText('issues');
}

function closeSummary() {
    vibrateShort();
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('summary-app').style.display = 'none';
}

function buildSummaryText(listId) {
    let resultBlocks = [];

    workspaces.forEach(ws => {
        const pName = ws.name || '未命名项目';
        const rawItems = (ws.data && ws.data[listId]) ? ws.data[listId] : [];

        let validItems = [];
        rawItems.forEach(text => {
            const v = text.trim();
            if (v && v !== '无') validItems.push(v);
        });

        if (validItems.length > 0) {
            let blockStr = pName + '：\n';
            validItems.forEach((v, index) => {
                blockStr += (index + 1) + '. ' + v + '\n';
            });
            resultBlocks.push(blockStr.trim());
        }
    });

    if (resultBlocks.length === 0) return '无';
    return resultBlocks.join('\n\n');
}

function copySummaryField(id) {
    const text = document.getElementById(id).value;
    if (!text) {
        showToast('内容为空');
        return;
    }
    doCopy(text, '已复制合并汇总记录');
}

// 复制核心公共函数
function doCopy(text, successMsg) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(successMsg);
        }).catch(err => {
            fallbackCopyTextToClipboard(text, successMsg);
        });
    } else {
        fallbackCopyTextToClipboard(text, successMsg);
    }
}

// 兼容老版本浏览器的复制
function fallbackCopyTextToClipboard(text, successMsg) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast(successMsg);
    } catch (err) {
        showToast('复制失败，请手动长按复制');
    }
    document.body.removeChild(textArea);
}

// 吐司提示
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.classList.add('show');
    setTimeout(() => {
        t.classList.remove('show');
    }, 2500);
}
