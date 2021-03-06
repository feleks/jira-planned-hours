(function () {
    type TaskID = string;
    type ColumnID = string;

    interface ITaskDetails {
        validTimeModule: boolean;
        plannedHours: number;
        spentHours: number;
        title: string;
        asigneeId: string;
        asigneeName: string;
        asigneeAvatarUrl?: string;
        authorId: string;
        authorName: string;
        authorAvatarUrl?: string;
    }

    interface ITaskInfo {
        id: TaskID;
        columnId: string;
        details: ITaskDetails;
    }

    interface ITasksInfo {
        totalTasksCount: number;
        lastUpdateDate: number;
        allTasks: ITaskInfo[];
        persons: {
            name: string;
            tasksByColumnId: {
                [columnId: string]: ITaskInfo[];
            };
        }[];
        tasksWithoutPlannedTime: ITaskInfo[];
    }

    interface IElements {
        '#jira-planned-hours': JQuery<HTMLElement>;
        '#jira-planned-hours-control-bar': JQuery<HTMLElement>;
        '#jira-planned-hours-count': JQuery<HTMLElement>;
        '#jira-planned-hours-loading': JQuery<HTMLElement>;
        '#jira-planned-hours-loading-bar': JQuery<HTMLElement>;
        '#jira-planned-hours-loading-bar-fill': JQuery<HTMLElement>;
        '#jira-planned-hours-loading-value': JQuery<HTMLElement>;
        '#jira-planned-hours-info-bar': JQuery<HTMLElement>;
        '#jira-planned-hours-clear': JQuery<HTMLElement>;
        '#jira-planned-hours-find-bad-tasks': JQuery<HTMLElement>;
    }

    interface IColumnsInfo {
        titles: {
            [titleName: string]: string;
        };
        list: string[];
        set: Set<string>;
    }

    const LOADING_BAR_WIDTH = 300;
    const MAX_GHX_POOL_SEARCH_RETRIES = 10;
    const TASK_PLAN_DEVIATION_BORDER = 0;

    let TXID: number = 0;
    let ELEMENTS: IElements;
    let COLUMNS_INFO: IColumnsInfo;
    let LOADING_BAR_SHOWN = false;

    if ($ == null) {
        return;
    }

    $(document).ready(() => {
        console.log('starting jira_planned_hours script. AQ');

        let retries = 0;
        const intervalId = setInterval(() => {
            retries += 1;

            if (retries >= MAX_GHX_POOL_SEARCH_RETRIES) {
                console.log(`reached max retries waiting for #ghx-pool-column (${retries}/${MAX_GHX_POOL_SEARCH_RETRIES})`);
                clearInterval(intervalId);
                return;
            }

            console.log(`ensuring #ghx-pool-column exists (retries: ${retries}/${MAX_GHX_POOL_SEARCH_RETRIES})`);

            const poolColumnDiv = $('#ghx-pool-column');
            if (poolColumnDiv.length === 0) {
                console.log('#ghx-pool-column does not exist yet.');
                return;
            } else {
                console.log('#ghx-pool-column exists.');
                clearInterval(intervalId);

                init();
            }
        }, 1000);
    });

    function init() {
        const barDiv = $(`
            <style>
                #jira-planned-hours-clear {
                    float: left;
                }
                #jira-planned-hours {
                    padding: 10px 13px; 
                    background-color: white; 
                    border-bottom: 2px solid #ebecf0;
                }
                #jira-planned-hours-control-bar {
                    height: 30px;
                    width: 100%;
                }
                #jira-planned-hours-count {
                    float: left;
                }
                #jira-planned-hours-loading {
                    float: left;
                    height: 30px;
                    margin-left: 10px;
                    opacity: 0;
                    transition: opacity 0.5s ease;
                }
                #jira-planned-hours-loading-bar {
                    box-sizing: border-box;
                    float: left;
                    height: 30px;
                    width: ${LOADING_BAR_WIDTH}px;
                    border: 1px solid rgba(9,30,66,.095);
                    overflow: hidden;
                    border-radius: 3px;
                    background-color: rgba(9,30,66,.02);
                }
                #jira-planned-hours-loading-bar-fill {
                    float: left;
                    height: 30px;
                    background-color: #84f0a6;
                    width: 0px;
                }
                #jira-planned-hours-loading-value {
                    height: 30px;
                    line-height: 30px;
                    float: left;
                    margin-left: 5px;
                }

                #jira-planned-hours-info-bar {
                    margin-top: 10px;
                    display: none;
                }
                .jira-planned-hours-person-info {
                    display: inline-block;
                    padding: 10px;
                    margin: 3px;
                    border-radius: 3px;
                }
                .jira-planned-hours-person-info:nth-child(2n) {
                    background-color: #ececed;
                }
                .jira-planned-hours-person-info-name {
                    font-size: 16px;
                    font-weight: bold;
                }
                .jira-planned-hours-person-info-table {
                    border-collapse: collapse;
                    border: 2px solid rgba(9,30,66,.1);
                }
                .jira-planned-hours-person-info-table tr {
                    border-bottom: 2px solid rgba(9,30,66,.1);;
                }
                .jira-planned-hours-person-info-table tr:last-child {
                    border-bottom: none;
                }
                .jira-planned-hours-person-info-table td {
                    border-right: 2px solid rgba(9,30,66,.1);;
                    padding: 0 5px;
                }
                .jira-planned-hours-person-info-table td:last-child {
                    border-right: none;
                }

                #jira-planned-hours-find-bad-tasks {
                    float: left;
                }

                .jira-planned-hours-spoiler {
                    margin: 5px 0;
                    padding: 10px;
                    background-color: #f6f6f7;
                    border-radius: 3px;
                }
                .jira-planned-hours-spoiler-title {
                    cursor: pointer;
                }
                .jira-planned-hours-spoiler-content {
                    display: none;
                }

                .jira-planned-hours-time-by-person {
                    
                }

                .jira-planned-hours-tasks-without-planned-time {

                }
                .jira-planned-hours-tasks-without-planned-time li {
                }
                .jira-planned-hours-tasks-without-planned-time img {
                    display: inline-block;
                    height: 23px;
                    width: 23px;
                    border-radius: 50%;
                }

                .jira-planned-hours-plan-accuracy .ac-green {
                    color: #3dce3d;
                }
                .jira-planned-hours-plan-accuracy .ac-yellow {
                    color: #dcc626;
                }
                .jira-planned-hours-plan-accuracy .ac-red {
                    color: red;
                }
                .jira-planned-hours-plan-accuracy h3 {
                    margin: 15px 0 8px 0;
                }
                .jira-planned-hours-plan-accuracy-time {
                    width: 100px;
                    text-align: right;
                }
                .jira-planned-hours-plan-accuracy img {
                    display: inline-block;
                    height: 23px;
                    width: 23px;
                    border-radius: 50%;
                }
            </style>
            <div id="jira-planned-hours">
                <div id="jira-planned-hours-control-bar">
                    <button id="jira-planned-hours-count" class="aui-button">Загрузить информацию для анализа</button>
                    <button id="jira-planned-hours-clear" class="aui-button">Очистка</button>
                    <div id="jira-planned-hours-loading">
                        <div id="jira-planned-hours-loading-bar">
                            <div id="jira-planned-hours-loading-bar-fill" style="width: 251px;"></div>
                        </div>
                        <div id="jira-planned-hours-loading-value"></div>
                    </div>
                </div>
                <div id="jira-planned-hours-info-bar">
                </div>
            </div>
        `);

        ELEMENTS = {
            '#jira-planned-hours': barDiv.find('#jira-planned-hours'),
            '#jira-planned-hours-control-bar': barDiv.find('#jira-planned-hours-control-bar'),
            '#jira-planned-hours-count': barDiv.find('#jira-planned-hours-count'),
            '#jira-planned-hours-loading': barDiv.find('#jira-planned-hours-loading'),
            '#jira-planned-hours-loading-bar': barDiv.find('#jira-planned-hours-loading-bar'),
            '#jira-planned-hours-loading-bar-fill': barDiv.find('#jira-planned-hours-loading-bar-fill'),
            '#jira-planned-hours-loading-value': barDiv.find('#jira-planned-hours-loading-value'),
            '#jira-planned-hours-info-bar': barDiv.find('#jira-planned-hours-info-bar'),
            '#jira-planned-hours-clear': barDiv.find('#jira-planned-hours-clear'),
            '#jira-planned-hours-find-bad-tasks': barDiv.find('#jira-planned-hours-find-bad-tasks')
        };

        ELEMENTS['#jira-planned-hours-count'].click(countPlannedHours);
        ELEMENTS['#jira-planned-hours-clear'].click(clear);

        const poolColumnDiv = $('#ghx-pool-column');
        poolColumnDiv.prepend(barDiv);

        const initialTasksInfo = getTasksInfoFromLocalStorage();
        if (initialTasksInfo != null) {
            showTasksInfo(initialTasksInfo);
        }
    }

    // Planned time lib func

    function plannedTimeToHours(plannedTime: string): number {
        if (plannedTime === 'Не определено') {
            return 0;
        }

        let minutes = 0;
        for (let timeUnit of plannedTime.split(' ')) {
            const unitAmount = parseInt(timeUnit.slice(0, timeUnit.length - 1));

            if (timeUnit.indexOf('w') != -1) {
                minutes += unitAmount * 5 * 8 * 60;
            } else if (timeUnit.indexOf('d') != -1) {
                minutes += unitAmount * 8 * 60;
            } else if (timeUnit.indexOf('h') != -1) {
                minutes += unitAmount * 60;
            } else if (timeUnit.indexOf('m') != -1) {
                minutes += unitAmount;
            } else {
                throw new Error('invalid planned time: ' + plannedTime);
            }
        }

        return minutes / 60;
    }

    // Local storage

    function saveTasksInfoToLocalStorage(tasksInfo: ITasksInfo) {
        localStorage.setItem('jira-planned-hours-tasks-info', JSON.stringify(tasksInfo));
    }

    function getTasksInfoFromLocalStorage() {
        const tasksInfo = localStorage.getItem('jira-planned-hours-tasks-info');
        if (tasksInfo == null) {
            return null;
        } else {
            const tasksInfoParsed = JSON.parse(tasksInfo);
            tasksInfoParsed.lastUpdateDate = new Date(tasksInfoParsed.lastUpdateDate);
            return tasksInfoParsed;
        }
    }

    function clearTasksInfoFromLocalStorage() {
        localStorage.removeItem('jira-planned-hours-tasks-info');
    }

    // Loading bar

    function startLoadingBar() {
        if (LOADING_BAR_SHOWN) {
            return;
        }

        ELEMENTS['#jira-planned-hours-loading'].css('opacity', '1');
        ELEMENTS['#jira-planned-hours-loading-bar-fill'].css('width', '0px');
        ELEMENTS['#jira-planned-hours-loading-value'].text('');
        LOADING_BAR_SHOWN = true;
    }

    function updateLoadingBar(current: number, total: number) {
        if (!LOADING_BAR_SHOWN) {
            return;
        }

        let width = 0;
        if (current >= total) {
            width = LOADING_BAR_WIDTH;
        } else {
            width = (current / total) * LOADING_BAR_WIDTH;
        }

        ELEMENTS['#jira-planned-hours-loading-bar-fill'].css('width', `${width}px`);
        ELEMENTS['#jira-planned-hours-loading-value'].text(`${current}/${total} (${((current / total) * 100).toFixed(1)}%)`);
    }

    function stopLoadingBar() {
        if (!LOADING_BAR_SHOWN) {
            return;
        }
        ELEMENTS['#jira-planned-hours-loading'].css('opacity', '0');
        ELEMENTS['#jira-planned-hours-loading-bar-fill'].css('width', '0px');
        ELEMENTS['#jira-planned-hours-loading-value'].text('');
        LOADING_BAR_SHOWN = false;
    }

    // Columns

    function getColumnsInfo() {
        if (COLUMNS_INFO != null) {
            return COLUMNS_INFO;
        }

        let titles: { [column_title: string]: string } = {};
        let list: string[] = [];

        const columns = $('#ghx-column-headers > .ghx-column');
        for (let i = 0; i < columns.length; ++i) {
            const column = columns.get(i);
            const id = column.dataset.id;
            const titleHtml = column.querySelector('.ghx-column-title');

            if (id == null) {
                throw new Error('could not find id in dataset of ' + column);
            }

            if (titleHtml != null) {
                const title = titleHtml.innerHTML;

                list.push(id);
                titles[id] = title;
            } else {
                throw new Error('could not find .ghx-column-title');
            }
        }

        const columns_info = {
            titles: titles,
            list: list,
            set: new Set(list)
        };
        COLUMNS_INFO = columns_info;
        return columns_info;
    }

    // Tasks

    function getTaskDetails(taskId: TaskID): Promise<ITaskDetails> {
        const taskUrl = `https://jira.kalabi.ru/browse/${taskId}`;

        return new Promise((resolve, reject) => {
            $.get(taskUrl)
                .done((data) => {
                    const htmlData = $(data);
                    const origTime = htmlData.find('#tt_single_values_orig');
                    const spentTime = htmlData.find('#tt_single_values_spent');
                    const title = htmlData.find('#summary-val');
                    const asignee = htmlData.find('#assignee-val .user-hover');
                    const author = htmlData.find('#reporter-val .user-hover');

                    // Time
                    let validTimeModule = true;
                    let plannedHours = 0;
                    let spentHours = 0;
                    if (origTime.length == 0 || spentTime.length == 0) {
                        console.warn('could not find time module elements for task ' + taskId);
                        validTimeModule = false;
                    } else {
                        const origTimeRaw = origTime.get(0).innerHTML.trim();
                        const spentTimeRaw = spentTime.get(0).innerHTML.trim();

                        plannedHours = plannedTimeToHours(origTimeRaw);
                        spentHours = plannedTimeToHours(spentTimeRaw);
                    }

                    // Asignee
                    const asigneeId = asignee.attr('rel') as string;
                    let asigneeName = asignee
                        .text()
                        .replace(/(\r\n|\n|\r)/gm, '')
                        .trim();
                    const asigneeAvatarUrl = asignee.find('img').attr('src') as string;
                    if (asigneeName.length === 0) {
                        asigneeName = 'Не назначен';
                    }

                    // Author
                    const authorId = author.attr('rel') as string;
                    const authorName = author
                        .text()
                        .replace(/(\r\n|\n|\r)/gm, '')
                        .trim();
                    const authorAvatarUrl = author.find('img').attr('src') as string;

                    return resolve({
                        validTimeModule,
                        plannedHours,
                        spentHours,
                        title: title.text(),
                        asigneeId,
                        asigneeName,
                        asigneeAvatarUrl,
                        authorId,
                        authorName,
                        authorAvatarUrl
                    });
                })
                .fail((err) => {
                    reject(err);
                });
        });
    }

    function getTaskIdsFromSprintPage(): [TaskID[], { [taskId: string]: ColumnID }] {
        let taskIds: TaskID[] = [];
        let taskIdToColumnId: { [taskId: string]: string } = {};

        const swimlaneDivs = document.querySelectorAll('.ghx-swimlane');

        for (let swimlaneDiv of swimlaneDivs) {
            const headingDiv = swimlaneDiv.querySelector('.ghx-swimlane-header');
            if (headingDiv == null) {
                throw new Error('headingDiv is null');
            }
            const nameSpan = headingDiv.querySelector('span:nth-child(2)');
            if (nameSpan == null) {
                throw new Error('nameSpan is null');
            }

            const columnDivs = swimlaneDiv.querySelectorAll('.ghx-column');

            for (let columnDiv of columnDivs) {
                const columnId = (columnDiv as any).dataset.columnId;
                if (columnId == null) {
                    throw new Error('columnId is null');
                }

                const taskDivs = columnDiv.querySelectorAll('.ghx-issue');
                for (let taskDiv of taskDivs) {
                    const taskIdDiv = taskDiv.querySelector('.ghx-key > a');
                    if (taskIdDiv == null) {
                        throw new Error('taskIdDiv is null');
                    }
                    const taskId = taskIdDiv.getAttribute('title');
                    if (taskId == null) {
                        throw new Error('taskId is null');
                    }

                    taskIds.push(taskId);
                    taskIdToColumnId[taskId] = columnId;
                }
            }
        }

        return [taskIds, taskIdToColumnId];
    }

    async function getTasksInfo(taskIds: TaskID[], taskIdToColumnId: { [taskId: string]: ColumnID }): Promise<ITasksInfo> {
        TXID += 1;
        const txId = TXID;
        startLoadingBar();

        const columnsInfo = getColumnsInfo();
        let totalTasksCount = taskIds.length;

        console.log('taskIds', taskIdToColumnId);
        console.log('taskIdToColumnId', taskIdToColumnId);

        let allTasks: ITaskInfo[] = [];
        let tasksWithoutPlannedTime: ITaskInfo[] = [];
        let fetchedTasksCount = 0;
        let personsMap = new Map<string, Map<string, ITaskInfo[]>>();
        startLoadingBar();

        for (let taskId of taskIds) {
            if (txId != TXID) {
                throw new Error(`TXID has changed (from ${txId} to ${TXID}). tasks update aborted.`);
            }

            const columnId = taskIdToColumnId[taskId];
            if (columnId == null) {
                throw new Error('could not find column id for task ' + taskId);
            }
            const taskDetails = await getTaskDetails(taskId);
            const task: ITaskInfo = {
                id: taskId,
                details: taskDetails,
                columnId
            };

            if (!taskDetails.validTimeModule) {
                tasksWithoutPlannedTime.push(task);
            }

            allTasks.push(task);

            if (!personsMap.has(task.details.asigneeName)) {
                personsMap.set(task.details.asigneeName, new Map());
            }
            let personMap = personsMap.get(task.details.asigneeName);
            if (!personMap?.has(columnId)) {
                personMap?.set(columnId, []);
            }
            let personColumnTasks = personMap?.get(columnId);
            personColumnTasks?.push(task);

            fetchedTasksCount += 1;
            updateLoadingBar(fetchedTasksCount, totalTasksCount);
        }

        let persons: ITasksInfo['persons'] = [];
        personsMap.forEach((person, name) => {
            let tasksByColumnId: ITasksInfo['persons'][0]['tasksByColumnId'] = {};

            person.forEach((columnTasks, columnId) => {
                tasksByColumnId[columnId] = columnTasks;
            });

            persons.push({
                name,
                tasksByColumnId
            });
        });

        // for (let person of persons) {
        //     for (let columnId of columnsInfo.list) {
        //         for (let task of person.tasksByColumnId[columnId]) {
        //             if (txId != TXID) {
        //                 throw new Error(`TXID has changed (from ${txId} to ${TXID}). tasks update aborted.`);
        //             }

        //             const timeInfo = await getTaskDetails(task.id);
        //             if (!timeInfo.validTimeModule) {
        //                 tasksWithoutPlannedTime.push(task);
        //             }

        //             allTasks.push(task);

        //             fetchedTasksCount += 1;
        //             updateLoadingBar(fetchedTasksCount, totalTasksCount);
        //             task.details = timeInfo;
        //             task.details.columnId = columnId;
        //         }
        //     }
        // }

        stopLoadingBar();

        return {
            totalTasksCount,
            allTasks,
            persons,
            tasksWithoutPlannedTime,
            lastUpdateDate: Date.now()
        };
    }

    // Presentation

    function addSpoilerBlock(title: string, content: JQuery<HTMLElement>): void {
        let shown = true;
        let setDisplay = () => {
            if (shown) {
                contentElement.css('display', 'none');
                titleActionElement.text('Развернуть');
            } else {
                contentElement.css('display', 'block');
                titleActionElement.text('Свернуть');
            }

            shown = !shown;
        };

        const infoElement = ELEMENTS['#jira-planned-hours-info-bar'];

        const spoilerElement = $(`
            <div class="jira-planned-hours-spoiler">
                <div class="jira-planned-hours-spoiler-title">
                    ${title} <a class="jira-planned-hours-spoiler-title-action">Развернуть</a>
                </div>
                <div class="jira-planned-hours-spoiler-content">

                </div>
            </div>
        `);

        const contentElement = spoilerElement.find('.jira-planned-hours-spoiler-content');
        const titleElement = spoilerElement.find('.jira-planned-hours-spoiler-title');
        const titleActionElement = spoilerElement.find('.jira-planned-hours-spoiler-title-action');

        contentElement.append(content);

        setDisplay();
        titleElement.click(setDisplay);

        infoElement.append(spoilerElement);
    }

    function generateTimeByPersonElement(tasksInfo: ITasksInfo): JQuery<HTMLElement> {
        const columnsInfo = getColumnsInfo();
        const timeByPerson = $('<div class="jira-planned-hours-time-by-person"></div>');

        for (let person of tasksInfo.persons) {
            const personElement = $(`
                <div class="jira-planned-hours-person-info">
                    <div class="jira-planned-hours-person-info-name">
                        ${person.name}
                    </div>
                    <table class="jira-planned-hours-person-info-table">
                        <tr>
                            <th>Колонка</th>
                            <th>Запланировано (ч)</th>
                            <th>Потрачено (ч)</th>
                            <th>Осталось (ч)</th>
                        </tr>
                    </table>
                </div>
            `);
            const tableElement = personElement.find('.jira-planned-hours-person-info-table');

            // Все префиксы
            for (let i = 0; i < columnsInfo.list.length; ++i) {
                let title = '';
                let plannedHours = 0;
                let spentHours = 0;

                for (let j = 0; j <= i; ++j) {
                    const columnId = columnsInfo.list[j];
                    const columnTitle = columnsInfo.titles[columnId];
                    title += columnTitle;

                    if (j < i) {
                        if (i != 0) {
                            title += ' +';
                        }
                        title += '</br>';
                    }

                    if (i == columnsInfo.list.length - 1) {
                        title = 'Все';
                    }

                    let tasks = person.tasksByColumnId[columnId];
                    if (tasks == null) {
                        tasks = [];
                    }

                    for (let taskInfo of tasks) {
                        if (taskInfo.details == null || !taskInfo.details.validTimeModule) {
                            continue;
                        }

                        plannedHours += taskInfo.details.plannedHours;
                        spentHours += taskInfo.details.spentHours;
                    }
                }

                const rowElement = $(`
                    <tr>
                        <td>${title}</td>
                        <td>${plannedHours.toFixed(1)}ч</td>
                        <td>${spentHours.toFixed(1)}ч</td>
                        <td>${(plannedHours - spentHours).toFixed(1)}ч</td>
                    </tr>
                `);

                tableElement.append(rowElement);
            }

            timeByPerson.append(personElement);
        }

        return timeByPerson;
    }

    function generateAsigneeAndAuthor(task): [string, string] {
        let asignee = 'Не назначен';
        if (task.details?.asigneeName != null && task.details?.asigneeName.length > 0) {
            let avatar = '';
            if (task.details?.asigneeAvatarUrl != null) {
                avatar = `<img src="${task.details?.asigneeAvatarUrl}"></img> `;
            }
            asignee = `${avatar}${task.details?.asigneeName}`;
        }

        let author = 'Отсутствует';
        if (task.details?.authorName != null && task.details?.authorName.length > 0) {
            let avatar = '';
            if (task.details?.authorAvatarUrl != null) {
                avatar = `<img src="${task.details?.authorAvatarUrl}"></img> `;
            }
            author = `${avatar}${task.details?.authorName}`;
        }

        return [asignee, author];
    }

    function generateTasksWithoutPlannedTimeElement(tasksInfo: ITasksInfo): JQuery<HTMLElement> {
        const tasksWithoutPlannedTime = $(`
            <table class="jira-planned-hours-tasks-without-planned-time">
                <tr>
                    <th>ID</th>
                    <th>Заголовок</th>
                    <th>Исполнитель</th>
                    <th>Автор</th>
                </tr>
            </table>
        `);

        for (let task of tasksInfo.tasksWithoutPlannedTime) {
            let [asignee, author] = generateAsigneeAndAuthor(task);

            tasksWithoutPlannedTime.append(
                $(`
                <tr>
                    <td>
                        <a href="https://jira.kalabi.ru/browse/${task.id}">${task.id}</a>
                    </td>
                    <td>
                        ${task.details?.title}
                    </td>
                    <td>
                        ${asignee}
                    </td>
                    <td>
                        ${author}
                    </td>
                </tr>
            `)
            );
        }

        return tasksWithoutPlannedTime;
    }

    function generatePlanAccuracy(tasksInfo: ITasksInfo): JQuery<HTMLElement> {
        const planAccuracy = $('<div class="jira-planned-hours-plan-accuracy"></div>');

        const completedTasksColumnIds = new Set(COLUMNS_INFO.list.slice(COLUMNS_INFO.list.length - 1, COLUMNS_INFO.list.length));
        console.log('completedTasksColumnIds:', completedTasksColumnIds);

        let totalPlanned = 0;
        let totalSpent = 0;

        let underestimatedTasks: ITaskInfo[] = [];
        let overstatedTasks: ITaskInfo[] = [];

        for (let task of tasksInfo.allTasks) {
            if (task.details == null || task.columnId == null) {
                throw new Error('task has not details! id=' + task.id);
            }

            let timeLeft = task.details.plannedHours - task.details.spentHours;
            let deviation = Math.abs(timeLeft);

            if (deviation > TASK_PLAN_DEVIATION_BORDER) {
                if (timeLeft < 0) {
                    underestimatedTasks.push(task);
                } else if (timeLeft > 0 && completedTasksColumnIds.has(task.columnId)) {
                    overstatedTasks.push(task);
                }
            }

            totalPlanned += task.details.plannedHours;
            totalSpent += task.details.spentHours;
        }

        let totalLeft = totalPlanned - totalSpent;

        let comparator = (a: ITaskInfo, b: ITaskInfo): number => {
            if (a.details == null || b.details == null) {
                throw new Error('either a or b details is null!');
            }

            const aDeviation = Math.abs(a.details.spentHours - a.details.plannedHours);
            const bDeviation = Math.abs(b.details.spentHours - b.details.plannedHours);

            return bDeviation - aDeviation;
        };
        underestimatedTasks.sort(comparator);
        overstatedTasks.sort(comparator);

        let leftClass = '';
        if (totalLeft >= 0) {
            leftClass = 'ac-green';
        } else {
            leftClass = 'ac-red';
        }

        planAccuracy.append(
            $(`
            <div class="jira-planned-hours-plan-accuracy-common">
                <h3>Сводка</h3>
                <div>Всего запланировано: ${totalPlanned.toFixed(1)}ч</div>
                <div>Всего потрачено: ${totalSpent.toFixed(1)}ч</div>
                <div>Всего осталось: <span class="${leftClass}">${totalLeft.toFixed(1)}ч</span></div>
            </div>
        `)
        );

        const underestimated = $(
            '<div class="jira-planned-hours-plan-accuracy-underestimated"><h3>Недооцененные по времени задачи (выборка из всех задач)</h3><table></table></div>'
        );
        const overstated = $(
            '<div class="jira-planned-hours-plan-accuracy-underestimated"><h3>Переоцененные по времени задачи (выборка только из выполненных задач)</h3><table></table></div>'
        );

        const underestimatedTable = underestimated.find('table');
        const overstatedTable = overstated.find('table');

        const fillTable = (tableElement: JQuery<HTMLElement>, tasks: ITaskInfo[]) => {
            tableElement.append(
                $(`
                <tr>
                    <th>ID</th>
                    <th>Заголовок</th>
                    <th>Исполнитель</th>
                    <th>Автор</th>
                    <th class="jira-planned-hours-plan-accuracy-time">Запланировано</th>
                    <th class="jira-planned-hours-plan-accuracy-time">Потрачено</th>
                    <th class="jira-planned-hours-plan-accuracy-time">Осталось</th>
                </tr>
            `)
            );

            for (let task of tasks) {
                if (task.details == null) {
                    throw new Error('missing details');
                }
                const details = task.details;

                let [asignee, author] = generateAsigneeAndAuthor(task);

                let leftClass = '';
                let deviation = Math.abs(details.plannedHours - details.spentHours);
                if (deviation < 2) {
                    leftClass = 'ac-green';
                } else if (deviation < 5) {
                    leftClass = 'ac-yellow';
                } else {
                    leftClass = 'ac-red';
                }

                tableElement.append(
                    $(`
                    <tr>
                        <td>
                            <a href="https://jira.kalabi.ru/browse/${task.id}">${task.id}</a>
                        </td>
                        <td>
                            ${task.details.title}
                        </td>
                        <td>
                            ${asignee}
                        </td>
                        <td>
                            ${author}
                        </td>
                        <td class="jira-planned-hours-plan-accuracy-time">
                            ${details.plannedHours.toFixed(1)}ч
                        </td>
                        <td class="jira-planned-hours-plan-accuracy-time">
                            ${details.spentHours.toFixed(1)}ч
                        </td>
                        <td class="jira-planned-hours-plan-accuracy-time ${leftClass}">
                            ${(details.plannedHours - details.spentHours).toFixed(1)}ч
                        </td>
                    </tr>
                `)
                );
            }
        };

        fillTable(underestimatedTable, underestimatedTasks);
        fillTable(overstatedTable, overstatedTasks);

        planAccuracy.append(underestimated);
        planAccuracy.append(overstated);

        return planAccuracy;
    }

    function showTasksInfo(tasksInfo: ITasksInfo): void {
        const infoElement = ELEMENTS['#jira-planned-hours-info-bar'];
        infoElement.get(0).innerHTML = '';

        const timeByPerson = generateTimeByPersonElement(tasksInfo);
        const tasksWithoutPlannedTime = generateTasksWithoutPlannedTimeElement(tasksInfo);
        const planAccuracy = generatePlanAccuracy(tasksInfo);

        infoElement.append(
            $(`<div>Дата последнего обновления: ${moment(tasksInfo.lastUpdateDate).format('DD.MM.YYYY HH:mm:ss')}</div>`)
        );

        addSpoilerBlock('Запланированное время для каждого человека', timeByPerson);
        addSpoilerBlock('Анализ отклонения от плана', planAccuracy);
        addSpoilerBlock('Задачи без запланированного времени', tasksWithoutPlannedTime);

        infoElement.css('display', 'block');
    }

    function clear() {
        stopLoadingBar();
        ELEMENTS['#jira-planned-hours-info-bar'].css('display', 'none');
        ELEMENTS['#jira-planned-hours-info-bar'].get(0).innerHTML = '';
        TXID += 1;
        clearTasksInfoFromLocalStorage();
    }

    async function countPlannedHours() {
        console.log('start counting');

        const [tasksIds, taskIdToColumnId] = getTaskIdsFromSprintPage();
        const tasksInfo = await getTasksInfo(tasksIds, taskIdToColumnId);
        saveTasksInfoToLocalStorage(tasksInfo);
        console.log(tasksInfo);
        showTasksInfo(tasksInfo);
    }
})();
