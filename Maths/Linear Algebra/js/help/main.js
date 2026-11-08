(function (global) {
    'use strict';

    const Visuo = global.Visuo;
    const Activation = Visuo.Activation;
    const MathCore = Visuo.Math;

    function init() {
        const canvas = document.getElementById('spaceCanvas');
        const ctx = canvas.getContext('2d');

        katex.render(
            "F(x,y) = \\begin{bmatrix} \\sigma(x) \\\\ \\sigma(y) \\end{bmatrix}",
            document.getElementById('formulaSigmoid'),
            { throwOnError: false }
        );
        katex.render(
            "J(x,y) = \\begin{bmatrix} \\sigma'(x) & 0 \\\\ 0 & \\sigma'(y) \\end{bmatrix}",
            document.getElementById('formulaJacobian'),
            { throwOnError: false }
        );

        let width = 0;
        let height = 0;
        let morphT = 1.0;
        let zoom = 1.0;
        let viewMode = 'sigmoid';
        let showBounds = true;
        let showGridVectors = true;
        let probe = { x: 0.5, y: 0.5 };
        let isDraggingProbe = false;
        let pan = { x: 0, y: 0 };
        let isPanning = false;
        let panStart = { x: 0, y: 0 };

        const GRID_RANGE = 6;
        const VIEW_MARGIN = 1.25;

        const sigmoidFn = v => 1 / (1 + Math.exp(-v));
        const sigmoidDeriv = v => {
            const s = sigmoidFn(v);
            return s * (1 - s);
        };

        function rawTransformedPoint(x, y) {
            return { x: sigmoidFn(x), y: sigmoidFn(y) };
        }

        function transformPoint(x, y, t) {
            if (t <= 0) {
                return { x, y };
            }
            const raw = rawTransformedPoint(x, y);
            return {
                x: (1 - t) * x + t * raw.x,
                y: (1 - t) * y + t * raw.y
            };
        }

        function getLocalBasis(x, y, t) {
            const dx = sigmoidDeriv(x);
            const dy = sigmoidDeriv(y);

            return {
                e1: {
                    x: (1 - t) + t * dx,
                    y: 0
                },
                e2: {
                    x: 0,
                    y: (1 - t) + t * dy
                }
            };
        }

        function resizeCanvas() {
            const container = canvas.parentElement;
            width = container.clientWidth;
            height = container.clientHeight;
            canvas.width = width * window.devicePixelRatio;
            canvas.height = height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            draw();
        }

        function getView(t, centerOffsetX = 0) {
            const panelWidth = viewMode === 'split' ? width / 2 : width;
            const a = transformPoint(-GRID_RANGE, -GRID_RANGE, t);
            const b = transformPoint(GRID_RANGE, GRID_RANGE, t);
            const minX = Math.min(a.x, b.x);
            const maxX = Math.max(a.x, b.x);
            const minY = Math.min(a.y, b.y);
            const maxY = Math.max(a.y, b.y);
            const spanX = Math.max(maxX - minX, 1e-6);
            const spanY = Math.max(maxY - minY, 1e-6);
            const fitScale = Math.min(
                panelWidth / (spanX * VIEW_MARGIN),
                height / (spanY * VIEW_MARGIN)
            );

            return {
                scale: fitScale * zoom,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                offsetX: centerOffsetX
            };
        }

        function mathToCanvas(mx, my, view) {
            return {
                x: width / 2 + view.offsetX + (mx + pan.x - view.centerX) * view.scale,
                y: height / 2 - (my + pan.y - view.centerY) * view.scale
            };
        }

        function canvasToMath(cx, cy, view) {
            return {
                x: (cx - width / 2 - view.offsetX) / view.scale - pan.x + view.centerX,
                y: (height / 2 - cy) / view.scale - pan.y + view.centerY
            };
        }

        function drawArrow(fromX, fromY, toX, toY, color, lineWidth = 2, label = '') {
            const headLength = 8;
            const dx = toX - fromX;
            const dy = toY - fromY;
            const angle = Math.atan2(dy, dx);

            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = lineWidth;

            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(toX, toY);
            ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
            ctx.closePath();
            ctx.fill();

            if (label) {
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.fillText(label, toX + Math.cos(angle) * 10, toY + Math.sin(angle) * 10);
            }
        }

        function drawSplitLabel(text, x) {
            ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(text, x, 30);
        }

        function drawSpaceGrid(t, centerOffsetX) {
            const view = getView(t, centerOffsetX);
            const range = GRID_RANGE;
            const step = 0.5;
            const subSteps = 120;

            if (showBounds && t > 0.05) {
                const boxMin = 0;
                const boxMax = 1;

                const p1 = mathToCanvas(boxMin, boxMin, view);
                const p2 = mathToCanvas(boxMax, boxMin, view);
                const p3 = mathToCanvas(boxMax, boxMax, view);
                const p4 = mathToCanvas(boxMin, boxMax, view);

                ctx.fillStyle = 'rgba(99, 102, 241, 0.05)';
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(p3.x, p3.y);
                ctx.lineTo(p4.x, p4.y);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = 'rgba(99, 102, 241, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            for (let value = -range; value <= range; value += step) {
                const isAxis = Math.abs(value) < 0.01;

                if (isAxis) {
                    ctx.strokeStyle = 'rgba(248, 250, 252, 0.85)';
                    ctx.lineWidth = 2;
                } else {
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
                    ctx.lineWidth = 1.2;
                }

                ctx.beginPath();
                for (let i = 0; i <= subSteps; i++) {
                    const y = -range + (i / subSteps) * (2 * range);
                    const point = transformPoint(value, y, t);
                    const canvasPoint = mathToCanvas(point.x, point.y, view);
                    if (i === 0) {
                        ctx.moveTo(canvasPoint.x, canvasPoint.y);
                    } else {
                        ctx.lineTo(canvasPoint.x, canvasPoint.y);
                    }
                }
                ctx.stroke();

                ctx.beginPath();
                for (let i = 0; i <= subSteps; i++) {
                    const x = -range + (i / subSteps) * (2 * range);
                    const point = transformPoint(x, value, t);
                    const canvasPoint = mathToCanvas(point.x, point.y, view);
                    if (i === 0) {
                        ctx.moveTo(canvasPoint.x, canvasPoint.y);
                    } else {
                        ctx.lineTo(canvasPoint.x, canvasPoint.y);
                    }
                }
                ctx.stroke();
            }

            if (!showGridVectors || t <= 0.05) {
                return;
            }

            const vectorSpacing = 1.5;
            for (let gx = -4.5; gx <= 4.5; gx += vectorSpacing) {
                for (let gy = -4.5; gy <= 4.5; gy += vectorSpacing) {
                    const point = transformPoint(gx, gy, t);
                    const basis = getLocalBasis(gx, gy, t);
                    const canvasPoint = mathToCanvas(point.x, point.y, view);

                    const arrowScale = view.scale * 0.15;
                    drawArrow(canvasPoint.x, canvasPoint.y, canvasPoint.x + basis.e1.x * arrowScale, canvasPoint.y - basis.e1.y * arrowScale, 'rgba(52, 211, 153, 0.35)', 1.5);
                    drawArrow(canvasPoint.x, canvasPoint.y, canvasPoint.x + basis.e2.x * arrowScale, canvasPoint.y - basis.e2.y * arrowScale, 'rgba(251, 113, 133, 0.35)', 1.5);
                }
            }
        }

        function drawProbeAndBasis(t, centerOffsetX) {
            const view = getView(t, centerOffsetX);
            const probePoint = transformPoint(probe.x, probe.y, t);
            const canvasPoint = mathToCanvas(probePoint.x, probePoint.y, view);
            const basis = getLocalBasis(probe.x, probe.y, t);

            ctx.save();
            ctx.setLineDash([3, 3]);

            const e1Angle = Math.atan2(-basis.e1.y, basis.e1.x);
            ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(canvasPoint.x - 70 * Math.cos(e1Angle), canvasPoint.y - 70 * Math.sin(e1Angle));
            ctx.lineTo(canvasPoint.x + 70 * Math.cos(e1Angle), canvasPoint.y + 70 * Math.sin(e1Angle));
            ctx.stroke();

            const e2Angle = Math.atan2(-basis.e2.y, basis.e2.x);
            ctx.strokeStyle = 'rgba(251, 113, 133, 0.4)';
            ctx.beginPath();
            ctx.moveTo(canvasPoint.x - 70 * Math.cos(e2Angle), canvasPoint.y - 70 * Math.sin(e2Angle));
            ctx.lineTo(canvasPoint.x + 70 * Math.cos(e2Angle), canvasPoint.y + 70 * Math.sin(e2Angle));
            ctx.stroke();
            ctx.restore();

            const vectorScale = view.scale * 0.35;

            drawArrow(
                canvasPoint.x,
                canvasPoint.y,
                canvasPoint.x + basis.e1.x * vectorScale,
                canvasPoint.y - basis.e1.y * vectorScale,
                '#34d399',
                3,
                'e₁'
            );
            drawArrow(
                canvasPoint.x,
                canvasPoint.y,
                canvasPoint.x + basis.e2.x * vectorScale,
                canvasPoint.y - basis.e2.y * vectorScale,
                '#fb7185',
                3,
                'e₂'
            );

            ctx.fillStyle = '#6366f1';
            ctx.beginPath();
            ctx.arc(canvasPoint.x, canvasPoint.y, 7, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
            ctx.beginPath();
            ctx.arc(canvasPoint.x, canvasPoint.y, 14, 0, Math.PI * 2);
            ctx.fill();
        }

        function updateDiagnostics() {
            document.getElementById('origCoord').innerText = `(${probe.x.toFixed(2)}, ${probe.y.toFixed(2)})`;

            const currentT = viewMode === 'linear' ? 0 : morphT;
            const point = transformPoint(probe.x, probe.y, currentT);
            document.getElementById('sigCoord').innerText = `(${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;

            const basis = getLocalBasis(probe.x, probe.y, currentT);
            const scaleFactor = 1;
            const normE1 = { x: basis.e1.x / scaleFactor, y: basis.e1.y / scaleFactor };
            const normE2 = { x: basis.e2.x / scaleFactor, y: basis.e2.y / scaleFactor };

            const len1 = Math.hypot(normE1.x, normE1.y);
            const len2 = Math.hypot(normE2.x, normE2.y);

            document.getElementById('e1Vec').innerText = `[${normE1.x.toFixed(3)}, ${normE1.y.toFixed(3)}]`;
            document.getElementById('e2Vec').innerText = `[${normE2.x.toFixed(3)}, ${normE2.y.toFixed(3)}]`;

            const determinant = normE1.x * normE2.y - normE1.y * normE2.x;
            document.getElementById('jacDet').innerText = `det(J) = ${determinant.toFixed(4)}`;

            const dot = normE1.x * normE2.x + normE1.y * normE2.y;
            const cosTheta = Math.max(-1, Math.min(1, dot / (len1 * len2 || 1)));
            const angleDeg = (Math.acos(cosTheta) * 180 / Math.PI).toFixed(1);

            document.getElementById('basisLengths').innerText = `|e₁|=${len1.toFixed(3)}, |e₂|=${len2.toFixed(3)}`;
            document.getElementById('basisAngle').innerText = `θ = ${angleDeg}° (Orthogonal scaling)`;
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);

            if (viewMode === 'split') {
                const halfWidth = width / 2;

                ctx.save();
                ctx.beginPath();
                ctx.rect(0, 0, halfWidth, height);
                ctx.clip();
                drawSpaceGrid(0.0, -halfWidth / 2);
                drawProbeAndBasis(0.0, -halfWidth / 2);
                drawSplitLabel('Original Linear Space ℝ²', 20);
                ctx.restore();

                ctx.save();
                ctx.beginPath();
                ctx.rect(halfWidth, 0, halfWidth, height);
                ctx.clip();
                drawSpaceGrid(morphT, halfWidth / 2);
                drawProbeAndBasis(morphT, halfWidth / 2);
                drawSplitLabel('Element-wise Sigmoid Space', halfWidth + 20);
                ctx.restore();

                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(halfWidth, 0);
                ctx.lineTo(halfWidth, height);
                ctx.stroke();
            } else {
                const currentT = viewMode === 'linear' ? 0 : morphT;
                drawSpaceGrid(currentT, 0);
                drawProbeAndBasis(currentT, 0);
            }

            updateDiagnostics();
        }

        const morphSlider = document.getElementById('morphSlider');
        const morphValue = document.getElementById('morphVal');

        morphSlider.addEventListener('input', (e) => {
            morphT = parseFloat(e.target.value);
            morphValue.innerText = morphT.toFixed(2);
            draw();
        });

        function setMode(mode, targetButton) {
            viewMode = mode;
            ['modeLinear', 'modeSplit', 'modeSigmoid'].forEach(id => {
                document.getElementById(id).className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 text-slate-300 hover:text-white';
            });
            targetButton.className = 'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 bg-indigo-600 text-white shadow-lg shadow-indigo-500/20';

            if (mode === 'linear') {
                morphSlider.value = 0;
                morphT = 0;
                morphValue.innerText = '0.00';
            } else if (mode === 'sigmoid') {
                morphSlider.value = 1;
                morphT = 1;
                morphValue.innerText = '1.00';
            }
            draw();
        }

        document.getElementById('modeLinear').addEventListener('click', (e) => setMode('linear', e.target));
        document.getElementById('modeSplit').addEventListener('click', (e) => setMode('split', e.target));
        document.getElementById('modeSigmoid').addEventListener('click', (e) => setMode('sigmoid', e.target));

        document.getElementById('toggleBounds').addEventListener('change', (e) => {
            showBounds = e.target.checked;
            draw();
        });
        document.getElementById('toggleGridVectors').addEventListener('change', (e) => {
            showGridVectors = e.target.checked;
            draw();
        });

        document.getElementById('zoomInBtn').addEventListener('click', () => {
            zoom *= 1.2;
            draw();
        });
        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            zoom /= 1.2;
            draw();
        });
        document.getElementById('resetViewBtn').addEventListener('click', () => {
            zoom = 1.0;
            pan = { x: 0, y: 0 };
            probe = { x: 0.5, y: 0.5 };
            draw();
        });

        function getCanvasPos(e) {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        canvas.addEventListener('mousedown', (e) => {
            const pos = getCanvasPos(e);
            let centerOffsetX = 0;
            if (viewMode === 'split') {
                centerOffsetX = pos.x < width / 2 ? -width / 4 : width / 4;
            }

            const currentT = viewMode === 'linear' ? 0 : morphT;
            const view = getView(currentT, centerOffsetX);
            const probePoint = transformPoint(probe.x, probe.y, currentT);
            const canvasPoint = mathToCanvas(probePoint.x, probePoint.y, view);
            const distance = Math.hypot(pos.x - canvasPoint.x, pos.y - canvasPoint.y);

            if (distance < 25) {
                isDraggingProbe = true;
            } else {
                isPanning = true;
                panStart = { x: pos.x, y: pos.y };
            }
        });

        window.addEventListener('mousemove', (e) => {
            const pos = getCanvasPos(e);

            if (isDraggingProbe) {
                let centerOffsetX = 0;
                if (viewMode === 'split') {
                    centerOffsetX = pos.x < width / 2 ? -width / 4 : width / 4;
                }
                const currentT = viewMode === 'linear' ? 0 : morphT;
                const view = getView(currentT, centerOffsetX);
                const mathPoint = canvasToMath(pos.x, pos.y, view);
                probe.x = MathCore.clamp(mathPoint.x, -GRID_RANGE, GRID_RANGE);
                probe.y = MathCore.clamp(mathPoint.y, -GRID_RANGE, GRID_RANGE);
                draw();
            } else if (isPanning) {
                let centerOffsetX = 0;
                if (viewMode === 'split') {
                    centerOffsetX = pos.x < width / 2 ? -width / 4 : width / 4;
                }
                const currentT = viewMode === 'linear' ? 0 : morphT;
                const view = getView(currentT, centerOffsetX);
                const dx = (pos.x - panStart.x) / view.scale;
                const dy = -(pos.y - panStart.y) / view.scale;
                pan.x += dx;
                pan.y += dy;
                panStart = { x: pos.x, y: pos.y };
                draw();
            }
        });

        window.addEventListener('mouseup', () => {
            isDraggingProbe = false;
            isPanning = false;
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                zoom *= 1.1;
            } else {
                zoom /= 1.1;
            }
            draw();
        }, { passive: false });

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})(window);
