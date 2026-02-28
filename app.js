// DOM 元素引用
const fields = [
    'project-name', 'report-date', 'weather',
    'worker-count', 'manager-count', 'progress-slider'
];

const dynamicLists = ['today-done', 'tomorrow-plan', 'issues'];

let workspaces = [];
let activeTabId = null;

let HapticsPlugin = null;
let ImpactStyle = null;
let StatusBarPlugin = null;
let pluginsReady = false;

async function loadPlugins() {
    if (!window.Capacitor) {
        pluginsReady = true;
        return;
    }
    try {
        const hapticsModule = await import('@capacitor/haptics');
        HapticsPlugin = hapticsModule.Haptics;
        ImpactStyle = hapticsModule.ImpactStyle;
    } catch (e) {}
    try {
        const statusBarModule = await import('@capacitor/status-bar');
        StatusBarPlugin = statusBarModule.StatusBar;
    } catch (e) {}
    pluginsReady = true;
}

function setupStatusBar() {
    if (!StatusBarPlugin) return;
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    StatusBarPlugin.setStyle({ style: isDarkMode ? 'DARK' : 'LIGHT' });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        StatusBarPlugin.setStyle({ style: e.matches ? 'DARK' : 'LIGHT' });
    });
}

// 生成唯一 ID
function genId() {
    return 'tab_' + Math.random().toString(36).substr(2, 9);
}

function vibrateShort() {
    if (HapticsPlugin && ImpactStyle) {
        HapticsPlugin.impact({ style: ImpactStyle.Light });
    } else if (navigator.vibrate) {
        navigator.vibrate(40);
    }
}

// 历史项目名称存储
function saveProjectHistory(projectName) {
    if (!projectName) return;
    let history = JSON.parse(localStorage.getItem('ribao_project_history_v1') || '[]');
    history = history.filter(name => name !== projectName);
    history.unshift(projectName);
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

    const pName = document.getElementById('project-name').value.trim();
    if (pName) {
        tabObj.name = pName;
    } else {
        tabObj.name = '新项目';
    }

    tabObj.data = data;
    forceSaveWorkspaces();
    renderTabs();
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

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.classList.remove('form-animate');
        void mainContent.offsetWidth;
        mainContent.classList.add('form-animate');
    }

    loadWorkspaceData(id);
}

function loadWorkspaceData(id) {
    const tabObj = workspaces.find(t => t.id === id);
    if (!tabObj) return;

    const data = tabObj.data || {};

    const todayStr = new Date().toISOString().split('T')[0];
    const savedDateStr = data['report-date'];

    if (savedDateStr && savedDateStr < todayStr) {
        data['report-date'] = todayStr;
        const tomorrowItems = data['tomorrow-plan'] || [];
        data['today-done'] = [...tomorrowItems];
        forceSaveWorkspaces();
    }

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

    const dateEl = document.getElementById('report-date');
    if (dateEl && !dateEl.value) {
        const today = new Date().toISOString().split('T')[0];
        dateEl.value = today;
    }

    if (!data['issues']) {
        const ta = document.querySelector(`#issues-list textarea`);
        if (ta) ta.value = '无';
    }
}

function getPlaceholder(listId) {
    if (listId === 'today-done') return '填写今日完成的工作...';
    if (listId === 'tomorrow-plan') return '填写明日的计划...';
    return '填写遇到的问题或需求，无则填无';
}

function addDynamicItem(listId, placeholder, value = '') {
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    const itemDiv = document.createElement('div');
    itemDiv.className = 'dynamic-item';
    itemDiv.innerHTML = `
        <div class="item-num">${listEl.children.length + 1}.</div>
        <textarea placeholder="${placeholder}" ${value ? '' : 'autofocus'}>${value}</textarea>
        <button class="remove-btn" onclick="removeDynamicItem(this)">×</button>
    `;
    listEl.appendChild(itemDiv);

    const textarea = itemDiv.querySelector('textarea');
    textarea.addEventListener('input', debounceSaveDraft);
    textarea.addEventListener('focus', function() {
        this.select();
    });
}

function removeDynamicItem(btn) {
    const item = btn.closest('.dynamic-item');
    if (!item) return;
    item.remove();
    renumberDynamicItems(btn.closest('.dynamic-list'));
    debounceSaveDraft();
}

function renumberDynamicItems(listEl) {
    if (!listEl) return;
    const items = listEl.querySelectorAll('.dynamic-item');
    items.forEach((item, index) => {
        const numEl = item.querySelector('.item-num');
        if (numEl) numEl.textContent = (index + 1) + '.';
    });
}

function copyDynamicField(listId) {
    const listEl = document.getElementById(`${listId}-list`);
    if (!listEl) return;
    const items = listEl.querySelectorAll('textarea');
    if (items.length === 0) return;

    const text = Array.from(items).map(ta => ta.value).join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制 ' + items.length + ' 条记录');
    });
}

function debounceSaveDraft() {
    clearTimeout(window.saveDraftTimeout);
    window.saveDraftTimeout = setTimeout(saveDraft, 500);
}

