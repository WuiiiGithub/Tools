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
                App.setCascadeActivation(act);
            });
        });

        if (DOM.settingsToggleBtn && DOM.settingsPanel) {
            DOM.settingsToggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = DOM.settingsPanel.classList.contains('hidden');
                DOM.settingsPanel.classList.toggle('hidden', !isHidden);
                DOM.settingsToggleBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
            });

            if (DOM.closeSettingsBtn) {
                DOM.closeSettingsBtn.addEventListener('click', () => {
                    DOM.settingsPanel.classList.add('hidden');
                    DOM.settingsToggleBtn.setAttribute('aria-expanded', 'false');
                });
            }

            document.addEventListener('click', (e) => {
                if (!DOM.settingsPanel.contains(e.target) && !DOM.settingsToggleBtn.contains(e.target)) {
                    DOM.settingsPanel.classList.add('hidden');
                    DOM.settingsToggleBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        if (DOM.clearCascadeActivationBtn) {
            DOM.clearCascadeActivationBtn.addEventListener('click', () => {
                App.setCascadeActivation('linear');
            });
        }

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
                    App.setCascadeActivation(act);
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
            if (e.key === 'Escape' && !DOM.controlsDrawer.inert) {
                App.closeControlsDrawer();
            }
        });

        if (typeof DOM.mobileMediaQuery.addEventListener === 'function') {
            DOM.mobileMediaQuery.addEventListener('change', App.syncMobileRestriction);
        } else {
            DOM.mobileMediaQuery.addListener(App.syncMobileRestriction);
        }
        App.syncMobileRestriction();

        DOM.matrixCascadePills.addEventListener('dragstart', (e) => {
            const targetPill = e.target.closest('.matrix-pill');
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
                return;
            }

            e.dataTransfer.dropEffect = 'move';
            const targetPill = e.target.closest('.matrix-pill');
            if (targetPill && targetPill !== State.draggedItem) {
                DOM.matrixCascadePills.querySelectorAll('.matrix-pill').forEach(pill => {
                    pill.classList.remove('drag-over');
                });
                targetPill.classList.add('drag-over');
            }
        });

        DOM.matrixCascadePills.addEventListener('dragenter', (e) => {
            e.preventDefault();
        });

        DOM.matrixCascadePills.addEventListener('dragleave', (e) => {
            const targetPill = e.target.closest('.matrix-pill');
            if (targetPill) {
                targetPill.classList.remove('drag-over');
            }
        });

        DOM.matrixCascadePills.addEventListener('drop', (e) => {
            e.preventDefault();
            DOM.matrixCascadePills.querySelectorAll('.matrix-pill').forEach(pill => {
                pill.classList.remove('drag-over', 'ring-2', 'ring-emerald-500', 'bg-emerald-50');
            });

            const act = e.dataTransfer.getData('text/activation') || State.draggedActivation;
            const targetPill = e.target.closest('.matrix-pill');

            if (act) {
                App.setCascadeActivation(act);
                return;
            }

            const draggedId = e.dataTransfer.getData('text/plain');
            const targetId = targetPill ? targetPill.dataset.id : null;

            if (draggedId && targetId && draggedId !== targetId) {
                const draggedIndex = State.matrixCascade.findIndex(matrix => matrix.id === draggedId);
                const targetIndex = State.matrixCascade.findIndex(matrix => matrix.id === targetId);

                if (draggedIndex !== -1 && targetIndex !== -1) {
                    const [removed] = State.matrixCascade.splice(draggedIndex, 1);
                    State.matrixCascade.splice(targetIndex, 0, removed);
                    App.renderMatrixCascade();
                    App.fitViewToScene();
                    App.drawScene();
                }
            }
        });

        DOM.matrixCascadePills.addEventListener('dragend', () => {
            if (State.draggedItem) {
                State.draggedItem.classList.remove('dragging');
                State.draggedItem = null;
            }
            DOM.matrixCascadePills.querySelectorAll('.matrix-pill').forEach(pill => {
                pill.classList.remove('drag-over');
            });
        });

        if (DOM.cascadeActivationSlot) {
            DOM.cascadeActivationSlot.addEventListener('dragover', (e) => {
                if (State.draggedActivation || (e.dataTransfer && e.dataTransfer.types.includes('text/activation'))) {
                    e.preventDefault();
                    DOM.cascadeActivationSlot.classList.add('ring-2', 'ring-emerald-500', 'bg-emerald-100');
                }
            });
            DOM.cascadeActivationSlot.addEventListener('dragleave', () => {
                DOM.cascadeActivationSlot.classList.remove('ring-2', 'ring-emerald-500', 'bg-emerald-100');
            });
            DOM.cascadeActivationSlot.addEventListener('drop', (e) => {
                const act = e.dataTransfer.getData('text/activation') || State.draggedActivation;
                if (act) {
                    e.preventDefault();
                    DOM.cascadeActivationSlot.classList.remove('ring-2', 'ring-emerald-500', 'bg-emerald-100');
                    App.setCascadeActivation(act);
                }
            });
        }
    };
})(window);
