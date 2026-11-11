(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config } = Visuo;

    const parseCsv = function (text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (inQuotes) {
                if (char === '"') {
                    if (text[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += char;
                }
                continue;
            }

            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(field);
                field = '';
            } else if (char === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else if (char !== '\r') {
                field += char;
            }
        }

        if (field !== '' || row.length > 0) {
            row.push(field);
            rows.push(row);
        }

        return rows;
    };

    const setError = function (message) {
        if (!DOM.csvError) {
            return;
        }

        DOM.csvError.textContent = message;
        DOM.csvError.classList.remove('hidden');
    };

    const clearError = function () {
        if (!DOM.csvError) {
            return;
        }

        DOM.csvError.textContent = '';
        DOM.csvError.classList.add('hidden');
    };

    const setStatus = function (message, tone = 'neutral') {
        if (!DOM.csvStatus) {
            return;
        }

        DOM.csvStatus.textContent = message;
        DOM.csvStatus.classList.remove('border-slate-200', 'bg-white/70', 'text-slate-500', 'border-emerald-200', 'bg-emerald-50', 'text-emerald-700', 'border-amber-200', 'bg-amber-50', 'text-amber-700');

        if (tone === 'success') {
            DOM.csvStatus.classList.add('border-emerald-200', 'bg-emerald-50', 'text-emerald-700');
        } else if (tone === 'warning') {
            DOM.csvStatus.classList.add('border-amber-200', 'bg-amber-50', 'text-amber-700');
        } else {
            DOM.csvStatus.classList.add('border-slate-200', 'bg-white/70', 'text-slate-500');
        }
    };

    const setSelectOptions = function (select, values, selectedValue) {
        if (!select) {
            return;
        }

        select.innerHTML = '';
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });
        select.value = values.includes(selectedValue) ? selectedValue : (values[0] || '');
    };

    const setOutputOptions = function (select, values, selectedValue) {
        if (!select) {
            return;
        }

        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Choose a class column';
        select.appendChild(placeholder);

        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.appendChild(option);
        });

        select.value = values.includes(selectedValue) ? selectedValue : '';
    };

    const isNumericValue = value => value !== '' && Number.isFinite(Number(value));

    const getColumnIndex = name => State.dataset.headers.indexOf(name);

    const isNumericColumn = function (name, rows = State.dataset.rows) {
        const index = getColumnIndex(name);
        if (index === -1) {
            return false;
        }

        return rows.every(row => isNumericValue(row[index]));
    };

    const getOutputClasses = function () {
        const outputIndex = getColumnIndex(State.dataset.outputColumn);
        if (outputIndex === -1) {
            return [];
        }

        const seen = new Set();
        const classes = [];
        State.dataset.rows.forEach(row => {
            const value = row[outputIndex];
            if (!seen.has(value)) {
                seen.add(value);
                classes.push(value);
            }
        });
        return classes;
    };

    const setClassOptions = function (select, classes, selectedValue) {
        if (!select) {
            return;
        }

        select.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select class';
        select.appendChild(placeholder);

        classes.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            select.appendChild(option);
        });

        select.value = classes.includes(selectedValue) ? selectedValue : '';
    };

    const updateClassSelectionUi = function () {
        const dataset = State.dataset;
        const classes = dataset.outputClasses || [];
        const isClassification = dataset.valid && dataset.problemType === 'classification';
        const show = isClassification && classes.length > 2;

        if (DOM.outputColumnField) {
            DOM.outputColumnField.classList.toggle('hidden', !isClassification);
        }

        if (DOM.classSelection) {
            DOM.classSelection.classList.toggle('hidden', !show);
        }

        if (!show) {
            return;
        }

        if (DOM.classSelectionHint) {
            DOM.classSelectionHint.textContent = `Class column "${dataset.outputColumn}" has ${classes.length} classes. Choose exactly two classes to keep.`;
        }

        setClassOptions(DOM.classASelect, classes, dataset.selectedClasses[0] || '');
        setClassOptions(DOM.classBSelect, classes, dataset.selectedClasses[1] || '');
    };

    const updateEncodingSummary = function () {
        if (!DOM.encodingSummary) {
            return;
        }

        const dataset = State.dataset;
        if (dataset.problemType !== 'classification' || dataset.labelMapping.length === 0) {
            DOM.encodingSummary.textContent = '';
            DOM.encodingSummary.classList.add('hidden');
            return;
        }

        const mappingText = dataset.labelMapping
            .map(item => `${item.label} → ${item.encoded}`)
            .join('  ·  ');
        DOM.encodingSummary.textContent = dataset.labelEncodingRequired
            ? `Label encoded: ${mappingText}`
            : `Numeric classes kept: ${mappingText}`;
        DOM.encodingSummary.classList.remove('hidden');
    };

    const normalizeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;

    const updateClassColorsUi = function () {
        if (!DOM.classColorRow) {
            return;
        }

        const dataset = State.dataset;
        const visible = dataset.problemType === 'classification' && dataset.labelMapping.length === 2;
        DOM.classColorRow.classList.toggle('hidden', !visible);

        if (!visible) {
            return;
        }

        if (DOM.classAColorInput) {
            DOM.classAColorInput.value = normalizeColor(dataset.classColors[0], Config.DEFAULT_CLASS_COLORS[0]);
        }
        if (DOM.classBColorInput) {
            DOM.classBColorInput.value = normalizeColor(dataset.classColors[1], Config.DEFAULT_CLASS_COLORS[1]);
        }
        if (DOM.classAColorLabel) {
            DOM.classAColorLabel.textContent = dataset.labelMapping[0] ? dataset.labelMapping[0].label : 'Class 1';
        }
        if (DOM.classBColorLabel) {
            DOM.classBColorLabel.textContent = dataset.labelMapping[1] ? dataset.labelMapping[1].label : 'Class 2';
        }
    };

    const updateClearButton = function () {
        if (!DOM.clearDataBtn) {
            return;
        }

        const canClear = State.dataset.valid;
        DOM.clearDataBtn.disabled = !canClear;
        DOM.clearDataBtn.classList.toggle('cursor-not-allowed', !canClear);
        DOM.clearDataBtn.classList.toggle('opacity-50', !canClear);
        DOM.clearDataBtn.classList.toggle('cursor-pointer', canClear);
        DOM.clearDataBtn.classList.toggle('hover:bg-white', canClear);
        DOM.clearDataBtn.classList.toggle('hover:text-amber-900', canClear);
    };

    const updateLoadButton = function () {
        updateClearButton();

        if (!DOM.loadPointsBtn) {
            return;
        }

        const dataset = State.dataset;
        const canLoad = dataset.ready && !dataset.loading;
        DOM.loadPointsBtn.disabled = !canLoad;
        DOM.loadPointsBtn.classList.toggle('cursor-not-allowed', !canLoad);
        DOM.loadPointsBtn.classList.toggle('cursor-pointer', canLoad);
        DOM.loadPointsBtn.classList.toggle('opacity-50', !canLoad);
        DOM.loadPointsBtn.classList.toggle('hover:-translate-y-0.5', canLoad);

        if (DOM.loadPointsLabel) {
            DOM.loadPointsLabel.textContent = dataset.loading
                ? 'Loading...'
                : (dataset.loaded ? 'Reload points' : 'Load points');
        }

        if (DOM.loadPointsSpinner) {
            DOM.loadPointsSpinner.classList.toggle('hidden', !dataset.loading);
        }

        if (DOM.dataLoadHint) {
            if (dataset.loading) {
                DOM.dataLoadHint.textContent = 'Preparing points and clearing the cascade...';
            } else if (dataset.loaded) {
                DOM.dataLoadHint.textContent = 'Points loaded. Add matrices or activations to transform them in the red space.';
            } else if (dataset.ready) {
                DOM.dataLoadHint.textContent = 'Loading clears the cascade, then plots points in the original and red transformed spaces.';
            } else {
                DOM.dataLoadHint.textContent = 'Complete preprocessing to load points.';
            }
        }
    };

    const invalidateDatasetLoad = function () {
        const dataset = State.dataset;
        const wasLoaded = dataset.loaded;
        dataset.loadToken += 1;
        dataset.loaded = false;
        dataset.loading = false;
        dataset.plotPoints = [];
        updateLoadButton();
        if (typeof App.resetLabTraining === 'function') {
            App.resetLabTraining();
        }

        if (wasLoaded && App.drawScene) {
            App.drawScene();
        }
    };

    const buildDatasetPlotPoints = function () {
        const dataset = State.dataset;
        const rows = dataset.problemType === 'classification' ? dataset.encodedRows : dataset.rows;
        if (!dataset.ready || !Array.isArray(rows) || rows.length === 0) {
            return [];
        }

        const xIndex = getColumnIndex(dataset.xFeature);
        const yIndex = getColumnIndex(dataset.yFeature);
        const outputIndex = getColumnIndex(dataset.outputColumn);
        if (xIndex === -1 || yIndex === -1) {
            return [];
        }

        return rows.map(row => {
            const point = [Number(row[xIndex]), Number(row[yIndex])];
            if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
                return null;
            }

            let classIndex = 0;
            if (dataset.problemType === 'classification') {
                const outputValue = row[outputIndex];
                classIndex = dataset.labelMapping.findIndex(item => {
                    return item.encoded === outputValue || String(item.encoded) === String(outputValue);
                });
                if (classIndex === -1) {
                    classIndex = 0;
                }
            }

            return {
                point,
                classIndex,
                label: dataset.labelMapping[classIndex] ? dataset.labelMapping[classIndex].label : ''
            };
        }).filter(Boolean);
    };

    const clearClassificationEncoding = function () {
        const dataset = State.dataset;
        dataset.outputClasses = [];
        dataset.selectedClasses = [];
        dataset.labelMapping = [];
        dataset.labelEncodingRequired = false;
        dataset.encodedRows = null;
        updateClassSelectionUi();
        updateEncodingSummary();
        updateClassColorsUi();
    };

    const buildClassificationData = function () {
        const dataset = State.dataset;
        const classes = getOutputClasses();
        dataset.outputClasses = classes;

        if (classes.length < 2) {
            dataset.ready = false;
            dataset.encodedRows = null;
            dataset.labelMapping = [];
            dataset.labelEncodingRequired = false;
            updateClassSelectionUi();
            updateEncodingSummary();
            updateClassColorsUi();
            setError(`Classification output "${dataset.outputColumn}" must contain at least 2 classes.`);
            return false;
        }

        let selectedClasses = dataset.selectedClasses.filter(className => classes.includes(className));

        if (classes.length === 2) {
            selectedClasses = classes.slice();
        } else {
            if (selectedClasses.length !== 2) {
                dataset.selectedClasses = selectedClasses;
                dataset.ready = false;
                dataset.encodedRows = null;
                dataset.labelMapping = [];
                dataset.labelEncodingRequired = false;
                updateClassSelectionUi();
                updateEncodingSummary();
                updateClassColorsUi();
                clearError();
                setStatus(`Output "${dataset.outputColumn}" has ${classes.length} classes. Select exactly two classes to continue.`, 'warning');
                return false;
            }

            if (selectedClasses[0] === selectedClasses[1]) {
                dataset.ready = false;
                dataset.labelMapping = [];
                dataset.labelEncodingRequired = false;
                dataset.encodedRows = null;
                updateClassSelectionUi();
                updateEncodingSummary();
                updateClassColorsUi();
                setError('Select two different output classes.');
                return false;
            }
        }

        const requiresEncoding = selectedClasses.some(className => !isNumericValue(className));
        const labelMapping = selectedClasses.map((label, index) => ({
            label,
            encoded: requiresEncoding ? index : Number(label)
        }));
        const encodedByLabel = new Map(labelMapping.map(item => [item.label, item.encoded]));
        const outputIndex = getColumnIndex(dataset.outputColumn);
        const selectedSet = new Set(selectedClasses);

        dataset.selectedClasses = selectedClasses.slice();
        dataset.labelMapping = labelMapping;
        dataset.labelEncodingRequired = requiresEncoding;
        dataset.encodedRows = dataset.rows
            .filter(row => selectedSet.has(row[outputIndex]))
            .map(row => row.map((cell, index) => index === outputIndex ? encodedByLabel.get(row[outputIndex]) : cell));

        updateClassSelectionUi();
        updateEncodingSummary();
        updateClassColorsUi();
        return true;
    };

    const getFeatureColumns = function () {
        const dataset = State.dataset;
        if (dataset.problemType === 'classification' && dataset.outputColumn) {
            return dataset.headers.filter(header => header !== dataset.outputColumn);
        }
        return dataset.headers.slice();
    };

    const updateFeatureSelects = function () {
        const features = getFeatureColumns();
        let xFeature = State.dataset.xFeature;
        let yFeature = State.dataset.yFeature;

        if (!features.includes(xFeature)) {
            xFeature = features[0] || '';
        }
        if (!features.includes(yFeature) || yFeature === xFeature) {
            yFeature = features.find(header => header !== xFeature) || '';
        }

        setSelectOptions(DOM.xFeatureSelect, features, xFeature);
        setSelectOptions(DOM.yFeatureSelect, features, yFeature);
        State.dataset.xFeature = xFeature;
        State.dataset.yFeature = yFeature;
        updateTargetSelects();
    };

    const updateTargetSelects = function () {
        const headers = State.dataset.headers;
        const dataset = State.dataset;
        const populate = (select, currentValue, sameLabel) => {
            if (!select) {
                return '';
            }

            select.innerHTML = '';
            const same = document.createElement('option');
            same.value = '';
            same.textContent = sameLabel;
            select.appendChild(same);
            const zero = document.createElement('option');
            zero.value = '__zero__';
            zero.textContent = 'Zero column';
            select.appendChild(zero);

            headers.forEach(header => {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                select.appendChild(option);
            });

            const value = currentValue === '__zero__' || headers.includes(currentValue) ? currentValue : '';
            select.value = value;
            return value;
        };

        const targetX = populate(DOM.targetXFeatureSelect, dataset.targetXFeature, `Same as ${dataset.xFeature || 'X input'}`);
        const targetY = populate(DOM.targetYFeatureSelect, dataset.targetYFeature, `Same as ${dataset.yFeature || 'Y input'}`);
        dataset.targetXFeature = targetX;
        dataset.targetYFeature = targetY;
        if (DOM.regressionTargetFields) {
            DOM.regressionTargetFields.classList.toggle('hidden', dataset.problemType !== 'regression');
        }
    };

    const updateOutputSelect = function () {
        const headers = State.dataset.headers;
        let outputColumn = State.dataset.outputColumn;
        if (!headers.includes(outputColumn)) {
            outputColumn = headers.length >= 3 ? headers[headers.length - 1] : '';
        }

        setOutputOptions(DOM.outputColumnSelect, headers, outputColumn);
        State.dataset.outputColumn = outputColumn;
        updateFeatureSelects();
    };

    const validateSelections = function () {
        const dataset = State.dataset;
        if (!dataset.valid) {
            dataset.ready = false;
            updateLoadButton();
            return false;
        }

        if (!dataset.problemType) {
            dataset.ready = false;
            updateLoadButton();
            setStatus('Dataset accepted. Choose classification or regression.', 'warning');
            return false;
        }

        if (!dataset.xFeature || !dataset.yFeature) {
            dataset.ready = false;
            updateLoadButton();
            setError('Choose both X and Y input features.');
            return false;
        }

        if (dataset.xFeature === dataset.yFeature) {
            dataset.ready = false;
            updateLoadButton();
            setError('X and Y features must be different columns.');
            return false;
        }

        if (dataset.problemType === 'classification') {
            if (!dataset.outputColumn) {
                dataset.ready = false;
                updateClassSelectionUi();
                updateLoadButton();
                setError('Choose a class column to color the points.');
                return false;
            }
            if (!buildClassificationData()) {
                updateLoadButton();
                return false;
            }
        } else {
            clearClassificationEncoding();
        }

        const activeRows = dataset.problemType === 'classification'
            ? dataset.encodedRows || []
            : dataset.rows;

        if (!isNumericColumn(dataset.xFeature, activeRows)) {
            dataset.ready = false;
            updateLoadButton();
            setError(`X feature "${dataset.xFeature}" must contain only numbers.`);
            return false;
        }

        if (!isNumericColumn(dataset.yFeature, activeRows)) {
            dataset.ready = false;
            updateLoadButton();
            setError(`Y feature "${dataset.yFeature}" must contain only numbers.`);
            return false;
        }

        const targetEncodingNotes = [];
        if (dataset.problemType === 'regression') {
            const targetChecks = [
                { value: dataset.targetXFeature, label: 'Target X' },
                { value: dataset.targetYFeature, label: 'Target Y' }
            ];
            for (const target of targetChecks) {
                if (target.value && target.value !== '__zero__' && !isNumericColumn(target.value, activeRows)) {
                    const targetIndex = getColumnIndex(target.value);
                    const classCount = new Set(activeRows.map(row => row[targetIndex])).size;
                    targetEncodingNotes.push(`${target.label} "${target.value}" label-encoded (${classCount} classes)`);
                }
            }
        }

        clearError();
        dataset.ready = true;
        updateLoadButton();
        const classSummary = dataset.problemType === 'classification' ? `, class = ${dataset.outputColumn}` : '';
        const targetSummary = targetEncodingNotes.length ? `, ${targetEncodingNotes.join('; ')}` : '';
        setStatus(`Ready: X = ${dataset.xFeature}, Y = ${dataset.yFeature}${classSummary}${targetSummary}.`, 'success');
        return true;
    };

    const syncSelectionsFromUi = function () {
        if (!State.dataset.valid) {
            return false;
        }

        invalidateDatasetLoad();

        if (DOM.outputColumnSelect) {
            State.dataset.outputColumn = DOM.outputColumnSelect.value;
        }
        updateFeatureSelects();
        if (DOM.xFeatureSelect) {
            State.dataset.xFeature = DOM.xFeatureSelect.value;
        }
        if (DOM.yFeatureSelect) {
            State.dataset.yFeature = DOM.yFeatureSelect.value;
        }
        if (DOM.targetXFeatureSelect) {
            State.dataset.targetXFeature = DOM.targetXFeatureSelect.value;
        }
        if (DOM.targetYFeatureSelect) {
            State.dataset.targetYFeature = DOM.targetYFeatureSelect.value;
        }

        if (State.dataset.xFeature === State.dataset.yFeature) {
            const features = getFeatureColumns();
            const alternative = features.find(header => header !== State.dataset.yFeature);
            if (alternative) {
                State.dataset.xFeature = alternative;
                if (DOM.xFeatureSelect) {
                    DOM.xFeatureSelect.value = alternative;
                }
            }
        }

        clearError();
        return validateSelections();
    };

    App.parseCsv = parseCsv;

    App.getDatasetClassLabel = function (encodedValue) {
        const mappingItem = (State.dataset.labelMapping || []).find(item => Number(item.encoded) === Number(encodedValue));
        return mappingItem ? mappingItem.label : encodedValue;
    };

    App.importCsvText = function (text, fileName = 'dataset.csv') {
        clearError();
        const sourceText = text ? String(text).replace(/^\uFEFF/, '') : '';

        if (sourceText.trim() === '') {
            setError('CSV is empty. Add a header row and at least one data row.');
            return false;
        }

        let parsedRows;
        try {
            parsedRows = parseCsv(sourceText);
        } catch (error) {
            setError('CSV could not be parsed.');
            return false;
        }

        const rows = parsedRows
            .map(row => row.map(cell => String(cell).trim()))
            .filter(row => row.some(cell => cell !== ''));

        if (rows.length < 2) {
            setError('CSV must contain a header row and at least one data row.');
            return false;
        }

        const headers = rows[0];
        const dataRows = rows.slice(1);

        if (headers.length < 2) {
            setError('CSV must have at least 2 columns so X and Y inputs can be chosen.');
            return false;
        }

        if (headers.some(header => header === '')) {
            setError('CSV has an empty column name.');
            return false;
        }

        if (new Set(headers).size !== headers.length) {
            setError('CSV column names must be unique.');
            return false;
        }

        for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
            if (dataRows[rowIndex].length !== headers.length) {
                setError(`Row ${rowIndex + 2} has ${dataRows[rowIndex].length} values but ${headers.length} columns were expected.`);
                return false;
            }

            for (let columnIndex = 0; columnIndex < headers.length; columnIndex++) {
                if (dataRows[rowIndex][columnIndex] === '') {
                    setError(`Missing value at row ${rowIndex + 2}, column "${headers[columnIndex]}".`);
                    return false;
                }
            }
        }

        State.dataset.fileName = fileName;
        State.dataset.headers = headers;
        State.dataset.rows = dataRows;
        State.dataset.problemType = null;
        State.dataset.outputColumn = headers.length >= 3 ? headers[headers.length - 1] : '';
        State.dataset.xFeature = '';
        State.dataset.yFeature = '';
        State.dataset.targetXFeature = '';
        State.dataset.targetYFeature = '';
        State.dataset.outputClasses = [];
        State.dataset.selectedClasses = [];
        State.dataset.labelMapping = [];
        State.dataset.labelEncodingRequired = false;
        State.dataset.encodedRows = null;
        State.dataset.plotPoints = [];
        State.dataset.loaded = false;
        State.dataset.loading = false;
        State.dataset.loadToken += 1;
        State.dataset.valid = true;
        State.dataset.ready = false;

        if (DOM.csvFileName) {
            DOM.csvFileName.textContent = fileName;
        }
        if (DOM.csvSummary) {
            DOM.csvSummary.textContent = `${dataRows.length} × ${headers.length}`;
        }
        if (DOM.problemTypeClassification) {
            DOM.problemTypeClassification.checked = false;
            DOM.problemTypeClassification.disabled = false;
        }
        if (DOM.problemTypeRegression) {
            DOM.problemTypeRegression.checked = false;
            DOM.problemTypeRegression.disabled = false;
        }
        if (DOM.outputColumnSelect) {
            DOM.outputColumnSelect.disabled = true;
        }
        if (DOM.xFeatureSelect) {
            DOM.xFeatureSelect.disabled = true;
        }
        if (DOM.yFeatureSelect) {
            DOM.yFeatureSelect.disabled = true;
        }

        updateOutputSelect();
        updateClassSelectionUi();
        updateEncodingSummary();
        updateClassColorsUi();
        updateLoadButton();
        clearError();
        setStatus(`Dataset accepted (${dataRows.length} rows, ${headers.length} columns). Choose classification or regression.`, 'warning');
        App.renderMatrixCascade();
        App.fitViewToScene();
        App.drawScene();
        return true;
    };

    App.clearDataset = function () {
        const dataset = State.dataset;
        dataset.fileName = '';
        dataset.headers = [];
        dataset.rows = [];
        dataset.problemType = null;
        dataset.outputColumn = '';
        dataset.xFeature = '';
        dataset.yFeature = '';
        dataset.targetXFeature = '';
        dataset.targetYFeature = '';
        dataset.outputClasses = [];
        dataset.selectedClasses = [];
        dataset.labelMapping = [];
        dataset.labelEncodingRequired = false;
        dataset.encodedRows = null;
        dataset.plotPoints = [];
        dataset.loaded = false;
        dataset.loading = false;
        dataset.loadToken += 1;
        dataset.valid = false;
        dataset.ready = false;

        if (DOM.csvFileName) {
            DOM.csvFileName.textContent = 'No file selected';
        }
        if (DOM.csvSummary) {
            DOM.csvSummary.textContent = '—';
        }
        if (DOM.csvFileInput) {
            DOM.csvFileInput.value = '';
        }
        if (DOM.problemTypeClassification) {
            DOM.problemTypeClassification.checked = false;
            DOM.problemTypeClassification.disabled = true;
        }
        if (DOM.problemTypeRegression) {
            DOM.problemTypeRegression.checked = false;
            DOM.problemTypeRegression.disabled = true;
        }

        [
            { select: DOM.outputColumnSelect, label: 'Choose a class column' },
            { select: DOM.xFeatureSelect, label: 'Import a CSV first' },
            { select: DOM.yFeatureSelect, label: 'Import a CSV first' }
        ].forEach(({ select, label }) => {
            if (!select) {
                return;
            }
            select.innerHTML = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = label;
            select.appendChild(option);
            select.disabled = true;
        });

        clearError();
        updateClassSelectionUi();
        updateEncodingSummary();
        updateClassColorsUi();
        updateLoadButton();
        setStatus('No dataset loaded. Import a CSV to begin.', 'neutral');
        App.fitViewToScene();
        App.drawScene();
        App.showToast('Dataset cleared', 'info');
        return true;
    };

    App.getDatasetPlotPoints = function () {
        return State.dataset.plotPoints.slice();
    };

    App.loadDatasetPoints = function () {
        const dataset = State.dataset;
        if (!dataset.ready || dataset.loading) {
            return false;
        }

        const loadToken = dataset.loadToken + 1;
        dataset.loadToken = loadToken;
        dataset.loading = true;
        dataset.loaded = false;
        dataset.plotPoints = [];
        updateLoadButton();
        setStatus('Loading points...', 'warning');

        App.resetCascadeForDataLoad();
        App.fitViewToScene();
        App.drawScene();

        setTimeout(() => {
            if (loadToken !== dataset.loadToken || !dataset.ready) {
                return;
            }

            dataset.loading = false;
            dataset.loaded = true;
            dataset.plotPoints = buildDatasetPlotPoints();
            updateLoadButton();
            App.fitViewToScene();
            App.drawScene();
            setStatus(`Loading complete — ${dataset.plotPoints.length} points ready.`, 'success');
            App.showToast('Loading complete', 'success');

            setTimeout(() => {
                if (!dataset.loaded) {
                    return;
                }
                if (typeof App.onLabDatasetLoaded === 'function') {
                    App.onLabDatasetLoaded();
                } else if (DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden')) {
                    App.closeSettingsModal();
                }
            }, Config.DATA_LOADING_CLOSE_DELAY);
        }, Config.DATA_LOADING_DELAY);

        return true;
    };

    App.initDataSection = function () {
        if (!DOM.csvFileInput || !DOM.problemTypeClassification || !DOM.problemTypeRegression) {
            return;
        }

        const readFile = file => {
            if (!file) {
                return;
            }

            file.text().then(text => {
                App.importCsvText(text, file.name);
                DOM.csvFileInput.value = '';
            }).catch(() => {
                setError('Could not read the selected CSV file.');
                DOM.csvFileInput.value = '';
            });
        };

        DOM.csvFileInput.addEventListener('change', event => {
            readFile(event.target.files && event.target.files[0]);
        });

        if (DOM.csvDropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                DOM.csvDropZone.addEventListener(eventName, event => {
                    event.preventDefault();
                    DOM.csvDropZone.classList.add('border-amber-500', 'bg-white');
                });
            });

            ['dragleave', 'drop'].forEach(eventName => {
                DOM.csvDropZone.addEventListener(eventName, event => {
                    event.preventDefault();
                    DOM.csvDropZone.classList.remove('border-amber-500', 'bg-white');
                });
            });

            DOM.csvDropZone.addEventListener('drop', event => {
                readFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
            });
        }

        const handleProblemTypeChange = function (problemType) {
            if (!State.dataset.valid) {
                return;
            }

            State.dataset.problemType = problemType;
            if (DOM.outputColumnSelect) {
                DOM.outputColumnSelect.disabled = false;
            }
            if (DOM.xFeatureSelect) {
                DOM.xFeatureSelect.disabled = false;
            }
            if (DOM.yFeatureSelect) {
                DOM.yFeatureSelect.disabled = false;
            }

            updateClassSelectionUi();
            updateTargetSelects();
            syncSelectionsFromUi();
        };

        DOM.problemTypeClassification.addEventListener('change', event => {
            if (event.target.checked) {
                handleProblemTypeChange('classification');
            }
        });

        DOM.problemTypeRegression.addEventListener('change', event => {
            if (event.target.checked) {
                handleProblemTypeChange('regression');
            }
        });

        if (DOM.outputColumnSelect) {
            DOM.outputColumnSelect.addEventListener('change', () => {
                State.dataset.outputColumn = DOM.outputColumnSelect.value;
                State.dataset.selectedClasses = [];
                updateFeatureSelects();
                syncSelectionsFromUi();
            });
        }

        if (DOM.xFeatureSelect) {
            DOM.xFeatureSelect.addEventListener('change', () => {
                State.dataset.xFeature = DOM.xFeatureSelect.value;
                syncSelectionsFromUi();
            });
        }

        if (DOM.yFeatureSelect) {
            DOM.yFeatureSelect.addEventListener('change', () => {
                State.dataset.yFeature = DOM.yFeatureSelect.value;
                syncSelectionsFromUi();
            });
        }

        if (DOM.classASelect) {
            DOM.classASelect.addEventListener('change', () => {
                State.dataset.selectedClasses = [
                    DOM.classASelect.value,
                    DOM.classBSelect ? DOM.classBSelect.value : ''
                ].filter(Boolean);
                syncSelectionsFromUi();
            });
        }

        if (DOM.classBSelect) {
            DOM.classBSelect.addEventListener('change', () => {
                State.dataset.selectedClasses = [
                    DOM.classASelect ? DOM.classASelect.value : '',
                    DOM.classBSelect.value
                ].filter(Boolean);
                syncSelectionsFromUi();
            });
        }

        [
            { input: DOM.classAColorInput, index: 0 },
            { input: DOM.classBColorInput, index: 1 }
        ].forEach(({ input, index }) => {
            if (!input) {
                return;
            }

            input.addEventListener('input', () => {
                State.dataset.classColors[index] = normalizeColor(input.value, Config.DEFAULT_CLASS_COLORS[index]);
                if (State.dataset.loaded) {
                    App.drawScene();
                }
            });
        });

        [DOM.targetXFeatureSelect, DOM.targetYFeatureSelect].forEach(select => {
            if (select) {
                select.addEventListener('change', () => {
                    State.dataset.targetXFeature = DOM.targetXFeatureSelect ? DOM.targetXFeatureSelect.value : '';
                    State.dataset.targetYFeature = DOM.targetYFeatureSelect ? DOM.targetYFeatureSelect.value : '';
                    syncSelectionsFromUi();
                });
            }
        });

        if (DOM.loadPointsBtn) {
            DOM.loadPointsBtn.addEventListener('click', App.loadDatasetPoints);
        }

        if (DOM.clearDataBtn) {
            DOM.clearDataBtn.addEventListener('click', App.clearDataset);
        }

        updateClassColorsUi();
        updateLoadButton();
    };
})(window);
