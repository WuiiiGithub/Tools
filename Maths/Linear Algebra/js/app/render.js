(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config, Math: MathCore, Activation } = Visuo;

    const lerpPoint = (start, end, t) => [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t
    ];

    const mapInputToCanvas = (mapPoint, inputPoint) => {
        const viewPoint = mapPoint(inputPoint);
        return App.toCanvasCoords(viewPoint[0], viewPoint[1]);
    };

    const getAxisWidth = (baseWidth, thickness) => {
        const gridThickness = thickness ?? Config.DEFAULT_GRID_THICKNESS;
        return Math.max(1, baseWidth * (gridThickness / Config.DEFAULT_GRID_THICKNESS));
    };

    const getJacobianDeterminant = (point, determinantFn, activationName) => {
        if (determinantFn) {
            return determinantFn(point);
        }

        const jacobian = Activation.jacobian(point, activationName);
        return Math.abs(jacobian[0][0] * jacobian[1][1] - jacobian[0][1] * jacobian[1][0]);
    };

    const getLineCompression = (determinantFn, activationName, determinantAtOrigin, points) => {
        if (determinantAtOrigin <= 1e-12) {
            return 0;
        }

        let total = 0;

        points.forEach(point => {
            const determinant = getJacobianDeterminant(point, determinantFn, activationName);
            total += MathCore.clamp(1 - determinant / determinantAtOrigin, 0, 1);
        });

        return total / points.length;
    };

    const mergeBounds = (...boundsList) => {
        const validBounds = boundsList.filter(Boolean);
        return {
            minX: Math.min(...validBounds.map(bounds => bounds.minX)),
            maxX: Math.max(...validBounds.map(bounds => bounds.maxX)),
            minY: Math.min(...validBounds.map(bounds => bounds.minY)),
            maxY: Math.max(...validBounds.map(bounds => bounds.maxY))
        };
    };

    App.drawVector = function (context, vector, color, lineWidth = 3, label = null, startPoint = [0, 0]) {
        const startCanvas = App.toCanvasCoords(startPoint[0], startPoint[1]);
        const endCanvas = App.toCanvasCoords(vector[0], vector[1]);

        context.beginPath();
        context.moveTo(startCanvas.cx, startCanvas.cy);
        context.lineTo(endCanvas.cx, endCanvas.cy);
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();

        const angle = Math.atan2(vector[1] - startPoint[1], vector[0] - startPoint[0]);
        const dynamicArrowSize = Math.max(4, Math.min(16, 8 * (State.scale / Config.INITIAL_SCALE)));
        const arrowAngleOffset = Math.PI / 6;

        context.beginPath();
        context.moveTo(endCanvas.cx, endCanvas.cy);
        context.lineTo(
            endCanvas.cx - dynamicArrowSize * Math.cos(angle - arrowAngleOffset),
            endCanvas.cy + dynamicArrowSize * Math.sin(angle - arrowAngleOffset)
        );
        context.moveTo(endCanvas.cx, endCanvas.cy);
        context.lineTo(
            endCanvas.cx - dynamicArrowSize * Math.cos(angle + arrowAngleOffset),
            endCanvas.cy + dynamicArrowSize * Math.sin(angle + arrowAngleOffset)
        );
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();

        if (!label) {
            return;
        }

        const dynamicFontSize = App.getDynamicFontSize(State.vectorFontSize ?? Config.VECTOR_LABEL_BASE_FONT_SIZE);
        context.fillStyle = color;
        context.font = `bold ${dynamicFontSize}px Inter`;

        const labelOffsetDist = dynamicFontSize * 1.5;
        let labelX = endCanvas.cx;
        let labelY = endCanvas.cy;

        context.textAlign = 'center';
        context.textBaseline = 'middle';

        switch (label) {
            case 'X':
                labelY = endCanvas.cy + labelOffsetDist;
                break;
            case 'Y':
                labelX = endCanvas.cx - labelOffsetDist;
                context.textAlign = 'right';
                break;
            case 'X1':
                labelX = endCanvas.cx + labelOffsetDist * Math.cos(angle);
                labelY = endCanvas.cy + labelOffsetDist * Math.sin(angle);

                if (angle > -Math.PI / 4 && angle <= Math.PI / 4) {
                    context.textAlign = 'left';
                } else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) {
                    context.textBaseline = 'bottom';
                } else if (angle > 3 * Math.PI / 4 || angle <= -3 * Math.PI / 4) {
                    context.textAlign = 'right';
                } else {
                    context.textBaseline = 'top';
                }
                break;
            case 'X2': {
                const perpendicularOffset = dynamicFontSize * 0.8;
                const offsetAngle = angle + Math.PI / 2;
                labelX = endCanvas.cx + perpendicularOffset * Math.cos(offsetAngle);
                labelY = endCanvas.cy + perpendicularOffset * Math.sin(offsetAngle);
                context.textAlign = labelX > endCanvas.cx ? 'left' : 'right';
                context.textBaseline = labelY > endCanvas.cy ? 'top' : 'bottom';
                break;
            }
            default:
                labelX = endCanvas.cx + labelOffsetDist * Math.cos(angle);
                labelY = endCanvas.cy + labelOffsetDist * Math.sin(angle);
                break;
        }

        context.fillText(label, labelX, labelY);
    };

    App.drawMappedPath = function (context, mapPoint, startPoint, endPoint, options = {}) {
        const config = typeof options === 'number' ? { sampleCount: options } : options;
        let start = startPoint;
        let end = endPoint;

        if (config.clipToPositiveDomain) {
            const clipped = Activation.clipToPositiveDomain(start, end);
            if (!clipped) {
                return;
            }
            start = clipped.start;
            end = clipped.end;
        }

        if (config.adaptive) {
            const renderScope = MathCore.clamp(
                config.renderScope ?? State.renderScope ?? Config.DEFAULT_RENDER_SCOPE,
                0,
                1
            );
            const maxDepth = config.maxDepth ?? Math.round(
                Config.MIN_ADAPTIVE_DEPTH + renderScope * (Config.MAX_ADAPTIVE_DEPTH - Config.MIN_ADAPTIVE_DEPTH)
            );
            const minDepth = config.minDepth ?? 1;
            const tolerance = config.tolerance ?? (
                Config.LAZY_RENDER_TOLERANCE + renderScope * (Config.FULL_RENDER_TOLERANCE - Config.LAZY_RENDER_TOLERANCE)
            );
            const startCanvas = mapInputToCanvas(mapPoint, start);
            const endCanvas = mapInputToCanvas(mapPoint, end);
            const points = [{ input: start, canvas: startCanvas }];

            const subdivide = (a, b, aCanvas, bCanvas, depth) => {
                let maximumDeviation = 0;

                [0.25, 0.5, 0.75].forEach(t => {
                    const canvasPoint = mapInputToCanvas(mapPoint, lerpPoint(a, b, t));
                    const chordX = aCanvas.cx + (bCanvas.cx - aCanvas.cx) * t;
                    const chordY = aCanvas.cy + (bCanvas.cy - aCanvas.cy) * t;
                    maximumDeviation = Math.max(
                        maximumDeviation,
                        Math.hypot(canvasPoint.cx - chordX, canvasPoint.cy - chordY)
                    );
                });

                if (depth >= maxDepth || (depth >= minDepth && maximumDeviation <= tolerance)) {
                    points.push({ input: b, canvas: bCanvas });
                    return;
                }

                const midpoint = lerpPoint(a, b, 0.5);
                const midpointCanvas = mapInputToCanvas(mapPoint, midpoint);
                subdivide(a, midpoint, aCanvas, midpointCanvas, depth + 1);
                subdivide(midpoint, b, midpointCanvas, bCanvas, depth + 1);
            };

            subdivide(start, end, startCanvas, endCanvas, 0);

            if (config.modulation) {
                const modulation = config.modulation;
                let batch = null;

                const flush = () => {
                    if (!batch) {
                        return;
                    }

                    context.beginPath();
                    batch.points.forEach((point, index) => {
                        if (index === 0) {
                            context.moveTo(point.cx, point.cy);
                        } else {
                            context.lineTo(point.cx, point.cy);
                        }
                    });
                    context.globalAlpha = batch.alpha;
                    context.lineWidth = batch.width;
                    context.stroke();
                    batch = null;
                };

                for (let index = 1; index < points.length; index++) {
                    const previous = points[index - 1];
                    const current = points[index];
                    const midpoint = lerpPoint(previous.input, current.input, 0.5);
                    const compression = getLineCompression(
                        modulation.determinantFn,
                        modulation.activationName,
                        modulation.determinantAtOrigin,
                        [midpoint]
                    );
                    const level = Math.round(compression * 10) / 10;
                    const alpha = modulation.alphaMin + (modulation.alphaMax - modulation.alphaMin) * level;
                    const width = modulation.baseWidth * (1 + 0.5 * level);

                    if (!batch || batch.level !== level) {
                        flush();
                        batch = {
                            level,
                            alpha,
                            width,
                            points: [previous.canvas, current.canvas]
                        };
                    } else {
                        batch.points.push(current.canvas);
                    }
                }

                flush();
                context.globalAlpha = 1;
                context.lineWidth = modulation.baseWidth;
                return;
            }

            context.beginPath();
            points.forEach((point, index) => {
                if (index === 0) {
                    context.moveTo(point.canvas.cx, point.canvas.cy);
                } else {
                    context.lineTo(point.canvas.cx, point.canvas.cy);
                }
            });
            context.stroke();
            return;
        }

        const sampleCount = config.sampleCount ?? 1;
        const steps = Math.max(1, sampleCount);
        context.beginPath();

        for (let i = 0; i <= steps; i++) {
            const inputPoint = lerpPoint(start, end, i / steps);
            const canvasPoint = mapInputToCanvas(mapPoint, inputPoint);

            if (i === 0) {
                context.moveTo(canvasPoint.cx, canvasPoint.cy);
            } else {
                context.lineTo(canvasPoint.cx, canvasPoint.cy);
            }
        }

        context.stroke();
    };

    App.drawGrid = function (context, palette, mapPoint, bounds, options = {}) {
        const config = typeof options === 'number' ? { sampleCount: options } : options;
        const activationName = config.activationName || 'linear';
        const spanX = bounds.maxX - bounds.minX;
        const spanY = bounds.maxY - bounds.minY;

        const originView = mapPoint([0, 0]);
        const xUnitView = mapPoint([1, 0]);
        const yUnitView = mapPoint([0, 1]);
        const xLength = Math.hypot(xUnitView[0] - originView[0], xUnitView[1] - originView[1]) || 1e-9;
        const yLength = Math.hypot(yUnitView[0] - originView[0], yUnitView[1] - originView[1]) || 1e-9;

        const minSpan = Math.min(spanX, spanY);
        const maxSpan = Math.max(spanX, spanY);
        const density = MathCore.clamp(
            config.density ?? Config.DEFAULT_GRID_DENSITY,
            Config.MIN_GRID_DENSITY,
            Config.MAX_GRID_DENSITY
        );
        const referenceLength = Math.sqrt(Math.max(xLength, 1e-9) * Math.max(yLength, 1e-9));
        const minimumLength = Math.min(xLength, yLength);
        const desiredTickCount = Math.max(2, Config.DESIRED_TICK_COUNT * density);
        const targetSpacing = Config.TARGET_GRID_SPACING / density;
        const maxGridLines = Math.max(4, Math.round(Config.MAX_GRID_LINES * density));
        const tickStep = MathCore.getNiceStep(minSpan / desiredTickCount);

        let gridStep = MathCore.getGridStep(tickStep, targetSpacing / (State.scale * referenceLength));
        const minimumStep = Config.MIN_GRID_SCREEN_SPACING / (State.scale * minimumLength);

        if (gridStep < minimumStep) {
            gridStep = MathCore.getNiceStep(minimumStep);
        }
        if (maxSpan / gridStep > maxGridLines) {
            gridStep = MathCore.getNiceStep(maxSpan / maxGridLines);
        }

        const baseWidth = palette.gridWidth ?? 0.6;
        const determinantFn = config.getDeterminant || null;
        const modulation = config.modulate ? {
            activationName,
            determinantFn,
            determinantAtOrigin: determinantFn
                ? determinantFn([0, 0])
                : getJacobianDeterminant([0, 0], null, activationName),
            alphaMin: 0.62,
            alphaMax: 1,
            baseWidth
        } : null;

        context.strokeStyle = palette.grid;
        context.lineWidth = baseWidth;

        const drawGridLines = (step, min, max, vertical) => {
            const first = Math.ceil(min / step);
            const last = Math.floor(max / step);
            const tolerance = step * 1e-9;

            for (let k = first; k <= last; k++) {
                const value = k * step;
                if (Math.abs(value) < tolerance) {
                    continue;
                }

                if (vertical) {
                    App.drawMappedPath(context, mapPoint, [value, bounds.minY], [value, bounds.maxY], {
                        sampleCount: config.sampleCount,
                        adaptive: config.adaptive,
                        clipToPositiveDomain: config.clipToPositiveDomain,
                        modulation
                    });
                } else {
                    App.drawMappedPath(context, mapPoint, [bounds.minX, value], [bounds.maxX, value], {
                        sampleCount: config.sampleCount,
                        adaptive: config.adaptive,
                        clipToPositiveDomain: config.clipToPositiveDomain,
                        modulation
                    });
                }
            }
        };

        drawGridLines(gridStep, bounds.minX, bounds.maxX, true);
        drawGridLines(gridStep, bounds.minY, bounds.maxY, false);

        context.globalAlpha = 1;
        context.lineWidth = baseWidth;
    };

    App.drawAxes = function (context, color, lineWidth, mapPoint, bounds, drawXYLabels = false, options = {}) {
        const config = typeof options === 'number' ? { sampleCount: options } : options;

        context.strokeStyle = color;
        context.lineWidth = lineWidth;

        App.drawMappedPath(context, mapPoint, [bounds.minX, 0], [bounds.maxX, 0], config);
        App.drawMappedPath(context, mapPoint, [0, bounds.minY], [0, bounds.maxY], config);

        if (!drawXYLabels) {
            return;
        }

        const dynamicFontSize = App.getDynamicFontSize(State.axisFontSize ?? Config.AXIS_LABEL_BASE_FONT_SIZE);
        context.fillStyle = '#4a5568';
        context.font = `bold ${dynamicFontSize}px Inter`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const pad = dynamicFontSize;

        if (!config.clipToPositiveDomain || Activation.isPositiveDomain([bounds.maxX, 0])) {
            const xLabelView = mapPoint([bounds.maxX, 0]);
            const xLabelCanvas = App.toCanvasCoords(xLabelView[0], xLabelView[1]);
            context.fillText(
                'X',
                Math.min(DOM.canvas.width - pad, Math.max(pad, xLabelCanvas.cx)),
                Math.min(DOM.canvas.height - pad, Math.max(pad, xLabelCanvas.cy))
            );
        }

        if (!config.clipToPositiveDomain || Activation.isPositiveDomain([0, bounds.maxY])) {
            const yLabelView = mapPoint([0, bounds.maxY]);
            const yLabelCanvas = App.toCanvasCoords(yLabelView[0], yLabelView[1]);
            context.fillText(
                'Y',
                Math.min(DOM.canvas.width - pad, Math.max(pad, yLabelCanvas.cx)),
                Math.min(DOM.canvas.height - pad, Math.max(pad, yLabelCanvas.cy))
            );
        }
    };

    App.drawTicksAndLabels = function (context, color, mapPoint, bounds, options = {}) {
        const config = options || {};
        const dynamicFontSize = App.getDynamicFontSize(State.tickFontSize ?? Config.TICK_LABEL_BASE_FONT_SIZE);
        context.fillStyle = color;
        context.font = `${dynamicFontSize}px Inter`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const tickLength = 4;
        const labelOffset = dynamicFontSize * 1.5;

        const originViewPoint = mapPoint([0, 0]);
        const originCanvasCoords = App.toCanvasCoords(originViewPoint[0], originViewPoint[1]);
        const minDistanceForLabel = dynamicFontSize * 1.5;

        const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
        const tickStep = MathCore.getNiceStep(span / Config.DESIRED_TICK_COUNT);

        const drawAxisTicks = (axis, tickStep, min, max) => {
            const firstTick = Math.floor(min / tickStep);
            const lastTick = Math.ceil(max / tickStep);

            for (let k = firstTick; k <= lastTick; k++) {
                const value = k * tickStep;
                if (Math.abs(value) < tickStep * 1e-6) {
                    continue;
                }

                const inputPoint = axis === 'X' ? [value, 0] : [0, value];

                if (config.clipToPositiveDomain && !Activation.isPositiveDomain(inputPoint)) {
                    continue;
                }

                const viewPoint = mapPoint(inputPoint);
                const point = App.toCanvasCoords(viewPoint[0], viewPoint[1]);

                if (point.cx <= 0 || point.cx >= DOM.canvas.width || point.cy <= 0 || point.cy >= DOM.canvas.height) {
                    continue;
                }

                const delta = Math.max(Math.abs(value) * 1e-3, tickStep * 0.01);
                const nextInputPoint = axis === 'X' ? [value + delta, 0] : [0, value + delta];
                const nextViewPoint = mapPoint(nextInputPoint);
                const nextPoint = App.toCanvasCoords(nextViewPoint[0], nextViewPoint[1]);
                let tangentX = nextPoint.cx - point.cx;
                let tangentY = nextPoint.cy - point.cy;
                const tangentLength = Math.hypot(tangentX, tangentY) || 1;
                tangentX /= tangentLength;
                tangentY /= tangentLength;

                let normalX = -tangentY;
                let normalY = tangentX;
                if (axis === 'X') {
                    if (normalY < 0) {
                        normalX = -normalX;
                        normalY = -normalY;
                    }
                } else if (normalX > 0) {
                    normalX = -normalX;
                    normalY = -normalY;
                }

                context.beginPath();
                context.moveTo(point.cx - normalX * tickLength, point.cy - normalY * tickLength);
                context.lineTo(point.cx + normalX * tickLength, point.cy + normalY * tickLength);
                context.strokeStyle = color;
                context.lineWidth = 1;
                context.stroke();

                const distanceFromOrigin = Math.hypot(
                    point.cx - originCanvasCoords.cx,
                    point.cy - originCanvasCoords.cy
                );

                if (distanceFromOrigin > minDistanceForLabel) {
                    context.fillText(
                        MathCore.formatTickLabel(value, tickStep),
                        point.cx + normalX * labelOffset,
                        point.cy + normalY * labelOffset
                    );
                }
            }
        };

        drawAxisTicks('X', tickStep, bounds.minX, bounds.maxX);
        drawAxisTicks('Y', tickStep, bounds.minY, bounds.maxY);
    };

    App.drawSaturationBand = function (context, viewTransformMatrix, activationName, activationIndex = Visuo.State.matrixCascade.length) {
        const limits = Activation.getOutputLimits(activationName);

        if (!limits || !isFinite(limits.min) || !isFinite(limits.max)) {
            return;
        }

        const renderScope = MathCore.clamp(State.renderScope ?? Config.DEFAULT_RENDER_SCOPE, 0, 1);
        const corners = [
            [limits.min, limits.min],
            [limits.max, limits.min],
            [limits.max, limits.max],
            [limits.min, limits.max]
        ];
        const points = [];
        const samplesPerEdge = Math.max(4, Math.round(6 + renderScope * 26));

        const mapPoint = point => {
            const worldPoint = App.transformPointThroughLayersFrom(point, activationIndex + 1);
            const viewPoint = MathCore.multiplyMatrixVector(viewTransformMatrix, worldPoint);
            return App.toCanvasCoords(viewPoint[0], viewPoint[1]);
        };

        corners.forEach((corner, index) => {
            const nextCorner = corners[(index + 1) % corners.length];

            for (let sample = 0; sample < samplesPerEdge; sample++) {
                const t = sample / samplesPerEdge;
                points.push(mapPoint([
                    corner[0] + (nextCorner[0] - corner[0]) * t,
                    corner[1] + (nextCorner[1] - corner[1]) * t
                ]));
            }
        });

        const passes = [
            { color: 'rgba(248, 113, 113, 0.05)', width: 12 },
            { color: 'rgba(248, 113, 113, 0.12)', width: 6 },
            { color: 'rgba(254, 202, 202, 0.55)', width: 1.4 }
        ];

        context.save();
        context.lineJoin = 'round';

        passes.forEach(pass => {
            context.beginPath();
            points.forEach((point, index) => {
                if (index === 0) {
                    context.moveTo(point.cx, point.cy);
                } else {
                    context.lineTo(point.cx, point.cy);
                }
            });
            context.closePath();
            context.strokeStyle = pass.color;
            context.lineWidth = pass.width;
            context.stroke();
        });

        context.restore();
    };

    App.drawCausticFold = function (context, viewTransformMatrix, activationIndex = Visuo.State.matrixCascade.length) {
        const reach = Math.hypot(DOM.canvas.width, DOM.canvas.height) / Math.max(State.scale, 1e-6);
        const renderScope = MathCore.clamp(State.renderScope ?? Config.DEFAULT_RENDER_SCOPE, 0, 1);
        const samples = Math.max(8, Math.round(8 + renderScope * 40));
        const passes = [
            { color: 'rgba(251, 146, 60, 0.08)', width: 14 },
            { color: 'rgba(251, 146, 60, 0.22)', width: 6 },
            { color: 'rgba(255, 237, 213, 0.92)', width: 1.5 }
        ];

        const mapPoint = point => {
            const worldPoint = App.transformPointThroughLayersFrom(point, activationIndex + 1);
            const viewPoint = MathCore.multiplyMatrixVector(viewTransformMatrix, worldPoint);
            return App.toCanvasCoords(viewPoint[0], viewPoint[1]);
        };

        context.save();
        context.lineCap = 'round';

        [[reach, 0], [0, reach]].forEach(axisEnd => {
            passes.forEach(pass => {
                context.beginPath();

                for (let sample = 0; sample <= samples; sample++) {
                    const t = sample / samples;
                    const point = mapPoint([axisEnd[0] * t, axisEnd[1] * t]);

                    if (sample === 0) {
                        context.moveTo(point.cx, point.cy);
                    } else {
                        context.lineTo(point.cx, point.cy);
                    }
                }

                context.strokeStyle = pass.color;
                context.lineWidth = pass.width;
                context.stroke();
            });
        });

        context.restore();
    };

    App.drawProjectionLines = function (context, vector, color) {
        context.strokeStyle = color;
        context.lineWidth = 1.5;
        context.setLineDash([5, 5]);

        const endPoint = App.toCanvasCoords(vector[0], vector[1]);
        const projXPoint = App.toCanvasCoords(vector[0], 0);
        const projYPoint = App.toCanvasCoords(0, vector[1]);

        context.beginPath();
        context.moveTo(endPoint.cx, endPoint.cy);
        context.lineTo(projXPoint.cx, endPoint.cy);
        context.stroke();

        context.beginPath();
        context.moveTo(endPoint.cx, endPoint.cy);
        context.lineTo(endPoint.cx, projYPoint.cy);
        context.stroke();

        context.setLineDash([]);
    };

    App.isNearCanvasPoint = function (mouseCx, mouseCy, targetCanvasCoords, pixelThreshold) {
        const dx = mouseCx - targetCanvasCoords.cx;
        const dy = mouseCy - targetCanvasCoords.cy;
        return Math.sqrt(dx * dx + dy * dy) < pixelThreshold;
    };

    App.drawOriginDot = function (context, color, point = [0, 0]) {
        const originCanvas = App.toCanvasCoords(point[0], point[1]);
        context.beginPath();
        context.arc(originCanvas.cx, originCanvas.cy, 5, 0, Math.PI * 2);
        context.fillStyle = color;
        context.fill();
        context.closePath();
    };

    App.drawDatasetPoints = function (context, mapPoint) {
        const dataset = State.dataset;
        if (!dataset || !dataset.loaded || !Array.isArray(dataset.plotPoints) || dataset.plotPoints.length === 0) {
            return;
        }

        dataset.plotPoints.forEach(item => {
            const viewPoint = mapPoint(item.point);
            const canvasPoint = App.toCanvasCoords(viewPoint[0], viewPoint[1]);
            if (!Number.isFinite(canvasPoint.cx) || !Number.isFinite(canvasPoint.cy)) {
                return;
            }

            const color = dataset.classColors[item.classIndex]
                || Config.DEFAULT_CLASS_COLORS[item.classIndex]
                || Config.DEFAULT_CLASS_COLORS[0];

            context.save();
            context.beginPath();
            context.arc(canvasPoint.cx, canvasPoint.cy, 5.5, 0, Math.PI * 2);
            context.fillStyle = color;
            context.globalAlpha = 0.95;
            context.fill();
            context.lineWidth = 1.5;
            context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            context.stroke();
            context.restore();
        });
    };

    App.drawScene = function () {
        const context = DOM.ctx;
        context.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);

        const cumulativeMatrix = App.computeCumulativeMatrix();
        const viewTransformMatrix = App.getViewTransformMatrix();
        const tracePreview = typeof App.getPointTracePreview === 'function'
            ? App.getPointTracePreview()
            : null;
        const previewMap = tracePreview ? tracePreview.map : App.transformPointThroughCascade;

        const iHat = [1, 0];
        const jHat = [0, 1];

        const iHatView = MathCore.multiplyMatrixVector(viewTransformMatrix, iHat);
        const jHatView = MathCore.multiplyMatrixVector(viewTransformMatrix, jHat);
        const transformedIHatGlobal = previewMap([1, 0]);
        const transformedJHatGlobal = previewMap([0, 1]);
        const transformedOriginGlobal = previewMap([0, 0]);
        const transformedIHatView = MathCore.multiplyMatrixVector(viewTransformMatrix, transformedIHatGlobal);
        const transformedJHatView = MathCore.multiplyMatrixVector(viewTransformMatrix, transformedJHatGlobal);
        const transformedOriginView = MathCore.multiplyMatrixVector(viewTransformMatrix, transformedOriginGlobal);

        const originalMap = point => MathCore.multiplyMatrixVector(viewTransformMatrix, point);
        const originalBounds = App.getVisibleBounds(viewTransformMatrix);
        const transformedMap = point => {
            const transformed = previewMap(point);
            return MathCore.multiplyMatrixVector(viewTransformMatrix, transformed);
        };
        const finalTransformedBounds = App.getActiveVisibleBounds(cumulativeMatrix, viewTransformMatrix);
        const transformedBounds = tracePreview
            ? mergeBounds(originalBounds, finalTransformedBounds)
            : finalTransformedBounds;
        const viewMap = point => MathCore.multiplyMatrixVector(viewTransformMatrix, point);
        const drawDataset = (context, mapPoint, space) => {
            const drawnByLab = typeof App.drawLabDatasetPoints === 'function'
                && App.drawLabDatasetPoints(context, mapPoint, space, viewMap);
            if (!drawnByLab) {
                App.drawDatasetPoints(context, mapPoint);
            }
        };

        const isNonlinear = App.hasNonlinearActivation();
        const lastNonlinearActivation = App.getLastNonlinearActivationName();
        const lastNonlinearLayer = App.getLastNonlinearActivationLayer();
        const lastNonlinearIndex = lastNonlinearLayer
            ? State.matrixCascade.indexOf(lastNonlinearLayer)
            : State.matrixCascade.length;
        const modulateGrid = !tracePreview && isNonlinear && lastNonlinearActivation !== 'relu';
        const adaptiveTransformedRender = tracePreview
            ? isNonlinear || tracePreview.stage.kind === 'activation'
            : isNonlinear;

        if (DOM.showOriginalCheckbox.checked) {
            App.drawGrid(context, {
                grid: 'rgba(29, 78, 216, 0.45)',
                gridWidth: State.originalGridThickness
            }, originalMap, originalBounds, {
                sampleCount: 1,
                density: State.originalGridDensity,
                renderScope: State.renderScope
            });
            App.drawAxes(context, '#60a5fa', getAxisWidth(2, State.originalGridThickness), originalMap, originalBounds, true, {
                sampleCount: 1,
                renderScope: State.renderScope
            });
            App.drawTicksAndLabels(context, '#60a5fa', originalMap, originalBounds);
            App.drawVector(context, iHatView, '#3b82f6', 4, 'X');
            App.drawVector(context, jHatView, '#3b82f6', 4, 'Y');

            if (State.hoveredVector === 'X') {
                App.drawProjectionLines(context, iHatView, '#3b82f6');
            } else if (State.hoveredVector === 'Y') {
                App.drawProjectionLines(context, jHatView, '#3b82f6');
            }

            drawDataset(context, originalMap, 'original');
        }

        if (DOM.showTransformedCheckbox.checked) {
            App.drawGrid(context, {
                grid: 'rgba(185, 28, 28, 0.55)',
                gridWidth: State.transformedGridThickness
            }, transformedMap, transformedBounds, {
                activationName: lastNonlinearActivation,
                adaptive: adaptiveTransformedRender,
                modulate: modulateGrid,
                density: State.transformedGridDensity,
                renderScope: State.renderScope,
                getDeterminant: point => App.getCascadeJacobianDeterminant(point)
            });

            if (!tracePreview) {
                if (lastNonlinearActivation === 'relu') {
                    App.drawCausticFold(context, viewTransformMatrix, lastNonlinearIndex);
                } else if (lastNonlinearActivation !== 'linear') {
                    App.drawSaturationBand(context, viewTransformMatrix, lastNonlinearActivation, lastNonlinearIndex);
                }
            }

            App.drawAxes(context, '#f87171', getAxisWidth(1.5, State.transformedGridThickness), transformedMap, transformedBounds, false, {
                adaptive: adaptiveTransformedRender,
                renderScope: State.renderScope
            });
            App.drawTicksAndLabels(context, '#f87171', transformedMap, transformedBounds);
            App.drawVector(context, transformedIHatView, '#dc2626', 4, 'X1', transformedOriginView);
            App.drawVector(context, transformedJHatView, '#dc2626', 4, 'X2', transformedOriginView);

            if (!isNonlinear && State.hoveredVector === 'X1') {
                App.drawProjectionLines(context, transformedIHatView, '#dc2626');
            } else if (!isNonlinear && State.hoveredVector === 'X2') {
                App.drawProjectionLines(context, transformedJHatView, '#dc2626');
            }

            drawDataset(context, transformedMap, 'transformed');
        }

        let customVectorInOriginalBasis = null;
        let customVectorInOriginalBasisView = null;

        if (DOM.transformModeToggle && State.transformModeActive && DOM.customVectorXInput && DOM.customVectorYInput) {
            const customVecInTransformedBasis = [
                parseFloat(DOM.customVectorXInput.value) || 0,
                parseFloat(DOM.customVectorYInput.value) || 0
            ];

            customVectorInOriginalBasis = App.transformPointThroughCascade(customVecInTransformedBasis);
            customVectorInOriginalBasisView = MathCore.multiplyMatrixVector(viewTransformMatrix, customVectorInOriginalBasis);

            App.drawVector(context, customVectorInOriginalBasisView, '#8b5cf6', 4, null, transformedOriginView);
        }

        let hoveredVectorDetails = null;

        if (State.hoveredVector === 'X' && DOM.showOriginalCheckbox.checked) {
            hoveredVectorDetails = { label: 'X', color: 'text-blue-600', view: iHatView, basisVector: iHat };
        } else if (State.hoveredVector === 'Y' && DOM.showOriginalCheckbox.checked) {
            hoveredVectorDetails = { label: 'Y', color: 'text-blue-600', view: jHatView, basisVector: jHat };
        } else if (State.hoveredVector === 'X1' && DOM.showTransformedCheckbox.checked) {
            hoveredVectorDetails = { label: 'X1', color: 'text-red-600', view: transformedIHatView, basisVector: transformedIHatGlobal };
        } else if (State.hoveredVector === 'X2' && DOM.showTransformedCheckbox.checked) {
            hoveredVectorDetails = { label: 'X2', color: 'text-red-600', view: transformedJHatView, basisVector: transformedJHatGlobal };
        } else if (State.hoveredVector === 'custom' && DOM.transformModeToggle && State.transformModeActive && customVectorInOriginalBasisView) {
            hoveredVectorDetails = { label: 'Custom', color: 'text-purple-600', view: customVectorInOriginalBasisView, basisVector: customVectorInOriginalBasis };
        }

        if (hoveredVectorDetails) {
            const endPointCanvas = App.toCanvasCoords(hoveredVectorDetails.view[0], hoveredVectorDetails.view[1]);
            App.showVectorInfoBox(
                App.buildVectorInfoMarkup(hoveredVectorDetails.label, hoveredVectorDetails.color, hoveredVectorDetails.basisVector, cumulativeMatrix),
                endPointCanvas.cx + 10,
                endPointCanvas.cy + 10
            );
        } else if (State.selectedPointInfo) {
            App.showVectorInfoBox(
                State.selectedPointInfo.html,
                State.selectedPointInfo.x,
                State.selectedPointInfo.y
            );
        } else {
            App.hideVectorInfoBox();
        }

        if (DOM.showTransformedCheckbox.checked && (isNonlinear || tracePreview)) {
            App.drawOriginDot(context, '#dc2626', transformedOriginView);
        }
        App.drawOriginDot(context, '#000000');

        if (typeof App.drawPointTrace === 'function') {
            App.drawPointTrace(context, viewTransformMatrix);
        }
    };
})(window);
