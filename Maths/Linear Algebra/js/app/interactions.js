(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config, Math: MathCore } = Visuo;

    App.initInteractions = function () {
        DOM.actionButton.addEventListener('click', App.addMatrix);
        DOM.cancelEditButton.addEventListener('click', App.resetEditor);
        DOM.computeInverseBtn.addEventListener('click', App.computeAndDisplayInverse);

        DOM.showOriginalCheckbox.addEventListener('change', App.drawScene);
        DOM.showTransformedCheckbox.addEventListener('change', App.drawScene);

        DOM.perspectiveToggleBtn.addEventListener('click', () => {
            State.perspectiveMode = State.perspectiveMode === 'original' ? 'transformed' : 'original';
            App.applyPerspectiveButtonStyle();
            App.drawScene();
        });

        if (DOM.transformModeToggle) {
            DOM.transformModeToggle.addEventListener('change', (e) => {
                State.transformModeActive = e.target.checked;
                if (DOM.customVectorInputs) {
                    DOM.customVectorInputs.classList.toggle('hidden', !State.transformModeActive);
                    DOM.customVectorInputs.classList.toggle('flex', State.transformModeActive);
                }
                App.drawScene();
            });
        }
        if (DOM.customVectorXInput) {
            DOM.customVectorXInput.addEventListener('input', App.drawScene);
        }
        if (DOM.customVectorYInput) {
            DOM.customVectorYInput.addEventListener('input', App.drawScene);
        }

        const activationDraggables = document.querySelectorAll('.activation-draggable');
        activationDraggables.forEach(chip => {
            chip.addEventListener('dragstart', (e) => {
                const act = chip.dataset.activation;
                State.draggedActivation = act;
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/activation', act);
                e.dataTransfer.setData('text/plain', act);
                chip.classList.add('opacity-50');
            });

            chip.addEventListener('dragend', () => {
                chip.classList.remove('opacity-50');
                State.draggedActivation = null;
            });

            chip.addEventListener('click', () => {
                const act = chip.dataset.activation;
                App.addActivationLayer(act, State.matrixCascade.length);
            });
        });

        if (DOM.settingsToggleBtn && DOM.settingsModal) {
            DOM.settingsToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                App.toggleSettingsModal();
            });

            if (DOM.closeSettingsBtn) {
                DOM.closeSettingsBtn.addEventListener('click', App.closeSettingsModal);
            }
            if (DOM.doneSettingsBtn) {
                DOM.doneSettingsBtn.addEventListener('click', App.closeSettingsModal);
            }
            if (DOM.settingsBackdrop) {
                DOM.settingsBackdrop.addEventListener('click', App.closeSettingsModal);
            }
        }

        if (DOM.settingsTabButtons) {
            DOM.settingsTabButtons.forEach(button => {
                button.addEventListener('click', () => {
                    App.setSettingsTab(button.dataset.settingsTab);
                });
            });
        }

        const gridThicknessControls = [
            {
                slider: DOM.originalGridThicknessSlider,
                valueLabel: DOM.originalGridThicknessValue,
                stateKey: 'originalGridThickness'
            },
            {
                slider: DOM.transformedGridThicknessSlider,
                valueLabel: DOM.transformedGridThicknessValue,
                stateKey: 'transformedGridThickness'
            }
        ];

        gridThicknessControls.forEach(({ slider, valueLabel, stateKey }) => {
            if (!slider) {
                return;
            }

            const initialValue = parseFloat(slider.value);
            if (Number.isFinite(initialValue)) {
                State[stateKey] = MathCore.clamp(initialValue, Config.MIN_GRID_THICKNESS, Config.MAX_GRID_THICKNESS);
            }
            if (valueLabel) {
                valueLabel.textContent = State[stateKey].toFixed(1);
            }

            slider.addEventListener('input', () => {
                const nextValue = parseFloat(slider.value);
                if (!Number.isFinite(nextValue)) {
                    return;
                }

                State[stateKey] = MathCore.clamp(nextValue, Config.MIN_GRID_THICKNESS, Config.MAX_GRID_THICKNESS);
                if (valueLabel) {
                    valueLabel.textContent = State[stateKey].toFixed(1);
                }
                App.drawScene();
            });
        });

        const gridDensityControls = [
            {
                slider: DOM.originalGridDensitySlider,
                valueLabel: DOM.originalGridDensityValue,
                stateKey: 'originalGridDensity'
            },
            {
                slider: DOM.transformedGridDensitySlider,
                valueLabel: DOM.transformedGridDensityValue,
                stateKey: 'transformedGridDensity'
            }
        ];

        gridDensityControls.forEach(({ slider, valueLabel, stateKey }) => {
            if (!slider) {
                return;
            }

            const initialValue = parseFloat(slider.value);
            if (Number.isFinite(initialValue)) {
                State[stateKey] = MathCore.clamp(initialValue, Config.MIN_GRID_DENSITY, Config.MAX_GRID_DENSITY);
            }
            if (valueLabel) {
                valueLabel.textContent = `${State[stateKey].toFixed(1)}×`;
            }

            slider.addEventListener('input', () => {
                const nextValue = parseFloat(slider.value);
                if (!Number.isFinite(nextValue)) {
                    return;
                }

                State[stateKey] = MathCore.clamp(nextValue, Config.MIN_GRID_DENSITY, Config.MAX_GRID_DENSITY);
                if (valueLabel) {
                    valueLabel.textContent = `${State[stateKey].toFixed(1)}×`;
                }
                App.drawScene();
            });
        });

        if (DOM.renderScopeSlider) {
            const initialScope = parseFloat(DOM.renderScopeSlider.value);
            if (Number.isFinite(initialScope)) {
                State.renderScope = MathCore.clamp(initialScope, 0, 1);
            }
            if (DOM.renderScopeValue) {
                DOM.renderScopeValue.textContent = `${Math.round(State.renderScope * 100)}%`;
            }

            DOM.renderScopeSlider.addEventListener('input', () => {
                const nextScope = parseFloat(DOM.renderScopeSlider.value);
                if (!Number.isFinite(nextScope)) {
                    return;
                }

                State.renderScope = MathCore.clamp(nextScope, 0, 1);
                if (DOM.renderScopeValue) {
                    DOM.renderScopeValue.textContent = `${Math.round(State.renderScope * 100)}%`;
                }
                App.drawScene();
            });
        }

        const fontSizeControls = [
            {
                slider: DOM.tickFontSizeSlider,
                valueLabel: DOM.tickFontSizeValue,
                stateKey: 'tickFontSize'
            },
            {
                slider: DOM.axisFontSizeSlider,
                valueLabel: DOM.axisFontSizeValue,
                stateKey: 'axisFontSize'
            },
            {
                slider: DOM.vectorFontSizeSlider,
                valueLabel: DOM.vectorFontSizeValue,
                stateKey: 'vectorFontSize'
            }
        ];

        fontSizeControls.forEach(({ slider, valueLabel, stateKey }) => {
            if (!slider) {
                return;
            }

            const initialValue = parseFloat(slider.value);
            if (Number.isFinite(initialValue)) {
                State[stateKey] = MathCore.clamp(initialValue, Config.MIN_FONT_SIZE, Config.MAX_FONT_SIZE);
            }
            if (valueLabel) {
                valueLabel.textContent = `${Math.round(State[stateKey])}px`;
            }

            slider.addEventListener('input', () => {
                const nextValue = parseFloat(slider.value);
                if (!Number.isFinite(nextValue)) {
                    return;
                }

                State[stateKey] = MathCore.clamp(nextValue, Config.MIN_FONT_SIZE, Config.MAX_FONT_SIZE);
                if (valueLabel) {
                    valueLabel.textContent = `${Math.round(State[stateKey])}px`;
                }
                App.drawScene();
            });
        });

        const editorSection = DOM.m00Input ? DOM.m00Input.closest('section') : null;
        if (editorSection) {
            editorSection.addEventListener('dragover', (e) => {
                if (State.draggedActivation || (e.dataTransfer && e.dataTransfer.types.includes('text/activation'))) {
                    e.preventDefault();
                    editorSection.classList.add('ring-2', 'ring-emerald-500');
                }
            });
            editorSection.addEventListener('dragleave', () => {
                editorSection.classList.remove('ring-2', 'ring-emerald-500');
            });
            editorSection.addEventListener('drop', (e) => {
                const act = e.dataTransfer.getData('text/activation') || State.draggedActivation;
                if (act) {
                    e.preventDefault();
                    editorSection.classList.remove('ring-2', 'ring-emerald-500');
                    App.addActivationLayer(act, State.matrixCascade.length);
                }
            });
        }

        DOM.canvas.addEventListener('mousedown', (e) => {
            State.isDragging = true;
            DOM.canvas.classList.remove('cursor-grab');
            DOM.canvas.classList.add('cursor-grabbing');
            State.lastMouseX = e.clientX;
            State.lastMouseY = e.clientY;
        });

        DOM.canvas.addEventListener('mousemove', (e) => {
            if (State.isDragging) {
                const deltaX = e.clientX - State.lastMouseX;
                const deltaY = e.clientY - State.lastMouseY;
                State.offsetX += deltaX;
                State.offsetY += deltaY;
                State.lastMouseX = e.clientX;
                State.lastMouseY = e.clientY;
            } else {
                const mouseCanvasX = e.clientX - DOM.canvas.getBoundingClientRect().left;
                const mouseCanvasY = e.clientY - DOM.canvas.getBoundingClientRect().top;
                let newHoveredVector = null;

                let hoverViewTransformMatrix = [
                    [1, 0],
                    [0, 1]
                ];

                const transformedOriginGlobalForHover = App.transformPointThroughCascade([0, 0]);
                const transformedIHatGlobalForHover = App.transformPointThroughCascade([1, 0]);
                const transformedJHatGlobal = App.transformPointThroughCascade([0, 1]);
                const transformedIHatGlobal = transformedIHatGlobalForHover;

                if (State.perspectiveMode === 'transformed') {
                    const deltaX = transformedIHatGlobalForHover[0] - transformedOriginGlobalForHover[0];
                    const deltaY = transformedIHatGlobalForHover[1] - transformedOriginGlobalForHover[1];
                    const angleOfTransformedIHat = Math.atan2(deltaY, deltaX);
                    const cosTheta = Math.cos(-angleOfTransformedIHat);
                    const sinTheta = Math.sin(-angleOfTransformedIHat);
                    hoverViewTransformMatrix = [
                        [cosTheta, -sinTheta],
                        [sinTheta, cosTheta]
                    ];
                }

                const iHat = [1, 0];
                const jHat = [0, 1];

                const iHatHover = MathCore.multiplyMatrixVector(hoverViewTransformMatrix, iHat);
                const jHatHover = MathCore.multiplyMatrixVector(hoverViewTransformMatrix, jHat);
                const transformedIHatHover = MathCore.multiplyMatrixVector(hoverViewTransformMatrix, transformedIHatGlobal);
                const transformedJHatHover = MathCore.multiplyMatrixVector(hoverViewTransformMatrix, transformedJHatGlobal);

                const hoverThresholdPixels = 20;

                if (DOM.showOriginalCheckbox.checked) {
                    const endIHatCanvas = App.toCanvasCoords(iHatHover[0], iHatHover[1]);
                    const endJHatCanvas = App.toCanvasCoords(jHatHover[0], jHatHover[1]);
                    if (App.isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endIHatCanvas, hoverThresholdPixels)) {
                        newHoveredVector = 'X';
                    } else if (App.isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endJHatCanvas, hoverThresholdPixels)) {
                        newHoveredVector = 'Y';
                    }
                }
                if (DOM.showTransformedCheckbox.checked && newHoveredVector === null) {
                    const endTransformedIHatCanvas = App.toCanvasCoords(transformedIHatHover[0], transformedIHatHover[1]);
                    const endTransformedJHatCanvas = App.toCanvasCoords(transformedJHatHover[0], transformedJHatHover[1]);
                    if (App.isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endTransformedIHatCanvas, hoverThresholdPixels)) {
                        newHoveredVector = 'X1';
                    } else if (App.isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endTransformedJHatCanvas, hoverThresholdPixels)) {
                        newHoveredVector = 'X2';
                    }
                }
                if (DOM.transformModeToggle && State.transformModeActive && newHoveredVector === null && DOM.customVectorXInput && DOM.customVectorYInput) {
                    const customVec = [
                        parseFloat(DOM.customVectorXInput.value) || 0,
                        parseFloat(DOM.customVectorYInput.value) || 0
                    ];
                    const customGlobal = App.transformPointThroughCascade(customVec);
                    const customHover = MathCore.multiplyMatrixVector(hoverViewTransformMatrix, customGlobal);
                    const endCustomCanvas = App.toCanvasCoords(customHover[0], customHover[1]);
                    if (App.isNearCanvasPoint(mouseCanvasX, mouseCanvasY, endCustomCanvas, hoverThresholdPixels)) {
                        newHoveredVector = 'custom';
                    }
                }

                State.hoveredVector = newHoveredVector;
            }

            App.drawScene();
        });

        DOM.canvas.addEventListener('mouseup', () => {
            State.isDragging = false;
            DOM.canvas.classList.remove('cursor-grabbing');
            DOM.canvas.classList.add('cursor-grab');
        });

        DOM.canvas.addEventListener('mouseleave', () => {
            State.isDragging = false;
            DOM.canvas.classList.remove('cursor-grabbing');
            DOM.canvas.classList.add('cursor-grab');
            if (State.hoveredVector !== null) {
                State.hoveredVector = null;
                App.drawScene();
            }
        });

        DOM.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();

            const mouseX = e.clientX - DOM.canvas.getBoundingClientRect().left;
            const mouseY = e.clientY - DOM.canvas.getBoundingClientRect().top;

            const mouseCartesianX = (mouseX - State.centerX - State.offsetX) / State.scale;
            const mouseCartesianY = (State.centerY - mouseY + State.offsetY) / State.scale;

            const zoomFactor = 1.1;
            let newScale = State.scale;

            if (e.deltaY < 0) {
                newScale *= zoomFactor;
            } else {
                newScale /= zoomFactor;
            }

            newScale = MathCore.clamp(newScale, Config.MIN_SCALE, Config.MAX_SCALE);

            State.offsetX = mouseX - mouseCartesianX * newScale - State.centerX;
            State.offsetY = mouseY - (State.centerY - mouseCartesianY * newScale);
            State.scale = newScale;
            App.drawScene();
        });

        DOM.toggleControlsBtn.addEventListener('click', App.toggleControlsDrawer);
        DOM.closeControlsBtn.addEventListener('click', App.closeControlsDrawer);
        DOM.doneControlsBtn.addEventListener('click', App.closeControlsDrawer);
        DOM.controlsBackdrop.addEventListener('click', App.closeControlsDrawer);

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') {
                return;
            }

            if (DOM.pointTraceModal && !DOM.pointTraceModal.classList.contains('hidden')) {
                App.closePointTrace();
                return;
            }

            if (DOM.settingsModal && !DOM.settingsModal.classList.contains('hidden')) {
                App.closeSettingsModal();
                return;
            }

            if (!DOM.controlsDrawer.inert) {
                App.closeControlsDrawer();
            }
        });

        if (typeof DOM.mobileMediaQuery.addEventListener === 'function') {
            DOM.mobileMediaQuery.addEventListener('change', App.syncMobileRestriction);
        } else {
            DOM.mobileMediaQuery.addListener(App.syncMobileRestriction);
        }
        App.syncMobileRestriction();

        const clearDropHighlights = () => {
            DOM.matrixCascadePills.querySelectorAll('.cascade-pill').forEach(pill => {
                pill.classList.remove('drag-over', 'activation-drop-target');
            });
        };

        DOM.matrixCascadePills.addEventListener('dragstart', (e) => {
            const targetPill = e.target.closest('.cascade-pill');
            if (targetPill) {
                State.draggedItem = targetPill;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', State.draggedItem.dataset.id);
                setTimeout(() => {
                    State.draggedItem.classList.add('dragging');
                }, 0);
            }
        });

        DOM.matrixCascadePills.addEventListener('dragover', (e) => {
            e.preventDefault();
            const act = State.draggedActivation || (e.dataTransfer && e.dataTransfer.types.includes('text/activation'));
            if (act) {
                e.dataTransfer.dropEffect = 'copy';
                const targetPill = e.target.closest('.cascade-pill');
                DOM.matrixCascadePills.querySelectorAll('.cascade-pill').forEach(pill => {
                    pill.classList.remove('activation-drop-target');
                });
                if (targetPill) {
                    targetPill.classList.add('activation-drop-target');
                }
                return;
            }

            e.dataTransfer.dropEffect = 'move';
            const targetPill = e.target.closest('.cascade-pill');
            if (targetPill && targetPill !== State.draggedItem) {
                DOM.matrixCascadePills.querySelectorAll('.cascade-pill').forEach(pill => {
                    pill.classList.remove('drag-over');
                });
                targetPill.classList.add('drag-over');
            }
        });

        DOM.matrixCascadePills.addEventListener('dragenter', (e) => {
            e.preventDefault();
        });

        DOM.matrixCascadePills.addEventListener('dragleave', (e) => {
            const targetPill = e.target.closest('.cascade-pill');
            if (targetPill) {
                targetPill.classList.remove('drag-over', 'activation-drop-target');
            }
        });

        DOM.matrixCascadePills.addEventListener('drop', (e) => {
            e.preventDefault();

            const act = e.dataTransfer.getData('text/activation') || State.draggedActivation;
            const targetPill = e.target.closest('.cascade-pill');
            const targetIndex = targetPill
                ? State.matrixCascade.findIndex(layer => layer.id === targetPill.dataset.id)
                : State.matrixCascade.length;

            clearDropHighlights();

            if (act) {
                App.addActivationLayer(act, targetPill ? targetIndex + 1 : State.matrixCascade.length);
                return;
            }

            const draggedId = e.dataTransfer.getData('text/plain');
            if (!draggedId) {
                return;
            }

            if (targetPill && draggedId === targetPill.dataset.id) {
                return;
            }

            const draggedIndex = State.matrixCascade.findIndex(layer => layer.id === draggedId);
            if (draggedIndex === -1) {
                return;
            }

            const [removed] = State.matrixCascade.splice(draggedIndex, 1);

            if (targetPill) {
                const adjustedTargetIndex = State.matrixCascade.findIndex(layer => layer.id === targetPill.dataset.id);
                const insertIndex = adjustedTargetIndex === -1
                    ? State.matrixCascade.length
                    : adjustedTargetIndex + (draggedIndex < targetIndex ? 1 : 0);
                State.matrixCascade.splice(insertIndex, 0, removed);
            } else {
                State.matrixCascade.push(removed);
            }

            App.renderMatrixCascade();
            App.fitViewToScene();
            App.drawScene();
        });

        DOM.matrixCascadePills.addEventListener('dragend', () => {
            if (State.draggedItem) {
                State.draggedItem.classList.remove('dragging');
                State.draggedItem = null;
            }
            clearDropHighlights();
        });

    };
})(window);
