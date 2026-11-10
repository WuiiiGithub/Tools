(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config, Math: MathCore } = Visuo;

    const STORAGE_KEY = 'visuo.lab.datasets.v1';
    const DEFAULT_CLASS_COLORS = Config.DEFAULT_CLASS_COLORS.slice();
    const LAB_TRAIN_INTERVAL_MS = 55;
    const LAB_HUBER_DELTA = 1;

    const clone = value => JSON.parse(JSON.stringify(value));
    const escapeHtml = value => String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const formatNumber = (value, digits = 4) => {
        if (!Number.isFinite(value)) {
            return '—';
        }
        const normalized = Math.abs(value) < 1e-12 ? 0 : value;
        if (Math.abs(normalized) >= 1e6 || (Math.abs(normalized) > 0 && Math.abs(normalized) < 1e-4)) {
            return normalized.toExponential(2);
        }
        return normalized.toLocaleString(undefined, { maximumFractionDigits: digits });
    };
    const formatDate = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };
    const classColor = index => State.dataset.classColors[index]
        || DEFAULT_CLASS_COLORS[index]
        || DEFAULT_CLASS_COLORS[0];
    const classifyColor = index => State.dataset.classColors[index] || DEFAULT_CLASS_COLORS[index] || DEFAULT_CLASS_COLORS[0];
    const sigmoid = value => {
        if (value >= 0) {
            const z = Math.exp(-value);
            return 1 / (1 + z);
        }
        const z = Math.exp(value);
        return z / (1 + z);
    };
    const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const stdDev = function (values, average) {
        const variance = values.reduce((sum, value) => sum + Math.pow(value - average, 2), 0) / Math.max(1, values.length);
        return Math.sqrt(variance) || 1;
    };

    const getStoredDatasets = function () {
        try {
            const raw = global.localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    };

    const saveStoredDatasets = function (datasets) {
        try {
            global.localStorage.setItem(STORAGE_KEY, JSON.stringify(datasets));
            return true;
        } catch (error) {
            App.showToast('Dataset could not be saved in local storage', 'error');
            return false;
        }
    };

    const sanitizeCsvText = function (text) {
        return String(text || '').replace(/^\uFEFF/, '');
    };

    const validateCsvText = function (text) {
        const sourceText = sanitizeCsvText(text);
        if (sourceText.trim() === '') {
            return { ok: false, error: 'CSV is empty. Add a header row and at least one data row.' };
        }

        let parsedRows;
        try {
            parsedRows = App.parseCsv(sourceText);
        } catch (error) {
            return { ok: false, error: 'CSV could not be parsed.' };
        }

        const rows = parsedRows
            .map(row => row.map(cell => String(cell).trim()))
            .filter(row => row.some(cell => cell !== ''));

        if (rows.length < 2) {
            return { ok: false, error: 'CSV must contain a header row and at least one data row.' };
        }

        const headers = rows[0];
        const dataRows = rows.slice(1);
        if (headers.length < 2) {
            return { ok: false, error: 'CSV must have at least 2 columns.' };
        }
        if (headers.some(header => header === '')) {
            return { ok: false, error: 'CSV has an empty column name.' };
        }
        if (new Set(headers).size !== headers.length) {
            return { ok: false, error: 'CSV column names must be unique.' };
        }

        for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
            if (dataRows[rowIndex].length !== headers.length) {
                return {
                    ok: false,
                    error: `Row ${rowIndex + 2} has ${dataRows[rowIndex].length} values but ${headers.length} columns were expected.`
                };
            }
            for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
                if (dataRows[rowIndex][columnIndex] === '') {
                    return { ok: false, error: `Missing value at row ${rowIndex + 2}, column "${headers[columnIndex]}".` };
                }
            }
        }

        return { ok: true, sourceText, headers, rows: dataRows };
    };

    const setDataHubStatus = function (message, tone = 'neutral') {
        if (!DOM.labDataHubStatus) {
            return;
        }
        DOM.labDataHubStatus.textContent = message;
        DOM.labDataHubStatus.classList.remove('border-slate-200', 'bg-white/70', 'text-slate-500', 'border-emerald-200', 'bg-emerald-50', 'text-emerald-700', 'border-red-200', 'bg-red-50', 'text-red-700');
        if (tone === 'success') {
            DOM.labDataHubStatus.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
        } else if (tone === 'error') {
            DOM.labDataHubStatus.classList.add('border-red-200', 'bg-red-50', 'text-red-700');
        } else {
            DOM.labDataHubStatus.classList.add('border-slate-200', 'bg-white/70', 'text-slate-500');
        }
    };

    const getDatasetByName = name => getStoredDatasets().find(dataset => dataset.name === name) || null;

    const renderDatasetPreview = function () {
        if (!DOM.labDatasetPreview) {
            return;
        }
        const dataset = State.lab.pendingDataset ? getDatasetByName(State.lab.pendingDataset) : null;
        if (!dataset) {
            DOM.labDatasetPreview.classList.add('hidden');
            DOM.labDatasetPreview.innerHTML = '';
            return;
        }

        const validation = validateCsvText(dataset.csvText);
        const previewRows = validation.ok ? validation.rows.slice(0, 5) : [];
        const headerMarkup = validation.ok
            ? validation.headers.map(header => `<th class="whitespace-nowrap px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-indigo-700">${escapeHtml(header)}</th>`).join('')
            : '';
        const bodyMarkup = previewRows.map(row => `<tr>${row.map(cell => `<td class="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-slate-600">${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');

        DOM.labDatasetPreview.innerHTML = `
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                    <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">Preview</p>
                    <p class="mt-1 truncate text-sm font-bold text-slate-900">${escapeHtml(dataset.name)}</p>
                    <p class="mt-0.5 text-[11px] text-slate-500">${escapeHtml(dataset.fileName || dataset.name)} · ${dataset.rows} rows × ${dataset.columns} columns</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                    <button type="button" data-preview-cancel class="rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-indigo-50">Cancel</button>
                    <button type="button" data-preview-use class="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 hover:bg-indigo-700 active:translate-y-0">Use</button>
                </div>
            </div>
            ${validation.ok ? `
                <div class="mt-3 overflow-x-auto rounded-xl border border-indigo-100 bg-white">
                    <table class="min-w-full divide-y divide-indigo-100">
                        <thead class="bg-indigo-50/70"><tr>${headerMarkup}</tr></thead>
                        <tbody class="divide-y divide-slate-100">${bodyMarkup}</tbody>
                    </table>
                </div>
            ` : `<p class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">${escapeHtml(validation.error)}</p>`}
        `;
        DOM.labDatasetPreview.classList.remove('hidden');

        const useButton = DOM.labDatasetPreview.querySelector('[data-preview-use]');
        const cancelButton = DOM.labDatasetPreview.querySelector('[data-preview-cancel]');
        if (useButton) {
            useButton.addEventListener('click', () => {
                if (!validation.ok) {
                    setDataHubStatus(validation.error, 'error');
                    return;
                }
                App.useLabDataset(dataset.name);
            });
        }
        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                State.lab.pendingDataset = null;
                renderDatasetPreview();
            });
        }
    };

    const renderDataHubList = function () {
        if (!DOM.labDatasetList) {
            return;
        }

        const datasets = getStoredDatasets();
        const search = String(State.lab.search || '').trim().toLowerCase();
        const filtered = datasets.filter(dataset => dataset.name.toLowerCase().includes(search));
        if (DOM.labDataHubCount) {
            DOM.labDataHubCount.textContent = `${datasets.length} dataset${datasets.length === 1 ? '' : 's'}`;
        }

        DOM.labDatasetList.innerHTML = '';
        if (DOM.labDatasetEmpty) {
            DOM.labDatasetEmpty.classList.toggle('hidden', filtered.length > 0);
            DOM.labDatasetEmpty.textContent = datasets.length === 0
                ? 'No saved datasets yet. Upload a CSV to start the lab.'
                : 'No datasets match this search.';
        }

        filtered.forEach(dataset => {
            const row = document.createElement('div');
            row.className = 'group flex items-stretch gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 transition-colors hover:border-indigo-200 hover:bg-indigo-50/30';
            row.innerHTML = `
                <button type="button" class="lab-dataset-open flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left">
                    <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M.54 3.87.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.826a2 2 0 0 1-1.991-1.819l-.637-7a1.984 1.984 0 0 1 .342-1.31zM2.19 4a1 1 0 0 0-.996 1.09l.637 7a1 1 0 0 0 .995.91h10.348a1 1 0 0 0 .995-.91l.637-7A1 1 0 0 0 13.826 4H2.19z"/></svg>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-semibold text-slate-800">${escapeHtml(dataset.name)}</span>
                        <span class="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                            <span>${dataset.rows} × ${dataset.columns}</span>
                            <span class="text-slate-300">•</span>
                            <span>${formatDate(dataset.createdAt)}</span>
                        </span>
                    </span>
                </button>
                <button type="button" class="lab-dataset-delete flex w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-70 transition-colors hover:bg-red-50 hover:text-red-600 group-hover:opacity-100" title="Delete dataset" aria-label="Delete ${escapeHtml(dataset.name)}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.5a.5.5 0 0 0 0 1h.5V14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3.5h.5a.5.5 0 0 0 0-1H11ZM4.5 3h7A.5.5 0 0 1 12 3.5v10.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V3.5a.5.5 0 0 1 .5-.5Z"/></svg>
                </button>
            `;

            row.querySelector('.lab-dataset-open').addEventListener('click', () => {
                State.lab.pendingDataset = dataset.name;
                renderDatasetPreview();
            });
            row.querySelector('.lab-dataset-delete').addEventListener('click', event => {
                event.stopPropagation();
                App.confirmDeleteLabDataset(dataset.name);
            });
            DOM.labDatasetList.appendChild(row);
        });
    };

    App.renderDataHub = function () {
        renderDataHubList();
        renderDatasetPreview();
    };

    App.setLabStep = function (stepName) {
        const nextStep = ['datahub', 'preprocessing', 'modeling'].includes(stepName) ? stepName : 'datahub';
        State.lab.step = nextStep;

        DOM.labStepButtons.forEach(button => {
            const active = button.dataset.labStep === nextStep;
            button.classList.toggle('bg-slate-900', active);
            button.classList.toggle('text-white', active);
            button.classList.toggle('shadow-sm', active);
            button.classList.toggle('hover:bg-white', !active);
            button.classList.toggle('text-slate-600', !active);
            const caption = button.querySelector('span.min-w-0 > span:last-child');
            const badge = button.querySelector('span:first-child');
            if (caption) {
                caption.classList.toggle('opacity-60', active);
                caption.classList.toggle('text-slate-400', !active);
            }
            if (badge) {
                badge.classList.toggle('bg-white/10', active);
                badge.classList.toggle('text-white', active);
            }
        });

        DOM.labStepPanes.forEach(pane => {
            pane.classList.toggle('hidden', pane.dataset.labPane !== nextStep);
        });

        if (nextStep === 'datahub') {
            App.renderDataHub();
        } else if (nextStep === 'preprocessing') {
            App.refreshLabPreprocessing();
        } else if (nextStep === 'modeling') {
            App.syncLabModelingUi();
        }
    };

    App.refreshLabPreprocessing = function () {
        if (DOM.labActiveDatasetName) {
            DOM.labActiveDatasetName.textContent = State.lab.activeDatasetName || State.dataset.fileName || 'No dataset selected';
        }
        if (DOM.regressionTargetFields) {
            DOM.regressionTargetFields.classList.toggle('hidden', State.dataset.problemType !== 'regression');
        }
    };

    let dialogAction = null;

    const closeDataHubDialog = function () {
        if (!DOM.dataHubDialog) {
            return;
        }
        DOM.dataHubDialog.classList.add('hidden');
        DOM.dataHubDialogBody.innerHTML = '';
        dialogAction = null;
    };

    const openDataHubDialog = function (options) {
        if (!DOM.dataHubDialog) {
            return;
        }
        const {
            eyebrow = 'DataHub',
            title = 'Dialog',
            subtitle = '',
            body = '',
            confirmLabel = 'Continue',
            tone = 'amber'
        } = options;

        if (DOM.dataHubDialogEyebrow) {
            DOM.dataHubDialogEyebrow.textContent = eyebrow;
        }
        if (DOM.dataHubDialogTitle) {
            DOM.dataHubDialogTitle.textContent = title;
        }
        if (DOM.dataHubDialogSubtitle) {
            DOM.dataHubDialogSubtitle.textContent = subtitle;
        }
        DOM.dataHubDialogBody.innerHTML = body;
        if (DOM.dataHubDialogConfirmBtn) {
            DOM.dataHubDialogConfirmBtn.textContent = confirmLabel;
            DOM.dataHubDialogConfirmBtn.className = tone === 'red'
                ? 'rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-red-600/20 transition-all hover:-translate-y-0.5 hover:bg-red-700 active:translate-y-0'
                : 'rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-amber-600/20 transition-all hover:-translate-y-0.5 hover:bg-amber-700 active:translate-y-0';
        }
        dialogAction = options.onConfirm || null;
        DOM.dataHubDialog.classList.remove('hidden');
        const focusTarget = DOM.dataHubDialogBody.querySelector('input, button, select');
        if (focusTarget) {
            focusTarget.focus();
        }
    };

    const openSaveDatasetDialog = function (pending) {
        const defaultName = pending.fileName.replace(/\.csv$/i, '');
        openDataHubDialog({
            eyebrow: 'Upload dataset',
            title: 'Name this dataset',
            subtitle: `${pending.rows.length} rows × ${pending.headers.length} columns. Names must be unique.`,
            confirmLabel: 'Save dataset',
            body: `
                <label for="labDatasetNameInput" class="block">
                    <span class="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Dataset name</span>
                    <input id="labDatasetNameInput" type="text" value="${escapeHtml(defaultName)}" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-400/15">
                </label>
                <p id="labDatasetNameError" class="mt-2 hidden rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"></p>
            `,
            onConfirm: () => {
                const input = document.getElementById('labDatasetNameInput');
                const error = document.getElementById('labDatasetNameError');
                const name = input ? input.value.trim() : '';
                if (!name) {
                    if (error) {
                        error.textContent = 'Enter a dataset name.';
                        error.classList.remove('hidden');
                    }
                    return;
                }
                const datasets = getStoredDatasets();
                if (datasets.some(dataset => dataset.name.toLowerCase() === name.toLowerCase())) {
                    if (error) {
                        error.textContent = 'That dataset name already exists. Choose another name.';
                        error.classList.remove('hidden');
                    }
                    return;
                }
                datasets.unshift({
                    name,
                    fileName: pending.fileName,
                    csvText: pending.sourceText,
                    headers: pending.headers,
                    rows: pending.rows.length,
                    columns: pending.headers.length,
                    createdAt: new Date().toISOString()
                });
                if (!saveStoredDatasets(datasets)) {
                    return;
                }
                closeDataHubDialog();
                State.lab.pendingDataset = name;
                renderDataHubList();
                renderDatasetPreview();
                setDataHubStatus(`Saved "${name}" in this browser.`, 'success');
                App.showToast('Dataset saved', 'success');
            }
        });
    };

    App.confirmDeleteLabDataset = function (name) {
        const dataset = getDatasetByName(name);
        if (!dataset) {
            return;
        }
        openDataHubDialog({
            eyebrow: 'Delete dataset',
            title: `Delete "${dataset.name}"?`,
            subtitle: 'This removes it from local storage. This action cannot be undone.',
            confirmLabel: 'Delete dataset',
            tone: 'red',
            body: `
                <div class="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                    ${dataset.rows} rows × ${dataset.columns} columns · saved ${formatDate(dataset.createdAt)}
                </div>
            `,
            onConfirm: () => {
                const remaining = getStoredDatasets().filter(item => item.name !== name);
                if (!saveStoredDatasets(remaining)) {
                    return;
                }
                if (State.lab.pendingDataset === name) {
                    State.lab.pendingDataset = null;
                }
                if (State.lab.activeDatasetName === name) {
                    State.lab.activeDatasetName = '';
                }
                closeDataHubDialog();
                renderDataHubList();
                renderDatasetPreview();
                setDataHubStatus(`Deleted "${name}".`, 'success');
                App.showToast('Dataset deleted', 'info');
            }
        });
    };

    App.useLabDataset = function (name) {
        const dataset = getDatasetByName(name);
        if (!dataset) {
            setDataHubStatus('Dataset could not be found.', 'error');
            return false;
        }
        if (!App.importCsvText(dataset.csvText, dataset.name)) {
            setDataHubStatus('Dataset could not be loaded. Check its columns and values.', 'error');
            return false;
        }
        State.lab.activeDatasetName = name;
        State.lab.pendingDataset = name;
        if (DOM.labActiveDatasetName) {
            DOM.labActiveDatasetName.textContent = name;
        }
        setDataHubStatus(`Using "${name}". Choose inputs and classes next.`, 'success');
        App.setLabStep('preprocessing');
        App.showToast('Dataset ready for preprocessing', 'success');
        return true;
    };

    const handleDatasetFile = function (file) {
        if (!file) {
            return;
        }
        file.text().then(text => {
            const validation = validateCsvText(text);
            if (!validation.ok) {
                setDataHubStatus(validation.error, 'error');
                App.showToast('CSV could not be imported', 'error');
                return;
            }
            openSaveDatasetDialog({
                fileName: file.name || 'dataset.csv',
                sourceText: validation.sourceText,
                headers: validation.headers,
                rows: validation.rows
            });
        }).catch(() => {
            setDataHubStatus('Could not read the selected CSV file.', 'error');
        }).finally(() => {
            if (DOM.labDatasetFileInput) {
                DOM.labDatasetFileInput.value = '';
            }
        });
    };

    const readConfig = function () {
        const training = State.lab.training;
        const learningRate = MathCore.clamp(Number.parseFloat(DOM.labLearningRate ? DOM.labLearningRate.value : training.learningRate) || 0.03, 0.00001, 1);
        const validationSplit = MathCore.clamp(Number.parseFloat(DOM.labValidationSplit ? DOM.labValidationSplit.value : training.validationSplit) || 0, 0, 0.9);
        const epochs = Math.round(MathCore.clamp(Number.parseInt(DOM.labEpochs ? DOM.labEpochs.value : training.epochs, 10) || 50, 1, 1000));
        training.learningRate = learningRate;
        training.validationSplit = validationSplit;
        training.epochs = epochs;
        return {
            loss: DOM.labLossSelect ? DOM.labLossSelect.value : 'mse',
            optimizer: DOM.labOptimizerSelect ? DOM.labOptimizerSelect.value : 'adam',
            batchMode: DOM.labBatchModeSelect ? DOM.labBatchModeSelect.value : 'batch',
            learningRate,
            validationSplit,
            epochs
        };
    };

    const readClassIndex = function (row, dataset) {
        const outputIndex = dataset.headers.indexOf(dataset.outputColumn);
        const outputValue = row[outputIndex];
        const index = dataset.labelMapping.findIndex(item => String(item.encoded) === String(outputValue));
        return index === -1 ? 0 : index;
    };

    const buildSamples = function () {
        const dataset = State.dataset;
        if (!dataset.ready || !dataset.loaded || !dataset.plotPoints.length) {
            return null;
        }

        const classification = dataset.problemType === 'classification';
        const rows = classification ? (dataset.encodedRows || []) : dataset.rows;
        const xIndex = dataset.headers.indexOf(dataset.xFeature);
        const yIndex = dataset.headers.indexOf(dataset.yFeature);
        const targetXIndex = dataset.headers.indexOf(dataset.targetXFeature);
        const targetYIndex = dataset.headers.indexOf(dataset.targetYFeature);
        if (xIndex === -1 || yIndex === -1) {
            return null;
        }

        const rawInputs = [];
        const rawTargets = [];
        const samples = [];

        rows.forEach((row, index) => {
            const input = [Number(row[xIndex]), Number(row[yIndex])];
            if (!Number.isFinite(input[0]) || !Number.isFinite(input[1])) {
                return;
            }

            let target;
            let classIndex = 0;
            if (classification) {
                classIndex = readClassIndex(row, dataset);
                target = classIndex === 0 ? [1, 0] : [0, 1];
            } else {
                const targetX = dataset.targetXFeature === '__zero__'
                    ? 0
                    : (targetXIndex === -1 ? input[0] : Number(row[targetXIndex]));
                const targetY = dataset.targetYFeature === '__zero__'
                    ? 0
                    : (targetYIndex === -1 ? input[1] : Number(row[targetYIndex]));
                target = [Number.isFinite(targetX) ? targetX : 0, Number.isFinite(targetY) ? targetY : 0];
            }

            rawInputs.push(input);
            if (!classification) {
                rawTargets.push(target);
            }
            samples.push({ input, target, classIndex, sourceIndex: index });
        });

        if (samples.length === 0) {
            return null;
        }

        const inputColumns = [rawInputs.map(item => item[0]), rawInputs.map(item => item[1])];
        const inputMean = inputColumns.map(mean);
        const inputStd = inputColumns.map((values, index) => stdDev(values, inputMean[index]));
        const targetMean = classification ? [0, 0] : [mean(rawTargets.map(item => item[0])), mean(rawTargets.map(item => item[1]))];
        const targetStd = classification
            ? [1, 1]
            : [stdDev(rawTargets.map(item => item[0]), targetMean[0]), stdDev(rawTargets.map(item => item[1]), targetMean[1])];

        samples.forEach(sample => {
            sample.x = [
                (sample.input[0] - inputMean[0]) / inputStd[0],
                (sample.input[1] - inputMean[1]) / inputStd[1]
            ];
            sample.y = classification
                ? sample.target.slice()
                : [
                    (sample.target[0] - targetMean[0]) / targetStd[0],
                    (sample.target[1] - targetMean[1]) / targetStd[1]
                ];
        });

        return {
            samples,
            classification,
            inputMean,
            inputStd,
            targetMean,
            targetStd,
            targetLabels: classification ? [] : [
                dataset.targetXFeature || dataset.xFeature,
                dataset.targetYFeature || dataset.yFeature
            ]
        };
    };

    const hashString = function (value) {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    };

    const mulberry32 = function (seed) {
        return function () {
            let value = seed += 0x6D2B79F5;
            value = Math.imul(value ^ value >>> 15, value | 1);
            value ^= value + Math.imul(value ^ value >>> 7, value | 61);
            return ((value ^ value >>> 14) >>> 0) / 4294967296;
        };
    };

    const splitSamples = function (samples, validationSplit, rng) {
        const indices = samples.map((_, index) => index);
        for (let index = indices.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(rng() * (index + 1));
            [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
        }
        const validationCount = samples.length > 1 && validationSplit > 0
            ? Math.max(1, Math.min(samples.length - 1, Math.round(samples.length * validationSplit)))
            : 0;
        const validationIndices = new Set(indices.slice(0, validationCount));
        return {
            train: samples.filter((_, index) => !validationIndices.has(index)),
            validation: samples.filter((_, index) => validationIndices.has(index))
        };
    };

    const initModel = function (rng) {
        const random = () => {
            let u = 0;
            let v = 0;
            while (u === 0) {
                u = rng();
            }
            while (v === 0) {
                v = rng();
            }
            return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        };
        const scale = 0.8;
        return {
            W1: [[random() * scale, random() * scale], [random() * scale, random() * scale]],
            b1: [0, 0],
            W2: [[random() * scale, random() * scale], [random() * scale, random() * scale]],
            b2: [0, 0]
        };
    };

    const zeroGradients = () => ({
        W1: [[0, 0], [0, 0]],
        b1: [0, 0],
        W2: [[0, 0], [0, 0]],
        b2: [0, 0]
    });

    const forwardSample = function (model, x, classification) {
        const z1 = [
            model.W1[0][0] * x[0] + model.W1[0][1] * x[1] + model.b1[0],
            model.W1[1][0] * x[0] + model.W1[1][1] * x[1] + model.b1[1]
        ];
        const a1 = [Math.tanh(z1[0]), Math.tanh(z1[1])];
        const z2 = [
            model.W2[0][0] * a1[0] + model.W2[0][1] * a1[1] + model.b2[0],
            model.W2[1][0] * a1[0] + model.W2[1][1] * a1[1] + model.b2[1]
        ];
        const output = classification ? [sigmoid(z2[0]), sigmoid(z2[1])] : z2;
        return { x, z1, a1, z2, output };
    };

    const outputGradient = function (output, target, loss, classification) {
        if (classification) {
            return [(output[0] - target[0]) / 2, (output[1] - target[1]) / 2];
        }
        if (loss === 'mae') {
            return [Math.sign(output[0] - target[0]) / 2, Math.sign(output[1] - target[1]) / 2];
        }
        if (loss === 'huber') {
            return [
                MathCore.clamp(output[0] - target[0], -LAB_HUBER_DELTA, LAB_HUBER_DELTA) / 2,
                MathCore.clamp(output[1] - target[1], -LAB_HUBER_DELTA, LAB_HUBER_DELTA) / 2
            ];
        }
        return [output[0] - target[0], output[1] - target[1]];
    };

    const sampleLoss = function (output, target, loss, classification) {
        if (classification) {
            const clipped = output.map(value => MathCore.clamp(value, 1e-7, 1 - 1e-7));
            return -0.5 * (
                target[0] * Math.log(clipped[0]) + (1 - target[0]) * Math.log(1 - clipped[0]) +
                target[1] * Math.log(clipped[1]) + (1 - target[1]) * Math.log(1 - clipped[1])
            );
        }
        const differences = [output[0] - target[0], output[1] - target[1]];
        if (loss === 'mae') {
            return 0.5 * (Math.abs(differences[0]) + Math.abs(differences[1]));
        }
        if (loss === 'huber') {
            return 0.5 * differences.reduce((sum, difference) => {
                const absolute = Math.abs(difference);
                return sum + (absolute <= LAB_HUBER_DELTA
                    ? 0.5 * difference * difference
                    : LAB_HUBER_DELTA * (absolute - 0.5 * LAB_HUBER_DELTA));
            }, 0);
        }
        return 0.5 * (differences[0] * differences[0] + differences[1] * differences[1]);
    };

    const accumulateGradient = function (gradients, cache, target, loss, classification) {
        const dz2 = outputGradient(cache.output, target, loss, classification);
        for (let i = 0; i < 2; i++) {
            gradients.b2[i] += dz2[i];
            for (let j = 0; j < 2; j++) {
                gradients.W2[i][j] += dz2[i] * cache.a1[j];
            }
        }
        const da1 = [
            dz2[0] * cache.model.W2[0][0] + dz2[1] * cache.model.W2[1][0],
            dz2[0] * cache.model.W2[0][1] + dz2[1] * cache.model.W2[1][1]
        ];
        const dz1 = [
            da1[0] * (1 - cache.a1[0] * cache.a1[0]),
            da1[1] * (1 - cache.a1[1] * cache.a1[1])
        ];
        for (let i = 0; i < 2; i++) {
            gradients.b1[i] += dz1[i];
            for (let j = 0; j < 2; j++) {
                gradients.W1[i][j] += dz1[i] * cache.x[j];
            }
        }
    };

    const applyGradient = function (model, gradients, config, optimizerState) {
        if (config.optimizer === 'sgd') {
            ['b1', 'b2'].forEach(key => {
                for (let index = 0; index < 2; index++) {
                    model[key][index] -= config.learningRate * gradients[key][index];
                }
            });
            ['W1', 'W2'].forEach(key => {
                for (let row = 0; row < 2; row++) {
                    for (let column = 0; column < 2; column++) {
                        model[key][row][column] -= config.learningRate * gradients[key][row][column];
                    }
                }
            });
            return;
        }

        optimizerState.step += 1;
        const updateScalar = function (param, grad, key, index) {
            if (config.optimizer === 'momentum') {
                optimizerState.momentum[key][index] = 0.9 * optimizerState.momentum[key][index] - config.learningRate * grad;
                param[index] += optimizerState.momentum[key][index];
            } else if (config.optimizer === 'rmsprop') {
                optimizerState.velocity[key][index] = 0.9 * optimizerState.velocity[key][index] + 0.1 * grad * grad;
                param[index] -= config.learningRate * grad / (Math.sqrt(optimizerState.velocity[key][index]) + 1e-8);
            } else {
                optimizerState.momentum[key][index] = 0.9 * optimizerState.momentum[key][index] + 0.1 * grad;
                optimizerState.velocity[key][index] = 0.999 * optimizerState.velocity[key][index] + 0.001 * grad * grad;
                const mHat = optimizerState.momentum[key][index] / (1 - Math.pow(0.9, optimizerState.step));
                const vHat = optimizerState.velocity[key][index] / (1 - Math.pow(0.999, optimizerState.step));
                param[index] -= config.learningRate * mHat / (Math.sqrt(vHat) + 1e-8);
            }
        };

        ['b1', 'b2'].forEach(key => {
            for (let index = 0; index < 2; index++) {
                updateScalar(model[key], gradients[key][index], key, index);
            }
        });
        ['W1', 'W2'].forEach(key => {
            for (let row = 0; row < 2; row++) {
                for (let column = 0; column < 2; column++) {
                    updateScalar(model[key][row], gradients[key][row][column], key, [row, column]);
                }
            }
        });
    };

    const createOptimizerState = function () {
        return {
            step: 0,
            momentum: {
                W1: [[0, 0], [0, 0]], b1: [0, 0], W2: [[0, 0], [0, 0]], b2: [0, 0]
            },
            velocity: {
                W1: [[0, 0], [0, 0]], b1: [0, 0], W2: [[0, 0], [0, 0]], b2: [0, 0]
            }
        };
    };

    const batchSizeFor = function (mode, total) {
        if (mode === 'stochastic') {
            return 1;
        }
        if (mode === 'mini') {
            return Math.max(2, Math.min(16, Math.ceil(total / 8)));
        }
        return Math.max(1, total);
    };

    const trainEpoch = function (context) {
        const { training, config, rng } = context;
        const batches = [];
        const indices = context.trainSamples.map((_, index) => index);
        for (let index = indices.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(rng() * (index + 1));
            [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
        }

        const batchSize = batchSizeFor(config.batchMode, context.trainSamples.length);
        for (let start = 0; start < indices.length; start += batchSize) {
            const batch = indices.slice(start, start + batchSize).map(index => context.trainSamples[index]);
            const gradients = zeroGradients();
            batch.forEach(sample => {
                const cache = forwardSample(training.model, sample.x, context.classification);
                cache.model = training.model;
                accumulateGradient(gradients, cache, sample.y, config.loss, context.classification);
            });
            const divisor = Math.max(1, batch.length);
            ['b1', 'b2'].forEach(key => {
                gradients[key] = gradients[key].map(value => value / divisor);
            });
            ['W1', 'W2'].forEach(key => {
                gradients[key] = gradients[key].map(row => row.map(value => value / divisor));
            });
            applyGradient(training.model, gradients, config, context.optimizerState);
            batches.push(batch.length);
        }

        const evaluate = samples => {
            if (!samples.length) {
                return null;
            }
            return mean(samples.map(sample => {
                const output = forwardSample(training.model, sample.x, context.classification).output;
                return sampleLoss(output, sample.y, config.loss, context.classification);
            }));
        };

        return {
            loss: evaluate(context.trainSamples),
            validationLoss: evaluate(context.validationSamples)
        };
    };

    const applyModelToCascade = function (model, classification, scaler) {
        const inputStd = scaler ? scaler.inputStd : [1, 1];
        const inputMean = scaler ? scaler.inputMean : [0, 0];
        const firstValues = model.W1.map((row, rowIndex) => row.map((value, columnIndex) => value / inputStd[columnIndex]));
        const firstBias = model.b1.map((value, rowIndex) => {
            return value - (
                model.W1[rowIndex][0] * inputMean[0] / inputStd[0] +
                model.W1[rowIndex][1] * inputMean[1] / inputStd[1]
            );
        });
        const cascade = [
            {
                id: 'lab_w1',
                type: 'matrix',
                values: firstValues,
                bias: firstBias,
                isInverse: false,
                enabled: true
            },
            {
                id: 'lab_a1',
                type: 'activation',
                name: 'tanh',
                enabled: true
            },
            {
                id: 'lab_w2',
                type: 'matrix',
                values: clone(model.W2),
                bias: clone(model.b2),
                isInverse: false,
                enabled: true
            }
        ];
        if (classification) {
            cascade.push({
                id: 'lab_a2',
                type: 'activation',
                name: 'sigmoid',
                enabled: true
            });
        } else if (scaler) {
            cascade.push({
                id: 'lab_out',
                type: 'matrix',
                values: [[scaler.targetStd[0], 0], [0, scaler.targetStd[1]]],
                bias: scaler.targetMean.slice(),
                isInverse: false,
                enabled: true
            });
        }
        State.matrixCascade = cascade;
        State.activeActivationName = 'linear';
    };

    const buildPredictions = function (context) {
        const predictions = context.samples.map(sample => {
            const output = forwardSample(context.training.model, sample.x, context.classification).output;
            const predictedClass = context.classification ? (output[0] >= output[1] ? 0 : 1) : null;
            return {
                input: sample.input.slice(),
                x: sample.x.slice(),
                target: sample.target.slice(),
                y: sample.y.slice(),
                output,
                actualPoint: context.classification
                    ? (sample.classIndex === 0 ? [1, 0] : [0, 1])
                    : sample.target.slice(),
                predictedPoint: context.classification
                    ? output.slice()
                    : [
                        output[0] * context.targetStd[0] + context.targetMean[0],
                        output[1] * context.targetStd[1] + context.targetMean[1]
                    ],
                actualClass: sample.classIndex,
                predictedClass
            };
        });
        context.training.predictions = predictions;
        context.training.metrics = buildMetrics(predictions, context);
        return predictions;
    };

    const buildMetrics = function (predictions, context) {
        if (context.classification) {
            const labels = (State.dataset.labelMapping || []).map(item => item.label);
            const confusion = [[0, 0], [0, 0]];
            predictions.forEach(item => {
                confusion[item.actualClass][item.predictedClass] += 1;
            });
            const total = predictions.length || 1;
            const accuracy = (confusion[0][0] + confusion[1][1]) / total;
            const perClass = [0, 1].map(classIndex => {
                const truePositive = confusion[classIndex][classIndex];
                const falsePositive = confusion[1 - classIndex][classIndex];
                const falseNegative = confusion[classIndex][1 - classIndex];
                const precision = truePositive + falsePositive > 0 ? truePositive / (truePositive + falsePositive) : 0;
                const recall = truePositive + falseNegative > 0 ? truePositive / (truePositive + falseNegative) : 0;
                const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
                return {
                    label: labels[classIndex] || `Class ${classIndex + 1}`,
                    color: classifyColor(classIndex),
                    truePositive,
                    falsePositive,
                    falseNegative,
                    precision,
                    recall,
                    f1
                };
            });
            return { task: 'classification', labels, confusion, accuracy, perClass, count: predictions.length };
        }

        const mseValues = predictions.map(item => {
            const dx = item.predictedPoint[0] - item.target[0];
            const dy = item.predictedPoint[1] - item.target[1];
            return [dx * dx, dy * dy];
        });
        const maeValues = predictions.map(item => {
            return [Math.abs(item.predictedPoint[0] - item.target[0]), Math.abs(item.predictedPoint[1] - item.target[1])];
        });
        const targetMeans = [0, 1].map(index => mean(predictions.map(item => item.target[index])));
        const totalVariance = [0, 1].map(index => predictions.reduce((sum, item) => sum + Math.pow(item.target[index] - targetMeans[index], 2), 0));
        const residual = [0, 1].map(index => predictions.reduce((sum, item) => sum + Math.pow(item.target[index] - item.predictedPoint[index], 2), 0));
        const perOutput = [0, 1].map(index => {
            const mse = mean(mseValues.map(item => item[index]));
            const mae = mean(maeValues.map(item => item[index]));
            return {
                label: context.targetLabels[index] || `Output ${index + 1}`,
                mse,
                mae,
                rmse: Math.sqrt(mse),
                r2: totalVariance[index] > 1e-12 ? 1 - residual[index] / totalVariance[index] : 0
            };
        });
        const mse = mean(mseValues.map(item => item[0] + item[1])) / 2;
        return {
            task: 'regression',
            mse,
            mae: mean(maeValues.map(item => item[0] + item[1])) / 2,
            rmse: Math.sqrt(mse),
            r2: mean(perOutput.map(item => item.r2)),
            perOutput,
            count: predictions.length,
            targetLabels: context.targetLabels
        };
    };

    const syncTrainingButtons = function () {
        const training = State.lab.training;
        if (DOM.labPlayIcon) {
            DOM.labPlayIcon.classList.toggle('hidden', training.playing);
        }
        if (DOM.labPauseIcon) {
            DOM.labPauseIcon.classList.toggle('hidden', !training.playing);
        }
        if (DOM.labPlayLabel) {
            DOM.labPlayLabel.textContent = training.playing ? 'Pause' : (training.complete ? 'Replay' : 'Play');
        }
        if (DOM.labPlayBtn) {
            const ready = State.dataset.loaded && State.dataset.ready;
            DOM.labPlayBtn.disabled = !ready;
            DOM.labPlayBtn.classList.toggle('opacity-50', !ready);
            DOM.labPlayBtn.classList.toggle('cursor-not-allowed', !ready);
        }
    };

    const syncTrainingReadout = function () {
        const training = State.lab.training;
        const epochs = Math.max(1, training.epochs || 1);
        const percent = Math.round((training.epoch / epochs) * 100);
        if (DOM.labTrainingProgress) {
            DOM.labTrainingProgress.style.width = `${MathCore.clamp(percent, 0, 100)}%`;
        }
        if (DOM.labTrainingPercent) {
            DOM.labTrainingPercent.textContent = `${MathCore.clamp(percent, 0, 100)}%`;
        }
        if (DOM.labEpochLabel) {
            DOM.labEpochLabel.textContent = `Epoch ${training.epoch} / ${epochs}`;
        }
        const last = training.history[training.history.length - 1];
        if (DOM.labTrainLoss) {
            DOM.labTrainLoss.textContent = last && Number.isFinite(last.loss) ? formatNumber(last.loss, 5) : '—';
        }
        if (DOM.labValLoss) {
            DOM.labValLoss.textContent = last && Number.isFinite(last.validationLoss) ? formatNumber(last.validationLoss, 5) : '—';
        }
        if (DOM.labModelStatus) {
            if (!State.dataset.loaded) {
                DOM.labModelStatus.textContent = 'Load prepared points, then press play to train epoch by epoch.';
            } else if (training.playing) {
                DOM.labModelStatus.textContent = `Training epoch ${training.epoch} of ${epochs}. The red space updates every epoch.`;
            } else if (training.complete) {
                DOM.labModelStatus.textContent = `Training complete at epoch ${training.epoch}. Use the floating buttons for predictions and the report.`;
            } else if (training.epoch > 0) {
                DOM.labModelStatus.textContent = `Paused at epoch ${training.epoch}. Press play to continue.`;
            } else {
                DOM.labModelStatus.textContent = `${State.dataset.problemType === 'classification' ? 'Classification' : 'Regression'} data loaded. Press play to begin.`;
            }
        }
        syncTrainingButtons();
    };

    App.syncLabModelingUi = function () {
        const training = State.lab.training;
        if (DOM.labLossSelect) {
            DOM.labLossSelect.value = DOM.labLossSelect.value || 'mse';
        }
        syncTrainingReadout();
        if (DOM.labResultActions) {
            DOM.labResultActions.classList.toggle('hidden', !training.complete);
        }
        if (DOM.labPredictionToggleBtn) {
            DOM.labPredictionToggleBtn.setAttribute('aria-pressed', String(Boolean(training.showPredictions)));
            DOM.labPredictionToggleBtn.classList.toggle('text-indigo-600', Boolean(training.showPredictions));
            DOM.labPredictionToggleBtn.classList.toggle('bg-indigo-50', Boolean(training.showPredictions));
        }
    };

    App.resetLabTraining = function (options = {}) {
        const training = State.lab.training;
        if (training.timer) {
            clearTimeout(training.timer);
            training.timer = null;
        }
        training.active = false;
        training.playing = false;
        training.complete = false;
        training.epoch = 0;
        training.history = [];
        training.model = null;
        training.scaler = null;
        training.predictions = [];
        training.metrics = null;
        training.showPredictions = false;
        if (DOM.labResultActions) {
            DOM.labResultActions.classList.add('hidden');
        }
        if (!options.keepDataset && State.dataset.loaded) {
            State.matrixCascade = [];
            App.renderMatrixCascade();
            App.drawScene();
        }
        syncTrainingReadout();
        return true;
    };

    App.onLabDatasetLoaded = function () {
        App.setLabStep('modeling');
        App.resetLabTraining({ keepDataset: true });
        App.syncLabModelingUi();
        if (DOM.labModelStatus) {
            DOM.labModelStatus.textContent = 'Points loaded. Press play to train the red space epoch by epoch.';
        }
        App.showToast('Ready to model', 'success');
    };

    const trainingContext = function (config) {
        const prepared = buildSamples();
        if (!prepared) {
            App.showToast('Load two numeric input features before training', 'error');
            return null;
        }
        const rng = mulberry32(hashString(`${State.dataset.fileName}:${State.dataset.xFeature}:${State.dataset.yFeature}:${State.dataset.problemType}:${config.epochs}`));
        const split = splitSamples(prepared.samples, config.validationSplit, rng);
        if (split.train.length === 0) {
            App.showToast('Not enough rows to train', 'error');
            return null;
        }

        const training = State.lab.training;
        training.model = initModel(rng);
        training.scaler = {
            inputMean: prepared.inputMean,
            inputStd: prepared.inputStd,
            targetMean: prepared.targetMean,
            targetStd: prepared.targetStd
        };
        applyModelToCascade(training.model, prepared.classification, training.scaler);
        App.renderMatrixCascade();
        App.fitViewToScene();
        App.drawScene();

        return {
            training,
            config,
            rng,
            classification: prepared.classification,
            samples: prepared.samples,
            trainSamples: split.train,
            validationSamples: split.validation,
            inputMean: prepared.inputMean,
            inputStd: prepared.inputStd,
            targetMean: prepared.targetMean,
            targetStd: prepared.targetStd,
            targetLabels: prepared.targetLabels,
            optimizerState: createOptimizerState()
        };
    };

    let activeContext = null;

    const finishTraining = function () {
        const training = State.lab.training;
        training.playing = false;
        training.active = false;
        training.complete = true;
        if (training.timer) {
            clearTimeout(training.timer);
            training.timer = null;
        }
        if (activeContext) {
            buildPredictions(activeContext);
        }
        App.renderMatrixCascade();
        App.drawScene();
        App.syncLabModelingUi();
        if (DOM.labModelHint) {
            DOM.labModelHint.textContent = training.metrics && training.metrics.task === 'classification'
                ? 'Classification uses colors for classes. The report shows accuracy, precision, recall, F1, and the confusion matrix.'
                : 'Regression report includes MSE, MAE, RMSE, and R² for each selected target.';
        }
        App.showToast('Training complete', 'success');
    };

    const scheduleTrainingTick = function () {
        const training = State.lab.training;
        if (!training.active || !training.playing || !activeContext) {
            return;
        }
        training.timer = setTimeout(() => {
            training.timer = null;
            if (!training.active || !training.playing || !activeContext) {
                return;
            }
            const result = trainEpoch(activeContext);
            training.epoch += 1;
            training.history.push({
                epoch: training.epoch,
                loss: result.loss,
                validationLoss: result.validationLoss
            });
            applyModelToCascade(training.model, activeContext.classification, training.scaler);
            App.drawScene();
            syncTrainingReadout();
            if (training.epoch >= training.epochs) {
                finishTraining();
                return;
            }
            scheduleTrainingTick();
        }, LAB_TRAIN_INTERVAL_MS);
    };

    const beginTraining = function () {
        const config = readConfig();
        const training = State.lab.training;
        if (training.timer) {
            clearTimeout(training.timer);
            training.timer = null;
        }
        training.active = false;
        training.playing = false;
        training.complete = false;
        training.epoch = 0;
        training.history = [];
        training.predictions = [];
        training.metrics = null;
        training.showPredictions = false;
        activeContext = trainingContext(config);
        if (!activeContext) {
            return false;
        }
        training.active = true;
        training.playing = true;
        training.complete = false;
        if (DOM.labResultActions) {
            DOM.labResultActions.classList.add('hidden');
        }
        syncTrainingReadout();
        scheduleTrainingTick();
        return true;
    };

    App.toggleLabTraining = function () {
        const training = State.lab.training;
        if (!State.dataset.loaded || !State.dataset.ready) {
            App.showToast('Load prepared points first', 'error');
            return;
        }
        if (training.playing) {
            training.playing = false;
            if (training.timer) {
                clearTimeout(training.timer);
                training.timer = null;
            }
            syncTrainingReadout();
            return;
        }
        if (training.complete) {
            App.resetLabTraining({ keepDataset: true });
            beginTraining();
            return;
        }
        if (training.active && training.epoch > 0) {
            training.playing = true;
            syncTrainingReadout();
            scheduleTrainingTick();
            return;
        }
        beginTraining();
    };

    App.openLabReport = function () {
        const training = State.lab.training;
        if (!training.history.length) {
            App.showToast('Train the model before opening the report', 'error');
            return;
        }
        if (activeContext) {
            buildPredictions(activeContext);
        }
        if (DOM.labReportModal) {
            DOM.labReportModal.classList.remove('hidden');
        }
        renderReport();
        requestAnimationFrame(drawLossChart);
    };

    App.closeLabReport = function () {
        if (DOM.labReportModal) {
            DOM.labReportModal.classList.add('hidden');
        }
    };

    App.toggleLabPredictions = function () {
        const training = State.lab.training;
        if (!training.complete) {
            return;
        }
        training.showPredictions = !training.showPredictions;
        App.syncLabModelingUi();
        App.drawScene();
    };

    const metricCard = (label, value, tone = 'slate') => `
        <div class="rounded-2xl border border-${tone}-200 bg-${tone}-50/60 px-4 py-3">
            <p class="text-[10px] font-semibold uppercase tracking-wider text-${tone}-600">${escapeHtml(label)}</p>
            <p class="mt-1 font-mono text-xl font-bold text-slate-900">${escapeHtml(value)}</p>
        </div>
    `;

    const renderReport = function () {
        const training = State.lab.training;
        const metrics = training.metrics;
        const last = training.history[training.history.length - 1] || { loss: null, validationLoss: null };
        if (DOM.labReportEpochBadge) {
            DOM.labReportEpochBadge.textContent = `${training.epoch} epoch${training.epoch === 1 ? '' : 's'}`;
        }
        if (DOM.labReportSubtitle) {
            DOM.labReportSubtitle.textContent = metrics && metrics.task === 'classification'
                ? 'Loss curves and colored class diagnostics from the current model.'
                : 'Loss curves and regression metrics from the current model.';
        }
        if (DOM.labReportSummary) {
            const summary = metrics && metrics.task === 'classification'
                ? [
                    metricCard('Accuracy', `${(metrics.accuracy * 100).toFixed(1)}%`, 'emerald'),
                    metricCard('Training loss', formatNumber(last.loss, 5), 'indigo'),
                    metricCard('Validation loss', formatNumber(last.validationLoss, 5), 'amber'),
                    metricCard('Samples', String(metrics.count), 'slate')
                ].join('')
                : [
                    metricCard('MSE', metrics ? formatNumber(metrics.mse, 5) : '—', 'blue'),
                    metricCard('RMSE', metrics ? formatNumber(metrics.rmse, 5) : '—', 'blue'),
                    metricCard('MAE', metrics ? formatNumber(metrics.mae, 5) : '—', 'blue'),
                    metricCard('R²', metrics ? formatNumber(metrics.r2, 4) : '—', 'indigo')
                ].join('');
            DOM.labReportSummary.innerHTML = summary;
        }

        if (!DOM.labReportDetail) {
            return;
        }

        if (!metrics) {
            DOM.labReportDetail.innerHTML = '<p class="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Metrics will appear after the first epoch.</p>';
            return;
        }

        if (metrics.task === 'classification') {
            const rows = metrics.perClass.map((item, index) => `
                <tr class="border-t border-slate-100">
                    <td class="px-3 py-2">
                        <span class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <span class="h-2.5 w-2.5 rounded-full" style="background:${item.color}"></span>${escapeHtml(item.label)}
                        </span>
                    </td>
                    <td class="px-3 py-2 font-mono text-xs text-slate-600">${(item.precision * 100).toFixed(1)}%</td>
                    <td class="px-3 py-2 font-mono text-xs text-slate-600">${(item.recall * 100).toFixed(1)}%</td>
                    <td class="px-3 py-2 font-mono text-xs text-slate-600">${(item.f1 * 100).toFixed(1)}%</td>
                    <td class="px-3 py-2 font-mono text-xs text-slate-600">${item.truePositive}</td>
                </tr>
            `).join('');
            const confusionMatrix = [0, 1].map(actual => [0, 1].map(predicted => `
                <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center">
                    <p class="text-[10px] font-semibold uppercase tracking-wider text-slate-400">${escapeHtml(metrics.labels[actual] || `Class ${actual + 1}`)} → ${escapeHtml(metrics.labels[predicted] || `Class ${predicted + 1}`)}</p>
                    <p class="mt-1 font-mono text-lg font-bold text-slate-800">${metrics.confusion[actual][predicted]}</p>
                </div>
            `).join('')).join('');

            DOM.labReportDetail.innerHTML = `
                <div class="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div class="rounded-2xl border border-slate-200 bg-white p-4">
                        <p class="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Classification report</p>
                        <div class="overflow-x-auto">
                            <table class="min-w-full text-left">
                                <thead>
                                    <tr class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        <th class="px-3 py-2">Class</th><th class="px-3 py-2">Precision</th><th class="px-3 py-2">Recall</th><th class="px-3 py-2">F1</th><th class="px-3 py-2">TP</th>
                                    </tr>
                                </thead>
                                <tbody>${rows}</tbody>
                            </table>
                        </div>
                    </div>
                    <div class="rounded-2xl border border-slate-200 bg-white p-4">
                        <p class="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Confusion matrix</p>
                        <div class="grid grid-cols-2 gap-2">${confusionMatrix}</div>
                    </div>
                </div>
            `;
            return;
        }

        const rows = metrics.perOutput.map(item => `
            <tr class="border-t border-slate-100">
                <td class="px-3 py-2 text-xs font-semibold text-slate-700">${escapeHtml(item.label)}</td>
                <td class="px-3 py-2 font-mono text-xs text-slate-600">${formatNumber(item.mse, 5)}</td>
                <td class="px-3 py-2 font-mono text-xs text-slate-600">${formatNumber(item.mae, 5)}</td>
                <td class="px-3 py-2 font-mono text-xs text-slate-600">${formatNumber(item.rmse, 5)}</td>
                <td class="px-3 py-2 font-mono text-xs text-slate-600">${formatNumber(item.r2, 4)}</td>
            </tr>
        `).join('');

        DOM.labReportDetail.innerHTML = `
            <div class="rounded-2xl border border-slate-200 bg-white p-4">
                <p class="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Regression metrics</p>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-left">
                        <thead>
                            <tr class="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                <th class="px-3 py-2">Target</th><th class="px-3 py-2">MSE</th><th class="px-3 py-2">MAE</th><th class="px-3 py-2">RMSE</th><th class="px-3 py-2">R²</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    };

    const drawLossChart = function () {
        const canvas = DOM.labLossChart;
        if (!canvas) {
            return;
        }
        const context = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const ratio = global.devicePixelRatio || 1;
        const width = Math.max(240, rect.width);
        const height = Math.max(160, rect.height || 224);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, width, height);

        const history = State.lab.training.history;
        const padding = { left: 42, right: 12, top: 14, bottom: 26 };
        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;
        const values = history.flatMap(item => [item.loss, item.validationLoss]).filter(Number.isFinite);
        if (values.length === 0) {
            context.fillStyle = '#94a3b8';
            context.font = '11px sans-serif';
            context.fillText('No epochs yet', padding.left, height / 2);
            return;
        }
        const maxValue = Math.max(...values, 1e-8) * 1.08;
        const minValue = 0;

        context.strokeStyle = '#e2e8f0';
        context.lineWidth = 1;
        context.fillStyle = '#94a3b8';
        context.font = '9px sans-serif';
        context.textAlign = 'right';
        context.textBaseline = 'middle';
        for (let step = 0; step <= 4; step++) {
            const y = padding.top + (plotHeight * step) / 4;
            const value = maxValue - ((maxValue - minValue) * step) / 4;
            context.beginPath();
            context.moveTo(padding.left, y);
            context.lineTo(width - padding.right, y);
            context.stroke();
            context.fillText(formatNumber(value, 2), padding.left - 6, y);
        }

        const drawLine = (key, color) => {
            context.beginPath();
            history.forEach((item, index) => {
                if (!Number.isFinite(item[key])) {
                    return;
                }
                const x = padding.left + (history.length === 1 ? plotWidth / 2 : (plotWidth * index) / (history.length - 1));
                const y = padding.top + plotHeight - ((item[key] - minValue) / (maxValue - minValue)) * plotHeight;
                if (index === 0) {
                    context.moveTo(x, y);
                } else {
                    context.lineTo(x, y);
                }
            });
            context.strokeStyle = color;
            context.lineWidth = 2;
            context.lineJoin = 'round';
            context.lineCap = 'round';
            context.stroke();
        };

        drawLine('loss', '#6366f1');
        drawLine('validationLoss', '#f59e0b');

        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = '#94a3b8';
        context.fillText('1', padding.left, height - padding.bottom + 8);
        context.textAlign = 'right';
        context.fillText(String(history.length), width - padding.right, height - padding.bottom + 8);
    };

    const initializeDialogEvents = function () {
        if (DOM.dataHubDialogConfirmBtn) {
            DOM.dataHubDialogConfirmBtn.addEventListener('click', () => {
                if (dialogAction) {
                    dialogAction();
                }
            });
        }
        [DOM.dataHubDialogCancelBtn, DOM.dataHubDialogCloseBtn, DOM.dataHubDialogBackdrop].forEach(element => {
            if (element) {
                element.addEventListener('click', closeDataHubDialog);
            }
        });
        if (DOM.labReportBtn) {
            DOM.labReportBtn.addEventListener('click', App.openLabReport);
        }
        if (DOM.labPredictionToggleBtn) {
            DOM.labPredictionToggleBtn.addEventListener('click', App.toggleLabPredictions);
        }
        [DOM.closeLabReportBtn, DOM.labReportDoneBtn, DOM.labReportBackdrop].forEach(element => {
            if (element) {
                element.addEventListener('click', App.closeLabReport);
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape') {
                return;
            }
            if (DOM.dataHubDialog && !DOM.dataHubDialog.classList.contains('hidden')) {
                closeDataHubDialog();
                event.stopPropagation();
                return;
            }
            if (DOM.labReportModal && !DOM.labReportModal.classList.contains('hidden')) {
                App.closeLabReport();
                event.stopPropagation();
            }
        }, true);
    };

    App.drawLabDatasetPoints = function (context, mapPoint, space, viewMap) {
        const dataset = State.dataset;
        const training = State.lab.training;
        if (!dataset.loaded || !dataset.plotPoints.length || (!training.active && !training.complete)) {
            return false;
        }

        const drawPoint = function (point, color, options = {}) {
            const canvasPoint = App.toCanvasCoords(point[0], point[1]);
            if (!Number.isFinite(canvasPoint.cx) || !Number.isFinite(canvasPoint.cy)) {
                return;
            }
            context.save();
            context.beginPath();
            context.arc(canvasPoint.cx, canvasPoint.cy, options.radius || 5.5, 0, Math.PI * 2);
            if (options.dashed) {
                context.setLineDash([3, 3]);
                context.lineWidth = 2;
                context.strokeStyle = color;
                context.globalAlpha = 0.95;
                context.stroke();
            } else {
                context.fillStyle = color;
                context.globalAlpha = options.alpha == null ? 0.95 : options.alpha;
                context.fill();
                context.setLineDash([]);
                context.lineWidth = 1.5;
                context.strokeStyle = 'rgba(255,255,255,0.95)';
                context.stroke();
                if (options.ring) {
                    context.beginPath();
                    context.arc(canvasPoint.cx, canvasPoint.cy, (options.radius || 5.5) + 2.5, 0, Math.PI * 2);
                    context.strokeStyle = color;
                    context.lineWidth = 1.5;
                    context.stroke();
                }
            }
            context.restore();
        };

        if (space === 'original') {
            if (training.complete) {
                dataset.plotPoints.forEach(item => drawPoint(mapPoint(item.point), classifyColor(item.classIndex), { radius: 5.5 }));
            }
            return true;
        }

        if (!training.complete) {
            dataset.plotPoints.forEach(item => drawPoint(mapPoint(item.point), classifyColor(item.classIndex), { radius: 5, alpha: 0.9 }));
            return true;
        }

        const outputMap = typeof viewMap === 'function' ? viewMap : mapPoint;
        training.predictions.forEach(item => {
            const color = classifyColor(item.actualClass);
            drawPoint(outputMap(item.actualPoint), color, { radius: 5.5, ring: true });
            if (training.showPredictions) {
                drawPoint(outputMap(item.predictedPoint), color, { radius: 6.5, dashed: true });
            }
        });
        return true;
    };

    App.initLab = function () {
        if (!DOM.labStepButtons || !DOM.labDatasetList) {
            return;
        }

        const originalSetSettingsTab = App.setSettingsTab;
        if (typeof originalSetSettingsTab === 'function') {
            App.setSettingsTab = function (tabName) {
                originalSetSettingsTab(tabName);
                if (tabName === 'data') {
                    App.setLabStep(State.lab.step || 'datahub');
                }
            };
        }

        DOM.labStepButtons.forEach(button => {
            button.addEventListener('click', () => App.setLabStep(button.dataset.labStep));
        });

        if (DOM.labDatasetSearch) {
            DOM.labDatasetSearch.addEventListener('input', () => {
                State.lab.search = DOM.labDatasetSearch.value;
                renderDataHubList();
            });
        }

        if (DOM.labUploadDataBtn && DOM.labDatasetFileInput) {
            DOM.labUploadDataBtn.addEventListener('click', () => DOM.labDatasetFileInput.click());
            DOM.labDatasetFileInput.addEventListener('change', event => {
                handleDatasetFile(event.target.files && event.target.files[0]);
            });
        }

        [DOM.labLossSelect, DOM.labOptimizerSelect, DOM.labBatchModeSelect, DOM.labLearningRate, DOM.labValidationSplit, DOM.labEpochs].forEach(input => {
            if (!input) {
                return;
            }
            input.addEventListener('change', () => {
                readConfig();
                App.syncLabModelingUi();
            });
        });

        if (DOM.labPlayBtn) {
            DOM.labPlayBtn.addEventListener('click', App.toggleLabTraining);
        }
        if (DOM.labResetBtn) {
            DOM.labResetBtn.addEventListener('click', () => {
                App.resetLabTraining();
                App.showToast('Training reset', 'info');
            });
        }

        initializeDialogEvents();
        App.renderDataHub();
        App.setLabStep(State.lab.step || 'datahub');
        App.syncLabModelingUi();
    };
})(window);
