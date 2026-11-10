(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config, Math: MathCore } = Visuo;

    const DEFAULT_STEP_MS = Config.POINT_TRACE_STEP_MS || 5000;
    const FINAL_HOLD_MS = 2000;
    const ACTIVATION_FORMULAS = {
        sigmoid: 'σ(x) = 1 / (1 + e⁻ˣ)',
        tanh: 'tanh(x)',
        relu: 'max(0, x)',
        linear: 'f(x) = x'
    };
    const ACTIVATION_LATEX = {
        sigmoid: 'f(x) = \\sigma(x) = \\frac{1}{1 + e^{-x}}',
        tanh: 'f(x) = \\tanh(x)',
        relu: 'f(x) = \\max(0, x)',
        linear: 'f(x) = x'
    };

    let stepTimer = null;
    let tickTimer = null;
    let stepDeadline = 0;
    let pendingStepAction = null;
    let pausedRemainingMs = 0;
    let finalHold = false;
    let lastFocusedElement = null;

    const clearTimers = () => {
        if (stepTimer) {
            clearTimeout(stepTimer);
            stepTimer = null;
        }
        if (tickTimer) {
            cancelAnimationFrame(tickTimer);
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

    const texNumber = value => {
        const text = formatNumber(value);
        const scientific = /^(-?[\d.]+)e([+-]?\d+)$/.exec(text);
        if (scientific) {
            return `${scientific[1]}\\times 10^{${Number(scientific[2])}}`;
        }
        return text;
    };
    const texPoint = point => `\\begin{bmatrix}${texNumber(point[0])} \\\\ ${texNumber(point[1])}\\end{bmatrix}`;
    const texMatrix = matrix => `\\begin{bmatrix}${texNumber(matrix[0][0])} & ${texNumber(matrix[0][1])} \\\\ ${texNumber(matrix[1][0])} & ${texNumber(matrix[1][1])}\\end{bmatrix}`;
    const texFactor = value => value < 0 ? `\\left(${texNumber(value)}\\right)` : texNumber(value);
    const texAdd = value => value < 0 ? ` - ${texNumber(Math.abs(value))}` : ` + ${texNumber(value)}`;
    const texMatrixComponent = (row, point) => `${texFactor(row[0])}\\cdot ${texFactor(point[0])} + ${texFactor(row[1])}\\cdot ${texFactor(point[1])}`;
    const texAligned = lines => `\\begin{aligned}${lines.join(' \\\\ ')}\\end{aligned}`;
    const texActivationName = name => {
        if (name === 'sigmoid') return '\\sigma';
        if (name === 'tanh') return '\\tanh';
        if (name === 'relu') return '\\max';
        if (name === 'linear' || !name) return 'f';
        return `\\operatorname{${name}}`;
    };
    const texActivationCall = (name, value) => name === 'relu'
        ? `\\max\\left(0, ${texNumber(value)}\\right)`
        : `${texActivationName(name)}\\left(${texNumber(value)}\\right)`;

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
        const elapsed = Math.max(0, total - remaining);
        trace.animationT = total > 0 ? MathCore.clamp(elapsed / total, 0, 1) : 1;

        if (DOM.pointTraceCountdown) {
            DOM.pointTraceCountdown.textContent = text;
        }
        setProgress((elapsed / total) * 100);
        if (trace.animate && trace.playing && typeof App.drawScene === 'function') {
            App.drawScene();
        }
    };

    const tick = () => {
        if (!State.pointTrace.playing) {
            tickTimer = null;
            return;
        }
        updateCountdown();
        tickTimer = requestAnimationFrame(tick);
    };

    const beginCountdown = (next, durationMs) => {
        clearTimers();
        finalHold = false;
        const trace = State.pointTrace;
        const total = trace.stepDurationMs || DEFAULT_STEP_MS;
        const duration = MathCore.clamp(durationMs ?? total, 0, total);
        const elapsed = Math.max(0, total - duration);
        trace.animationT = total > 0 ? MathCore.clamp(elapsed / total, 0, 1) : 1;
        pendingStepAction = next;
        stepDeadline = performance.now() + duration;
        setProgress((elapsed / total) * 100);
        updateCountdown();
        tickTimer = requestAnimationFrame(tick);
        stepTimer = setTimeout(next, duration);
    };

    const beginFinalHold = (remainingMs = FINAL_HOLD_MS) => {
        clearTimers();
        const trace = State.pointTrace;
        finalHold = true;
        trace.playing = true;
        trace.paused = false;
        trace.animationT = 1;
        pausedRemainingMs = Math.max(0, remainingMs);
        pendingStepAction = finishPlayback;
        stepDeadline = performance.now() + pausedRemainingMs;
        setProgress(100);
        updateButtons();
        if (DOM.pointTraceCountdown) {
            DOM.pointTraceCountdown.textContent = 'Done';
        }
        App.drawScene();
        stepTimer = setTimeout(() => {
            if (State.pointTrace.playing && finalHold) {
                finishPlayback();
            }
        }, pausedRemainingMs);
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
        if (!DOM.pointTraceHudTitle) {
            return;
        }

        const trace = State.pointTrace;
        const hasSteps = trace.steps.length > 0;
        const step = hasSteps ? trace.steps[Math.min(trace.stepIndex, trace.steps.length - 1)] : null;
        DOM.pointTraceHudTitle.textContent = step ? step.label : 'Blue input';
        if (DOM.pointTraceHudPauseBtn) {
            DOM.pointTraceHudPauseBtn.textContent = trace.paused ? 'Resume' : 'Pause';
            setButtonState(DOM.pointTraceHudPauseBtn, !trace.active, 'hover:bg-indigo-100');
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
            lines: [`p0 = ${formatPoint(point)}`, 'This point starts in the original XY space.'],
            latex: texAligned([`p_{0} &= ${texPoint(point)}`])
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
                    lines: [`p${previousIndex} = ${formatPoint(previousPoint)}`, 'This layer is disabled and does not change the point.'],
                    latex: texAligned([
                        `p_{${previousIndex}} &= ${texPoint(previousPoint)}`,
                        `p_{${previousIndex + 1}} &= p_{${previousIndex}} \\quad \\text{(layer disabled)}`
                    ])
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
                    ],
                    latex: texAligned([
                        `p_{${previousIndex}} &= ${texPoint(previousPoint)}`,
                        `p_{${nextIndex}} &= f\\left(p_{${previousIndex}}\\right), \\quad ${ACTIVATION_LATEX[activationName] || `f(x) = \\operatorname{${activationName}}(x)`}`,
                        `&= \\begin{bmatrix}${texActivationCall(activationName, previousPoint[0])} \\\\ ${texActivationCall(activationName, previousPoint[1])}\\end{bmatrix}`,
                        `&= ${texPoint(current)}`
                    ])
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
                    lines: [`W${matrixCount} = ${formatMatrix(matrix)}`, 'This matrix is singular, so the inverse step is skipped.'],
                    latex: texAligned([
                        `W_{${matrixCount}} &= ${texMatrix(matrix)}`,
                        `\\det\\left(W_{${matrixCount}}\\right) &= 0 \\quad \\Rightarrow \\quad W_{${matrixCount}}^{-1} \\text{ is unavailable}`,
                        `p_{${previousIndex + 1}} &= p_{${previousIndex}} = ${texPoint(previousPoint)}`
                    ])
                });
                return;
            }

            current = App.applyLayerForward(current, layer);
            const nextIndex = steps.length;
            const matrixLabel = layer.isInverse ? `W${matrixCount}⁻¹` : `W${matrixCount}`;
            const latexMatrixLabel = layer.isInverse
                ? `W_{${matrixCount}}^{-1}`
                : `W_{${matrixCount}}`;
            steps.push({
                kind: 'matrix',
                label: `Layer ${layerIndex + 1}: matrix ${matrixLabel}`,
                point: [current[0], current[1]],
                lines: [
                    `${matrixLabel} = ${formatMatrix(effectiveMatrix)}`,
                    `b${matrixCount} = ${formatPoint(bias)}`,
                    `p${previousIndex} = ${formatPoint(previousPoint)}`,
                    `p${nextIndex} = ${matrixLabel}p${previousIndex} + b${matrixCount} = ${formatPoint(current)}`
                ],
                latex: texAligned([
                    `${latexMatrixLabel} &= ${texMatrix(effectiveMatrix)}, \\quad b_{${matrixCount}} = ${texPoint(bias)}`,
                    `p_{${nextIndex}} &= ${latexMatrixLabel}\\,p_{${previousIndex}} + b_{${matrixCount}}`,
                    `&= ${texMatrix(effectiveMatrix)}${texPoint(previousPoint)} + ${texPoint(bias)}`,
                    `&= \\begin{bmatrix}${texMatrixComponent(effectiveMatrix[0], previousPoint)}${texAdd(bias[0])} \\\\ ${texMatrixComponent(effectiveMatrix[1], previousPoint)}${texAdd(bias[1])}\\end{bmatrix}`,
                    `&= ${texPoint(current)}`
                ])
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
                    ],
                    latex: texAligned([
                        `p_{${previousIndex}} &= ${texPoint(previousPoint)}`,
                        `p_{${nextIndex}} &= f\\left(p_{${previousIndex}}\\right), \\quad ${ACTIVATION_LATEX[legacy] || `f(x) = \\operatorname{${legacy}}(x)`}`,
                        `&= \\begin{bmatrix}${texActivationCall(legacy, previousPoint[0])} \\\\ ${texActivationCall(legacy, previousPoint[1])}\\end{bmatrix}`,
                        `&= ${texPoint(current)}`
                    ])
                });
            }
        }

        return steps;
    };

    App.getPointTracePreview = function () {
        const trace = State.pointTrace;
        if (!trace || !trace.active || !trace.steps.length || !trace.stages.length) {
            return null;
        }

        const stageIndex = MathCore.clamp(trace.stepIndex, 0, trace.stages.length - 1);
        const stage = trace.stages[stageIndex];
        const progress = trace.animate ? MathCore.clamp(trace.animationT, 0, 1) : 1;

        return {
            stage,
            stageIndex,
            progress,
            map: Visuo.SpaceMorph.createMap(stage, progress)
        };
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
                trace.animationT = 1;
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
            let detail = step
                ? step.lines.join('\n')
                : 'Enter a point and start the demo.';
            const preview = trace.active && typeof App.getPointTracePreview === 'function'
                ? App.getPointTracePreview()
                : null;

            if (preview && trace.stepIndex > 0 && preview.progress < 1) {
                const livePoint = preview.map(trace.inputPoint);
                detail += `\n\nEvolution: ${Math.round(preview.progress * 100)}%\np(t) = ${formatPoint(livePoint)}`;
            }

            DOM.pointTraceStepDetail.textContent = detail;
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

    const setMathModalVisible = visible => {
        if (!DOM.pointTraceMathModal) {
            return;
        }
        DOM.pointTraceMathModal.classList.toggle('hidden', !visible);
        DOM.pointTraceMathModal.setAttribute('aria-hidden', visible ? 'false' : 'true');
    };

    const renderMathBlock = (container, latex, fallback) => {
        if (latex && global.katex && typeof global.katex.render === 'function') {
            const block = document.createElement('div');
            block.className = 'overflow-x-auto py-1 text-[15px] text-slate-800';
            try {
                global.katex.render(latex, block, {
                    displayMode: true,
                    throwOnError: false,
                    strict: 'ignore'
                });
                container.appendChild(block);
                return;
            } catch (error) {
                container.innerHTML = '';
            }
        }

        const pre = document.createElement('pre');
        pre.className = 'whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-600';
        pre.textContent = fallback;
        container.appendChild(pre);
    };

    const renderTraceMath = () => {
        if (!DOM.pointTraceMathContent) {
            return;
        }

        const trace = State.pointTrace;
        const content = DOM.pointTraceMathContent;
        content.innerHTML = '';

        if (!trace.steps.length) {
            const empty = document.createElement('p');
            empty.className = 'rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400';
            empty.textContent = 'Start the demo first, then click the trace notification to see the worked calculations.';
            content.appendChild(empty);
            return;
        }

        const currentIndex = Math.min(trace.stepIndex, trace.steps.length - 1);
        const preview = trace.active ? App.getPointTracePreview() : null;
        const livePoint = preview && currentIndex > 0 && preview.progress < 1
            ? preview.map(trace.inputPoint)
            : null;

        for (let index = 0; index <= currentIndex; index++) {
            const step = trace.steps[index];
            const isCurrent = index === currentIndex;
            const card = document.createElement('section');
            card.className = isCurrent
                ? 'rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm ring-1 ring-indigo-100'
                : 'rounded-2xl border border-slate-200 bg-white p-4';

            const header = document.createElement('div');
            header.className = 'flex items-start justify-between gap-3';

            const labels = document.createElement('div');
            const eyebrow = document.createElement('p');
            eyebrow.className = `text-[10px] font-bold uppercase tracking-[0.18em] ${isCurrent ? 'text-indigo-500' : 'text-slate-400'}`;
            eyebrow.textContent = `Step ${index}`;
            const title = document.createElement('p');
            title.className = 'mt-1 text-sm font-semibold text-slate-800';
            title.textContent = step.label;
            labels.appendChild(eyebrow);
            labels.appendChild(title);
            header.appendChild(labels);

            if (isCurrent) {
                const badge = document.createElement('span');
                badge.className = 'shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-600';
                badge.textContent = trace.paused ? 'Paused here' : 'Current';
                header.appendChild(badge);
            }

            card.appendChild(header);

            const math = document.createElement('div');
            math.className = 'mt-3';
            renderMathBlock(math, step.latex, step.lines.join('\n'));
            card.appendChild(math);
            content.appendChild(card);
        }

        if (livePoint) {
            const liveCard = document.createElement('section');
            liveCard.className = 'rounded-2xl border border-amber-200 bg-amber-50/70 p-4';

            const liveTitle = document.createElement('p');
            liveTitle.className = 'text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700';
            liveTitle.textContent = 'Position when paused';
            liveCard.appendChild(liveTitle);

            const liveMath = document.createElement('div');
            liveMath.className = 'mt-3';
            renderMathBlock(
                liveMath,
                texAligned([`p_{${currentIndex}}(t) &= ${texPoint(livePoint)}`]),
                `p${currentIndex}(t) = ${formatPoint(livePoint)}`
            );
            liveCard.appendChild(liveMath);
            content.appendChild(liveCard);
        }

        if (DOM.pointTraceMathSubtitle) {
            const lastIndex = trace.steps.length - 1;
            const suffix = livePoint
                ? ' Paused partway through this step.'
                : (currentIndex < lastIndex ? ' Later steps stay hidden.' : ' This is the final step.');
            DOM.pointTraceMathSubtitle.textContent = `Calculations from P0 through P${currentIndex}.${suffix}`;
        }

        if (DOM.pointTraceMathScroll) {
            DOM.pointTraceMathScroll.scrollTop = DOM.pointTraceMathScroll.scrollHeight;
        }
    };

    App.openPointTraceMath = function () {
        const trace = State.pointTrace;
        if (!DOM.pointTraceMathModal || !trace.active) {
            return;
        }

        if (trace.playing) {
            App.pausePointTrace();
        }

        setHudVisible(false);
        setModalVisible(false);
        setMathModalVisible(true);
        renderTraceMath();

        if (DOM.pointTraceMathCloseBtn) {
            DOM.pointTraceMathCloseBtn.focus();
        }
    };

    App.closePointTraceMath = function () {
        setMathModalVisible(false);
        if (State.pointTrace.active) {
            setHudVisible(true);
            updateButtons();
            App.drawScene();
        }
    };

    App.resumePointTraceMath = function () {
        setMathModalVisible(false);
        App.resumePointTrace();
    };

    App.stopPointTraceMath = function () {
        setMathModalVisible(false);
        App.stopPointTrace();
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
        finalHold = false;
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
            beginFinalHold(FINAL_HOLD_MS);
            return;
        }

        trace.stepIndex += 1;
        trace.animationT = 0;
        finalHold = false;
        App.drawScene();
        renderTracePanel();

        if (trace.stepIndex >= trace.steps.length - 1) {
            beginCountdown(() => beginFinalHold(FINAL_HOLD_MS));
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
        State.selectedPointInfo = null;
        const trace = State.pointTrace;
        trace.active = true;
        trace.playing = true;
        trace.paused = false;
        trace.finished = false;
        trace.inputPoint = point;
        trace.stepDurationMs = stepDurationMs;
        trace.animate = DOM.pointTraceAnimateToggle ? DOM.pointTraceAnimateToggle.checked : true;
        trace.steps = App.buildPointTraceSteps(point);
        finalHold = false;
        trace.stages = Visuo.SpaceMorph.buildStages(State.matrixCascade, {
            activationName: State.activeActivationName,
            hasExplicitActivationLayers: App.hasExplicitActivationLayers()
        });
        trace.stepIndex = 0;
        trace.animationT = 0;
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
        if (!finalHold) {
            const total = trace.stepDurationMs || DEFAULT_STEP_MS;
            trace.animationT = total > 0 ? MathCore.clamp((total - pausedRemainingMs) / total, 0, 1) : 1;
        }
        clearTimers();
        trace.playing = false;
        trace.paused = true;
        updateButtons();
        if (DOM.pointTraceCountdown) {
            DOM.pointTraceCountdown.textContent = `${(pausedRemainingMs / 1000).toFixed(1)}s`;
        }
        App.drawScene();
    };

    App.resumePointTrace = function () {
        const trace = State.pointTrace;
        if (!trace.active || trace.playing) {
            return;
        }

        const wasFinalHold = finalHold;
        const next = pendingStepAction || (trace.stepIndex >= trace.steps.length - 1 ? finishPlayback : advanceStep);
        trace.playing = true;
        trace.paused = false;
        setModalVisible(false);
        setHudVisible(true);
        updateButtons();
        if (wasFinalHold) {
            beginFinalHold(pausedRemainingMs > 0 ? pausedRemainingMs : FINAL_HOLD_MS);
        } else {
            beginCountdown(next, pausedRemainingMs > 0 ? pausedRemainingMs : trace.stepDurationMs);
        }
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
        finalHold = false;
        setMathModalVisible(false);
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

        lastFocusedElement = document.activeElement;

        if (State.pointTrace.active) {
            App.openPointTraceMath();
            return;
        }

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
        const preview = typeof App.getPointTracePreview === 'function'
            ? App.getPointTracePreview()
            : null;
        const currentGlobalPoint = preview
            ? preview.map(trace.inputPoint)
            : trace.steps[currentIndex].point;

        context.save();

        if (currentIndex > 0) {
            context.beginPath();
            context.strokeStyle = 'rgba(245, 158, 11, 0.55)';
            context.lineWidth = 1.5;
            context.setLineDash([5, 5]);
            let started = false;

            for (let stageIndex = 1; stageIndex <= currentIndex; stageIndex++) {
                const stage = trace.stages[stageIndex];
                const endProgress = stageIndex === currentIndex
                    ? (preview ? preview.progress : 1)
                    : 1;
                const sampleCount = stage ? 18 : 1;

                for (let sample = 0; sample <= sampleCount; sample++) {
                    const progress = (sample / sampleCount) * endProgress;
                    const point = stage
                        ? stage.mapAt(trace.inputPoint, progress)
                        : (sample === 0 ? trace.steps[stageIndex - 1].point : trace.steps[stageIndex].point);
                    const canvasPoint = toCanvas(point);
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
            const complete = currentIndex === trace.steps.length - 1;
            const evolving = trace.animate && preview && preview.progress < 1;
            const markerLabel = evolving
                ? `P${currentIndex} ${formatPoint(currentGlobalPoint)}`
                : `P${currentIndex}`;
            drawMarker(currentGlobalPoint, complete ? '#dc2626' : '#f59e0b', markerLabel, true);
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
        DOM.pointTraceHudCard.addEventListener('click', App.openPointTraceMath);
        DOM.pointTraceHudPauseBtn.addEventListener('click', App.togglePointTracePlayback);
        DOM.pointTraceMathBackdrop.addEventListener('click', App.closePointTraceMath);
        DOM.pointTraceMathCloseBtn.addEventListener('click', App.closePointTraceMath);
        DOM.pointTraceMathResumeBtn.addEventListener('click', App.resumePointTraceMath);
        DOM.pointTraceMathStopBtn.addEventListener('click', App.stopPointTraceMath);
        global.addEventListener('load', () => {
            if (DOM.pointTraceMathModal && !DOM.pointTraceMathModal.classList.contains('hidden')) {
                renderTraceMath();
            }
        });

        if (DOM.pointTraceAnimateToggle) {
            DOM.pointTraceAnimateToggle.checked = State.pointTrace.animate;
            DOM.pointTraceAnimateToggle.addEventListener('change', () => {
                State.pointTrace.animate = DOM.pointTraceAnimateToggle.checked;
                if (State.pointTrace.active) {
                    App.drawScene();
                }
            });
        }

        [DOM.pointTraceXInput, DOM.pointTraceYInput, DOM.pointTraceStepDuration].forEach(input => {
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    App.startPointTrace();
                }
            });
        });

        document.addEventListener('keydown', event => {
            if (!State.pointTrace.active) {
                return;
            }

            const mathOpen = DOM.pointTraceMathModal && !DOM.pointTraceMathModal.classList.contains('hidden');
            if (event.key === 'Escape' && mathOpen) {
                event.preventDefault();
                App.closePointTraceMath();
                return;
            }

            if (event.code !== 'Space' && event.key !== ' ') {
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
            if (mathOpen) {
                App.resumePointTraceMath();
            } else {
                App.togglePointTracePlayback();
            }
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
