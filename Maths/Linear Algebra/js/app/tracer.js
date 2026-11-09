(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config, Math: MathCore } = Visuo;

    const DEFAULT_STEP_MS = Config.POINT_TRACE_STEP_MS || 5000;
    const ACTIVATION_FORMULAS = {
        sigmoid: 'σ(x) = 1 / (1 + e⁻ˣ)',
        tanh: 'tanh(x)',
        relu: 'max(0, x)',
        linear: 'f(x) = x'
    };

    let stepTimer = null;
    let tickTimer = null;
    let stepDeadline = 0;
    let pendingStepAction = null;
    let pausedRemainingMs = 0;
    let lastFocusedElement = null;

    const clearTimers = () => {
        if (stepTimer) {
            clearTimeout(stepTimer);
            stepTimer = null;
        }
        if (tickTimer) {
            clearInterval(tickTimer);
            tickTimer = null;
        }
    };

    const formatNumber = value => {
        if (!Number.isFinite(value)) {
            return '—';
        }
        if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
            return value.toExponential(4);
        }
        return String(Number(value.toFixed(4)));
    };

    const formatPoint = point => `(${formatNumber(point[0])}, ${formatNumber(point[1])})`;
    const formatMatrix = matrix => `[[${formatNumber(matrix[0][0])}, ${formatNumber(matrix[0][1])}], [${formatNumber(matrix[1][0])}, ${formatNumber(matrix[1][1])}]]`;
    const titleCase = value => value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Linear';

    const setProgress = percent => {
        const width = `${MathCore.clamp(percent, 0, 100)}%`;
        if (DOM.pointTraceProgress) {
            DOM.pointTraceProgress.style.width = width;
        }
        if (DOM.pointTraceHudProgress) {
            DOM.pointTraceHudProgress.style.width = width;
        }
    };

    const setHudVisible = visible => {
        if (DOM.pointTraceHud) {
            DOM.pointTraceHud.classList.toggle('hidden', !visible);
        }
    };

    const setModalVisible = visible => {
        if (DOM.pointTraceModal) {
            DOM.pointTraceModal.classList.toggle('hidden', !visible);
        }
        if (DOM.pointTraceToggleBtn) {
            DOM.pointTraceToggleBtn.setAttribute('aria-expanded', visible ? 'true' : 'false');
        }
    };

    const updateCountdown = () => {
        const trace = State.pointTrace;
        const total = trace.stepDurationMs || DEFAULT_STEP_MS;
        const remaining = Math.max(0, stepDeadline - performance.now());
        const text = `${(remaining / 1000).toFixed(1)}s`;

        if (DOM.pointTraceCountdown) {
            DOM.pointTraceCountdown.textContent = text;
        }
        if (DOM.pointTraceHudTime) {
            DOM.pointTraceHudTime.textContent = text;
        }
        setProgress(((total - remaining) / total) * 100);
    };

    const beginCountdown = (next, durationMs) => {
        clearTimers();
        const trace = State.pointTrace;
        const total = trace.stepDurationMs || DEFAULT_STEP_MS;
        const duration = MathCore.clamp(durationMs ?? total, 0, total);
        const elapsed = Math.max(0, total - duration);
        pendingStepAction = next;
        stepDeadline = performance.now() + duration;
        setProgress((elapsed / total) * 100);
        updateCountdown();
        tickTimer = setInterval(updateCountdown, 100);
        stepTimer = setTimeout(next, duration);
    };

    const setButtonState = (button, disabled, hoverClass) => {
        if (!button) {
            return;
        }
        button.disabled = disabled;
        button.classList.toggle('cursor-not-allowed', disabled);
        button.classList.toggle('opacity-60', disabled);
        if (hoverClass) {
            button.classList.toggle(hoverClass, !disabled);
        }
    };

    const updateHud = () => {
        if (!DOM.pointTraceHud) {
            return;
        }

        const trace = State.pointTrace;
        const hasSteps = trace.steps.length > 0;
        const step = hasSteps ? trace.steps[Math.min(trace.stepIndex, trace.steps.length - 1)] : null;
        const paused = trace.active && !trace.playing;

        if (DOM.pointTraceHudStep) {
            DOM.pointTraceHudStep.textContent = hasSteps
                ? `Step ${trace.stepIndex} of ${trace.steps.length - 1}`
                : 'Step 0 of 0';
        }
        if (DOM.pointTraceHudTitle) {
            DOM.pointTraceHudTitle.textContent = step ? step.label : 'Blue input';
        }
        if (DOM.pointTraceHudTime && paused) {
            DOM.pointTraceHudTime.textContent = 'Paused';
        }
        if (DOM.pointTraceHudPauseBtn) {
            DOM.pointTraceHudPauseBtn.textContent = paused ? 'Resume' : 'Pause';
            setButtonState(DOM.pointTraceHudPauseBtn, !trace.active, 'hover:bg-indigo-100');
        }
        if (DOM.pointTraceHudStopBtn) {
            setButtonState(DOM.pointTraceHudStopBtn, !trace.active, 'hover:bg-slate-50');
        }
    };

    const updateButtons = () => {
        if (!DOM.pointTraceStartBtn) {
            return;
        }

        const trace = State.pointTrace;
        DOM.pointTraceStartBtn.textContent = trace.active ? 'Restart demo' : 'Start demo';
        if (DOM.pointTracePauseBtn) {
            DOM.pointTracePauseBtn.textContent = trace.paused ? 'Resume' : 'Pause';
            setButtonState(DOM.pointTracePauseBtn, !trace.active, 'hover:bg-indigo-100');
        }
        setButtonState(DOM.pointTraceStopBtn, !trace.active, 'hover:bg-slate-50');
        updateHud();
    };

    const buildCascadeSummary = () => {
        const parts = [];
        let matrixCount = 0;

        State.matrixCascade.forEach(layer => {
            const disabled = layer.enabled === false;

            if (App.isActivationLayer(layer)) {
                const name = titleCase(layer.name || 'linear');
                parts.push(disabled ? `${name} (off)` : name);
                return;
            }

            matrixCount += 1;
            const label = layer.isInverse ? `W${matrixCount}⁻¹` : `W${matrixCount}`;
            parts.push(disabled ? `${label} (off)` : label);
        });

        if (!App.hasExplicitActivationLayers()) {
            const legacy = State.activeActivationName || 'linear';
            if (legacy !== 'linear') {
                parts.push(titleCase(legacy));
            }
        }

        return parts.length ? parts.join('  →  ') : 'No active layers';
    };

    App.buildPointTraceSteps = function (point) {
        const steps = [{
            kind: 'input',
            label: 'Blue input',
            point: [point[0], point[1]],
            lines: [`p0 = ${formatPoint(point)}`, 'This point starts in the original XY space.']
        }];
        const cascade = State.matrixCascade || [];
        let current = [point[0], point[1]];
        let matrixCount = 0;

        cascade.forEach((layer, layerIndex) => {
            if (App.isMatrixLayer(layer)) {
                matrixCount += 1;
            }

            const previousIndex = steps.length - 1;
            const previousPoint = [current[0], current[1]];

            if (layer.enabled === false) {
                steps.push({
                    kind: 'skipped',
                    label: `Layer ${layerIndex + 1}: skipped`,
                    point: [current[0], current[1]],
                    lines: [`p${previousIndex} = ${formatPoint(previousPoint)}`, 'This layer is disabled and does not change the point.']
                });
                return;
            }

            if (App.isActivationLayer(layer)) {
                const activationName = layer.name || 'linear';
                current = App.applyLayerForward(current, layer);
                const nextIndex = steps.length;
                steps.push({
                    kind: 'activation',
                    name: activationName,
                    label: `Layer ${layerIndex + 1}: ${titleCase(activationName)}`,
                    point: [current[0], current[1]],
                    lines: [
                        `${ACTIVATION_FORMULAS[activationName] || `f(x) = ${activationName}(x)`}`,
                        `p${previousIndex} = ${formatPoint(previousPoint)}`,
                        `p${nextIndex} = f(p${previousIndex}) = ${formatPoint(current)}`
                    ]
                });
                return;
            }

            const matrix = layer.values;
            const bias = layer.bias || [0, 0];
            const inverse = layer.isInverse ? Visuo.Math.calculateInverse(matrix) : null;
            const effectiveMatrix = layer.isInverse ? inverse : matrix;

            if (!effectiveMatrix) {
                steps.push({
                    kind: 'matrix',
                    label: `Layer ${layerIndex + 1}: inverse unavailable`,
                    point: [current[0], current[1]],
                    lines: [`W${matrixCount} = ${formatMatrix(matrix)}`, 'This matrix is singular, so the inverse step is skipped.']
                });
                return;
            }

            current = App.applyLayerForward(current, layer);
            const nextIndex = steps.length;
            const matrixLabel = layer.isInverse ? `W${matrixCount}⁻¹` : `W${matrixCount}`;
            steps.push({
                kind: 'matrix',
                label: `Layer ${layerIndex + 1}: matrix ${matrixLabel}`,
                point: [current[0], current[1]],
                lines: [
                    `${matrixLabel} = ${formatMatrix(effectiveMatrix)}`,
                    `b${matrixCount} = ${formatPoint(bias)}`,
                    `p${previousIndex} = ${formatPoint(previousPoint)}`,
                    `p${nextIndex} = ${matrixLabel}p${previousIndex} + b${matrixCount} = ${formatPoint(current)}`
                ]
            });
        });

        if (!App.hasExplicitActivationLayers()) {
            const legacy = State.activeActivationName || 'linear';
            if (legacy !== 'linear') {
                const previousIndex = steps.length - 1;
                const previousPoint = [current[0], current[1]];
                current = Visuo.Activation.applyPoint(current, legacy);
                const nextIndex = steps.length;
                steps.push({
                    kind: 'activation',
                    name: legacy,
                    label: `Activation: ${titleCase(legacy)}`,
                    point: [current[0], current[1]],
                    lines: [
                        `${ACTIVATION_FORMULAS[legacy] || `f(x) = ${legacy}(x)`}`,
                        `p${previousIndex} = ${formatPoint(previousPoint)}`,
                        `p${nextIndex} = f(p${previousIndex}) = ${formatPoint(current)}`
                    ]
                });
            }
        }

        return steps;
    };

    const renderStepList = () => {
        if (!DOM.pointTraceStepList) {
            return;
        }

        const trace = State.pointTrace;
        DOM.pointTraceStepList.innerHTML = '';

        if (!trace.steps.length) {
            const empty = document.createElement('p');
            empty.className = 'rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400';
            empty.textContent = 'Steps appear after the demo starts.';
            DOM.pointTraceStepList.appendChild(empty);
            return;
        }

        trace.steps.forEach((step, index) => {
            const button = document.createElement('button');
            const active = index === trace.stepIndex;
            button.type = 'button';
            button.className = active
                ? 'flex w-full items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-xs font-semibold text-indigo-900'
                : 'flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:border-indigo-200 hover:bg-indigo-50/50';
            button.title = formatPoint(step.point);
            button.innerHTML = '';

            const badge = document.createElement('span');
            badge.className = active
                ? 'flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1 font-mono text-[10px] font-bold text-white'
                : 'flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1 font-mono text-[10px] font-bold text-slate-500';
            badge.textContent = `P${index}`;

            const label = document.createElement('span');
            label.className = 'min-w-0 flex-1 truncate';
            label.textContent = step.label;

            button.appendChild(badge);
            button.appendChild(label);
            button.addEventListener('click', () => {
                clearTimers();
                trace.playing = false;
                trace.paused = true;
                trace.finished = index === trace.steps.length - 1;
                trace.active = true;
                trace.stepIndex = index;
                renderTracePanel();
                updateButtons();
                DOM.pointTraceCountdown.textContent = index === trace.steps.length - 1 ? 'Done' : 'Paused';
                setProgress(index === trace.steps.length - 1 ? 100 : (index / Math.max(1, trace.steps.length - 1)) * 100);
                App.drawScene();
            });
            DOM.pointTraceStepList.appendChild(button);
        });
    };

    const renderTracePanel = () => {
        if (!DOM.pointTraceModal) {
            return;
        }

        const trace = State.pointTrace;
        const hasSteps = trace.steps.length > 0;
        const step = hasSteps ? trace.steps[Math.min(trace.stepIndex, trace.steps.length - 1)] : null;

        if (DOM.pointTraceCascade) {
            DOM.pointTraceCascade.textContent = buildCascadeSummary();
        }

        if (DOM.pointTraceStepLabel) {
            DOM.pointTraceStepLabel.textContent = hasSteps
                ? `Step ${trace.stepIndex} of ${trace.steps.length - 1}`
                : 'Ready';
        }

        if (DOM.pointTraceStepTitle) {
            DOM.pointTraceStepTitle.textContent = step ? step.label : 'Blue input';
        }

        if (DOM.pointTraceStepDetail) {
            DOM.pointTraceStepDetail.textContent = step
                ? step.lines.join('\n')
                : 'Enter a point and start the demo.';
        }

        if (DOM.pointTraceFinal) {
            if (hasSteps) {
                const first = trace.steps[0].point;
                const last = trace.steps[trace.steps.length - 1].point;
                DOM.pointTraceFinal.textContent = `Blue P0 ${formatPoint(first)}  →  Red P${trace.steps.length - 1} ${formatPoint(last)}`;
            } else {
                DOM.pointTraceFinal.textContent = 'Start the demo to trace the point.';
            }
        }

        renderStepList();
        updateButtons();
    };

    const revealTraceModal = () => {
        setModalVisible(true);
        renderTracePanel();
        if (DOM.pointTraceXInput) {
            DOM.pointTraceXInput.focus();
        }
    };

    const finishPlayback = () => {
        clearTimers();
        const trace = State.pointTrace;
        trace.playing = false;
        trace.paused = false;
        trace.finished = true;
        trace.active = false;
        setHudVisible(false);
        updateButtons();
        renderTracePanel();
        App.drawScene();
        revealTraceModal();
        if (DOM.pointTraceCountdown) {
            DOM.pointTraceCountdown.textContent = 'Done';
        }
        setProgress(100);
    };

    const advanceStep = () => {
        const trace = State.pointTrace;
        if (!trace.playing) {
            return;
        }

        if (trace.stepIndex >= trace.steps.length - 1) {
            finishPlayback();
            return;
        }

        trace.stepIndex += 1;
        App.drawScene();
        renderTracePanel();

        if (trace.stepIndex >= trace.steps.length - 1) {
            beginCountdown(finishPlayback);
        } else {
            beginCountdown(advanceStep);
        }
    };

    const readInputPoint = () => {
        const x = Number.parseFloat(DOM.pointTraceXInput.value);
        const y = Number.parseFloat(DOM.pointTraceYInput.value);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            App.showToast('Enter finite X and Y values for the point.', 'error');
            return null;
        }

        return [x, y];
    };

    const readStepDuration = () => {
        const seconds = Number.parseFloat(DOM.pointTraceStepDuration.value);
        if (!Number.isFinite(seconds) || seconds <= 0) {
            App.showToast('Enter a positive step duration in seconds.', 'error');
            return null;
        }
        return MathCore.clamp(seconds, 1, 300) * 1000;
    };

    App.startPointTrace = function () {
        if (!DOM.pointTraceModal) {
            return;
        }

        const point = readInputPoint();
        const stepDurationMs = readStepDuration();
        if (!point || !stepDurationMs) {
            return;
        }

        clearTimers();
        const trace = State.pointTrace;
        trace.active = true;
        trace.playing = true;
        trace.paused = false;
        trace.finished = false;
        trace.inputPoint = point;
        trace.stepDurationMs = stepDurationMs;
        trace.steps = App.buildPointTraceSteps(point);
        trace.stepIndex = 0;
        setModalVisible(false);
        setHudVisible(true);
        updateButtons();
        renderTracePanel();
        setProgress(0);
        App.fitViewToScene();
        App.drawScene();
        beginCountdown(advanceStep, stepDurationMs);
    };

    App.pausePointTrace = function () {
        const trace = State.pointTrace;
        if (!trace.active || !trace.playing) {
            return;
        }

        pausedRemainingMs = Math.max(0, stepDeadline - performance.now());
        clearTimers();
        trace.playing = false;
        trace.paused = true;
        updateButtons();
        if (DOM.pointTraceCountdown) {
            DOM.pointTraceCountdown.textContent = `${(pausedRemainingMs / 1000).toFixed(1)}s`;
        }
        if (DOM.pointTraceHudTime) {
            DOM.pointTraceHudTime.textContent = 'Paused';
        }
        App.drawScene();
    };

    App.resumePointTrace = function () {
        const trace = State.pointTrace;
        if (!trace.active || trace.playing) {
            return;
        }

        const next = pendingStepAction || (trace.stepIndex >= trace.steps.length - 1 ? finishPlayback : advanceStep);
        trace.playing = true;
        trace.paused = false;
        setModalVisible(false);
        setHudVisible(true);
        updateButtons();
        beginCountdown(next, pausedRemainingMs > 0 ? pausedRemainingMs : trace.stepDurationMs);
        App.drawScene();
    };

    App.togglePointTracePlayback = function () {
        const trace = State.pointTrace;
        if (!trace.active) {
            return;
        }

        if (trace.playing) {
            App.pausePointTrace();
        } else {
            App.resumePointTrace();
        }
    };

    App.stopPointTrace = function () {
        clearTimers();
        const trace = State.pointTrace;
        trace.playing = false;
        trace.paused = false;
        trace.finished = true;
        trace.active = false;
        setHudVisible(false);
        updateButtons();
        renderTracePanel();
        App.drawScene();
        revealTraceModal();
        if (DOM.pointTraceCountdown) {
            DOM.pointTraceCountdown.textContent = 'Stopped';
        }
    };

    App.openPointTrace = function () {
        if (!DOM.pointTraceModal) {
            return;
        }

        if (State.pointTrace.active) {
            App.stopPointTrace();
            return;
        }

        lastFocusedElement = document.activeElement;
        setModalVisible(true);
        if (DOM.pointTraceXInput && !State.pointTrace.steps.length) {
            DOM.pointTraceXInput.value = formatNumber(State.pointTrace.inputPoint[0]);
            DOM.pointTraceYInput.value = formatNumber(State.pointTrace.inputPoint[1]);
        }
        renderTracePanel();
        if (DOM.pointTraceXInput) {
            DOM.pointTraceXInput.focus();
        }
    };

    App.closePointTrace = function () {
        if (!DOM.pointTraceModal) {
            return;
        }

        clearTimers();
        const trace = State.pointTrace;
        trace.playing = false;
        trace.paused = false;
        trace.finished = false;
        trace.active = false;
        setHudVisible(false);
        setModalVisible(false);
        updateButtons();
        App.drawScene();
        if (lastFocusedElement instanceof HTMLElement && lastFocusedElement !== document.body) {
            lastFocusedElement.focus();
        } else if (DOM.pointTraceToggleBtn) {
            DOM.pointTraceToggleBtn.focus();
        }
    };

    App.drawPointTrace = function (context, viewTransformMatrix) {
        const trace = State.pointTrace;
        if (!trace || !trace.active || !trace.steps.length) {
            return;
        }

        const matrix = viewTransformMatrix || [
            [1, 0],
            [0, 1]
        ];
        const toCanvas = point => {
            const viewPoint = MathCore.multiplyMatrixVector(matrix, point);
            return App.toCanvasCoords(viewPoint[0], viewPoint[1]);
        };
        const currentIndex = Math.min(trace.stepIndex, trace.steps.length - 1);

        context.save();

        if (currentIndex > 0) {
            context.beginPath();
            context.strokeStyle = 'rgba(245, 158, 11, 0.55)';
            context.lineWidth = 1.5;
            context.setLineDash([5, 5]);
            let started = false;

            for (let index = 0; index <= currentIndex; index++) {
                const canvasPoint = toCanvas(trace.steps[index].point);
                if (!Number.isFinite(canvasPoint.cx) || !Number.isFinite(canvasPoint.cy)) {
                    continue;
                }
                if (!started) {
                    context.moveTo(canvasPoint.cx, canvasPoint.cy);
                    started = true;
                } else {
                    context.lineTo(canvasPoint.cx, canvasPoint.cy);
                }
            }

            if (started) {
                context.stroke();
            }
            context.setLineDash([]);
        }

        for (let index = 1; index < currentIndex; index++) {
            const canvasPoint = toCanvas(trace.steps[index].point);
            if (!Number.isFinite(canvasPoint.cx) || !Number.isFinite(canvasPoint.cy)) {
                continue;
            }
            context.beginPath();
            context.arc(canvasPoint.cx, canvasPoint.cy, 5, 0, Math.PI * 2);
            context.fillStyle = 'rgba(245, 158, 11, 0.85)';
            context.fill();
            context.lineWidth = 1.5;
            context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            context.stroke();
        }

        const drawMarker = (point, color, label, emphasized) => {
            const canvasPoint = toCanvas(point);
            if (!Number.isFinite(canvasPoint.cx) || !Number.isFinite(canvasPoint.cy)) {
                return;
            }

            context.save();
            if (emphasized) {
                context.beginPath();
                context.arc(canvasPoint.cx, canvasPoint.cy, 18, 0, Math.PI * 2);
                context.globalAlpha = 0.16;
                context.fillStyle = color;
                context.fill();
                context.globalAlpha = 1;
            }

            context.beginPath();
            context.arc(canvasPoint.cx, canvasPoint.cy, emphasized ? 8 : 6.5, 0, Math.PI * 2);
            context.fillStyle = color;
            context.fill();
            context.lineWidth = 2;
            context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            context.stroke();

            context.fillStyle = color;
            context.font = '700 12px Inter';
            context.textAlign = 'left';
            context.textBaseline = 'bottom';
            context.fillText(label, canvasPoint.cx + 11, canvasPoint.cy - 9);
            context.restore();
        };

        drawMarker(trace.steps[0].point, '#2563eb', 'P0', false);

        if (currentIndex > 0) {
            const currentStep = trace.steps[currentIndex];
            const complete = currentIndex === trace.steps.length - 1;
            drawMarker(currentStep.point, complete ? '#dc2626' : '#f59e0b', `P${currentIndex}`, true);
        }

        context.restore();
    };

    App.initPointTrace = function () {
        if (!DOM.pointTraceToggleBtn || !DOM.pointTraceModal) {
            return;
        }

        DOM.pointTraceToggleBtn.addEventListener('click', App.openPointTrace);
        DOM.pointTraceBackdrop.addEventListener('click', App.closePointTrace);
        DOM.closePointTraceBtn.addEventListener('click', App.closePointTrace);
        DOM.pointTraceStartBtn.addEventListener('click', App.startPointTrace);
        DOM.pointTracePauseBtn.addEventListener('click', App.togglePointTracePlayback);
        DOM.pointTraceStopBtn.addEventListener('click', App.stopPointTrace);
        DOM.pointTraceHudPauseBtn.addEventListener('click', App.togglePointTracePlayback);
        DOM.pointTraceHudStopBtn.addEventListener('click', App.stopPointTrace);

        [DOM.pointTraceXInput, DOM.pointTraceYInput, DOM.pointTraceStepDuration].forEach(input => {
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    App.startPointTrace();
                }
            });
        });

        document.addEventListener('keydown', event => {
            if ((event.code !== 'Space' && event.key !== ' ') || !State.pointTrace.active) {
                return;
            }
            if (DOM.pointTraceModal && !DOM.pointTraceModal.classList.contains('hidden')) {
                return;
            }
            const target = event.target;
            if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) {
                return;
            }
            event.preventDefault();
            App.togglePointTracePlayback();
        });

        if (DOM.pointTraceXInput) {
            DOM.pointTraceXInput.value = formatNumber(State.pointTrace.inputPoint[0]);
            DOM.pointTraceYInput.value = formatNumber(State.pointTrace.inputPoint[1]);
        }
        if (DOM.pointTraceStepDuration) {
            DOM.pointTraceStepDuration.value = String(State.pointTrace.stepDurationMs / 1000);
        }

        renderTracePanel();
    };
})(window);