function stepVal(fieldId, delta) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    let val = parseInt(el.value) || 0;
    val += delta;
    if (val < 0) val = 0;
    el.value = val;
    vibrateShort();
    debounceSaveDraft();
}

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
    ta.value = ta.value.trim() + (ta.value.trim() ? ' ' : '') + `【${val}%】`;
    debounceSaveDraft();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function openSummary() {
    vibrateShort();
    const summaryToday = document.getElementById('summary-today-done');
    const summaryTomorrow = document.getElementById('summary-tomorrow-plan');
    const summaryIssues = document.getElementById('summary-issues');

    if (!summaryToday || !summaryTomorrow || !summaryIssues) return;

    const todayItems = [];
    const tomorrowItems = [];
    const issuesItems = [];

    workspaces.forEach(tab => {
        const data = tab.data || {};
        if (data['today-done'] && data['today-done'].length > 0) {
            todayItems.push(`【${tab.name}】\n${data['today-done'].join('\n')}`);
        }
        if (data['tomorrow-plan'] && data['tomorrow-plan'].length > 0) {
            tomorrowItems.push(`【${tab.name}】\n${data['tomorrow-plan'].join('\n')}`);
        }
        if (data['issues'] && data['issues'].length > 0) {
            issuesItems.push(`【${tab.name}】\n${data['issues'].join('\n')}`);
        }
    });

    summaryToday.value = todayItems.length > 0 ? todayItems.join('\n\n') : '';
    summaryTomorrow.value = tomorrowItems.length > 0 ? tomorrowItems.join('\n\n') : '';
    summaryIssues.value = issuesItems.length > 0 ? issuesItems.join('\n\n') : '';

    document.getElementById('main-app').style.display = 'none';
    document.getElementById('summary-app').style.display = 'block';
}

function closeSummary() {
    vibrateShort();
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('summary-app').style.display = 'none';
}

function copySummaryField(fieldId) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    if (!el.value.trim()) {
        showToast('暂无内容可复制');
        return;
    }
    navigator.clipboard.writeText(el.value).then(() => {
        showToast('已复制汇总内容');
    });
}

function clearCurrentPage() {
    vibrateShort();
    if (!confirm('确定要清空本页所有内容吗？')) return;

    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) {
            if (f === 'worker-count') el.value = '2';
            else if (f === 'manager-count') el.value = '0';
            else el.value = '';
        }
    });

    dynamicLists.forEach(listId => {
        const listEl = document.getElementById(`${listId}-list`);
        if (listEl) listEl.innerHTML = '';
        addDynamicItem(`${listId}-list`, getPlaceholder(listId));
    });

    document.getElementById('progress-slider').value = '65';
    updateProgressVal();
    saveDraft();
    showToast('已清空本页');
}

function generateAndCopy() {
    vibrateShort();

    const pName = document.getElementById('project-name').value.trim() || '项目';
    const date = document.getElementById('report-date').value || new Date().toISOString().split('T')[0];
    const weather = document.getElementById('weather').options[document.getElementById('weather').selectedIndex].text;
    const workerCount = document.getElementById('worker-count').value;
    const managerCount = document.getElementById('manager-count').value;
    const progress = document.getElementById('progress-slider').value;

    const todayItems = [];
    document.querySelectorAll('#today-done-list textarea').forEach(ta => {
        if (ta.value.trim()) todayItems.push(ta.value.trim());
    });

    const tomorrowItems = [];
    document.querySelectorAll('#tomorrow-plan-list textarea').forEach(ta => {
        if (ta.value.trim()) tomorrowItems.push(ta.value.trim());
    });

    const issuesItems = [];
    document.querySelectorAll('#issues-list textarea').forEach(ta => {
        if (ta.value.trim()) issuesItems.push(ta.value.trim());
    });

    let content = `【${pName}】项目日报\n\n`;
    content += `📅 日期：${date}\n`;
    content += `☀️ 天气：${weather}\n`;
    content += `👥 人员：管理人员 ${managerCount} 名，工人 ${workerCount} 名\n`;
    content += `📊 进度：${progress}%\n\n`;

    if (todayItems.length > 0) {
        content += `✅ 今日已完成：\n`;
        todayItems.forEach((item, index) => {
            content += `${index + 1}. ${item}\n`;
        });
        content += '\n';
    }

    if (tomorrowItems.length > 0) {
        content += `📅 明日计划：\n`;
        tomorrowItems.forEach((item, index) => {
            content += `${index + 1}. ${item}\n`;
        });
        content += '\n';
    }

    if (issuesItems.length > 0) {
        content += `⚠️ 问题需求：\n`;
        issuesItems.forEach((item, index) => {
            content += `${index + 1}. ${item}\n`;
        });
    }

    navigator.clipboard.writeText(content).then(() => {
        showToast('✅ 日报已生成并复制到剪贴板');
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadPlugins();
    initWorkspaces();
    setupStatusBar();

    fields.forEach(f => {
        const el = document.getElementById(f);
        if (el) el.addEventListener('input', debounceSaveDraft);
    });

    const slider = document.getElementById('progress-slider');
    if (slider) {
        slider.addEventListener('input', function () {
            updateProgressVal();
        });
    }

    document.getElementById('clear-draft-btn').addEventListener('click', clearCurrentPage);
    document.getElementById('generate-btn').addEventListener('click', generateAndCopy);
});
