(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Math: MathCore } = Visuo;

    App.renderMatrixCascade = function () {
        DOM.matrixCascadePills.innerHTML = '';

        if (State.matrixCascade.length === 0) {
            DOM.matrixCascadePills.innerHTML = '<p class="text-sm text-gray-500">No weight matrices added yet. Start by defining W₁!</p>';
        }

        State.matrixCascade.forEach((matrix, index) => {
            const pill = document.createElement('div');
            const pillTone = matrix.isInverse
                ? 'border-red-300 bg-pink-50/90 text-red-900'
                : 'border-sky-300 bg-sky-50/90 text-sky-900';
            pill.className = `matrix-pill group relative flex cursor-grab flex-col gap-2 rounded-xl border p-3.5 text-sm shadow-sm transition-all hover:shadow-md ${pillTone}`;
            pill.dataset.id = matrix.id;
            pill.dataset.index = index;
            pill.draggable = true;

            const matrixValues = matrix.values;
            const bias = matrix.bias || [0, 0];
            const editButtonTone = matrix.isInverse
                ? 'bg-orange-400 hover:bg-orange-500'
                : 'bg-blue-500 hover:bg-blue-600';

            pill.innerHTML = `
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <input type="checkbox" class="enable-toggle h-[18px] w-[18px] cursor-pointer accent-emerald-500" data-id="${matrix.id}" ${matrix.enabled ? 'checked' : ''} title="${matrix.enabled ? 'Disable Weight Matrix' : 'Enable Weight Matrix'}">
                        <span class="font-bold text-slate-800">W<sub>${index + 1}</sub>${matrix.isInverse ? ' (Inverse)' : ''}</span>
                    </div>
                    <div class="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button class="duplicate-btn flex items-center justify-center rounded-md bg-blue-500 p-1 text-white hover:bg-blue-600" data-id="${matrix.id}" title="Duplicate Weight Matrix">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M4 1.5H14a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 3.5 12V2a.5.5 0 0 1 .5-.5zM14 2H4v10h10V2z"/>
                                <path d="M2 3.5a.5.5 0 0 1 .5-.5H12a.5.5 0 0 1 .5.5V13a.5.5 0 0 1-.5.5H2.5a.5.5 0 0 1-.5-.5V3.5zM2.5 4H12v9H2.5V4z"/>
                            </svg>
                        </button>
                        <button class="edit-btn flex items-center justify-center rounded-md p-1 text-white ${editButtonTone}" data-id="${matrix.id}" title="Edit Weight Matrix & Bias">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.121l6.04-6.04zm-2.76-3.695L13.19 1.714l-1.01-1.01-.757.757-.707-.707.707-.707 1.01-1.01z"/>
                                <path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5H9a.5.5 0 0 0 0-1H2.5A1.5 1.5 0 0 0 1 2.5v11z"/>
                            </svg>
                        </button>
                        <button class="delete-btn flex items-center justify-center rounded-md bg-red-500 p-1 text-white hover:bg-red-600" data-id="${matrix.id}" title="Delete Weight Matrix">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.5a.5.5 0 0 0 0 1h.5V14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V3.5h.5a.5.5 0 0 0 0-1H11ZM4.5 3h7A.5.5 0 0 1 12 3.5v10.5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V3.5a.5.5 0 0 1 .5-.5Z"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <div class="grid grid-cols-[repeat(2,auto)] gap-x-2.5 gap-y-1 font-mono text-xs font-bold text-slate-700">
                        <span>[${matrixValues[0][0].toFixed(2)}</span><span>${matrixValues[0][1].toFixed(2)}]</span>
                        <span>[${matrixValues[1][0].toFixed(2)}</span><span>${matrixValues[1][1].toFixed(2)}]</span>
                    </div>
                    <div class="h-8 border-r-2 border-dashed border-slate-300"></div>
                    <div class="flex flex-col font-mono text-xs font-bold text-purple-700">
                        <span>+ [${bias[0].toFixed(2)}]</span>
                        <span>  [${bias[1].toFixed(2)}]</span>
                    </div>
                </div>
            `;

            DOM.matrixCascadePills.appendChild(pill);
        });

        App.updateCascadeActivationUI();

        DOM.matrixCascadePills.querySelectorAll('.duplicate-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                App.duplicateMatrix(e.currentTarget.dataset.id);
            });
        });
        DOM.matrixCascadePills.querySelectorAll('.edit-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                App.editMatrix(e.currentTarget.dataset.id);
            });
        });
        DOM.matrixCascadePills.querySelectorAll('.delete-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                App.deleteMatrix(e.currentTarget.dataset.id);
            });
        });
        DOM.matrixCascadePills.querySelectorAll('.enable-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                App.toggleMatrixEnabled(e.currentTarget.dataset.id, e.currentTarget.checked);
            });
        });
    };

    App.updateCascadeActivationUI = function () {
        if (!DOM.cascadeActivationLabel) return;
        const act = State.activeActivationName || 'linear';
        DOM.cascadeActivationLabel.textContent = act.toUpperCase();
        if (DOM.clearCascadeActivationBtn) {
            DOM.clearCascadeActivationBtn.classList.toggle('hidden', act === 'linear');
        }
    };

    App.setCascadeActivation = function (activationName) {
        State.activeActivationName = activationName || 'linear';
        App.updateCascadeActivationUI();
        App.fitViewToScene();
        App.drawScene();
        App.showMessage(`Cascade activation set to ${State.activeActivationName.toUpperCase()}`, 'info');
    };

    App.toggleMatrixEnabled = function (id, enabled) {
        const matrix = State.matrixCascade.find(item => item.id === id);
        if (matrix) {
            matrix.enabled = enabled;
            App.fitViewToScene();
            App.drawScene();
        }
    };

    App.updateEditorInputsFromState = function () {
        App.hideMessage();

        if (State.currentEditorIsInverse) {
            const inverse = MathCore.calculateInverse(State.currentEditorMatrixOriginalValues);
            if (inverse) {
                DOM.m00Input.value = inverse[0][0].toFixed(3);
                DOM.m01Input.value = inverse[0][1].toFixed(3);
                DOM.m10Input.value = inverse[1][0].toFixed(3);
                DOM.m11Input.value = inverse[1][1].toFixed(3);
                if (DOM.bxInput) DOM.bxInput.value = (State.currentEditorBias[0] || 0).toString();
                if (DOM.byInput) DOM.byInput.value = (State.currentEditorBias[1] || 0).toString();
                return;
            }

            State.currentEditorIsInverse = false;
            App.showMessage("Cannot compute inverse: Matrix is singular (determinant is zero or near zero). Displaying original values.", "error");
        }

        DOM.m00Input.value = State.currentEditorMatrixOriginalValues[0][0].toFixed(3);
        DOM.m01Input.value = State.currentEditorMatrixOriginalValues[0][1].toFixed(3);
        DOM.m10Input.value = State.currentEditorMatrixOriginalValues[1][0].toFixed(3);
        DOM.m11Input.value = State.currentEditorMatrixOriginalValues[1][1].toFixed(3);
        if (DOM.bxInput) DOM.bxInput.value = (State.currentEditorBias[0] || 0).toString();
        if (DOM.byInput) DOM.byInput.value = (State.currentEditorBias[1] || 0).toString();
    };

    App.resetEditor = function () {
        State.editingMatrixId = null;
        DOM.editorTitle.innerHTML = 'Define new weight matrix W<sub>i</sub>';
        DOM.actionButton.textContent = 'Add';
        DOM.actionButton.removeEventListener('click', App.updateMatrix);
        DOM.actionButton.addEventListener('click', App.addMatrix);
        DOM.cancelEditButton.classList.add('hidden');

        State.currentEditorMatrixOriginalValues = [[1, 0], [0, 1]];
        State.currentEditorBias = [0, 0];
        State.currentEditorIsInverse = false;
        App.updateEditorInputsFromState();
        App.hideMessage();
    };

    App.addMatrix = function () {
        const m00 = parseFloat(DOM.m00Input.value);
        const m01 = parseFloat(DOM.m01Input.value);
        const m10 = parseFloat(DOM.m10Input.value);
        const m11 = parseFloat(DOM.m11Input.value);
        const bx = DOM.bxInput ? (parseFloat(DOM.bxInput.value) || 0) : 0;
        const by = DOM.byInput ? (parseFloat(DOM.byInput.value) || 0) : 0;

        State.matrixCascade.push({
            id: MathCore.generateUniqueId(),
            values: [[m00, m01], [m10, m11]],
            bias: [bx, by],
            isInverse: State.currentEditorIsInverse,
            enabled: true
        });

        App.renderMatrixCascade();
        App.fitViewToScene();
        App.drawScene();
        App.resetEditor();
    };

    App.editMatrix = function (id) {
        const matrixToEdit = State.matrixCascade.find(item => item.id === id);
        if (!matrixToEdit) {
            return;
        }

        State.editingMatrixId = id;
        DOM.editorTitle.innerHTML = `Edit Weight Matrix W<sub>${State.matrixCascade.indexOf(matrixToEdit) + 1}</sub>:`;
        DOM.actionButton.textContent = 'Update';
        DOM.actionButton.removeEventListener('click', App.addMatrix);
        DOM.actionButton.addEventListener('click', App.updateMatrix);
        DOM.cancelEditButton.classList.remove('hidden');

        State.currentEditorMatrixOriginalValues = JSON.parse(JSON.stringify(matrixToEdit.values));
        State.currentEditorBias = matrixToEdit.bias ? [...matrixToEdit.bias] : [0, 0];
        State.currentEditorIsInverse = matrixToEdit.isInverse;
        App.updateEditorInputsFromState();
        App.hideMessage();
    };

    App.updateMatrix = function () {
        const matrixIndex = State.matrixCascade.findIndex(item => item.id === State.editingMatrixId);
        if (matrixIndex === -1) {
            return;
        }

        const m00 = parseFloat(DOM.m00Input.value);
        const m01 = parseFloat(DOM.m01Input.value);
        const m10 = parseFloat(DOM.m10Input.value);
        const m11 = parseFloat(DOM.m11Input.value);
        const bx = DOM.bxInput ? (parseFloat(DOM.bxInput.value) || 0) : 0;
        const by = DOM.byInput ? (parseFloat(DOM.byInput.value) || 0) : 0;

        if (State.currentEditorIsInverse) {
            const inverseOfCurrentInput = MathCore.calculateInverse([[m00, m01], [m10, m11]]);
            if (!inverseOfCurrentInput) {
                App.showMessage("Cannot update: Current values in editor are singular, cannot revert to original. Please adjust values.", "error");
                return;
            }
            State.matrixCascade[matrixIndex].values = inverseOfCurrentInput;
        } else {
            State.matrixCascade[matrixIndex].values = [[m00, m01], [m10, m11]];
        }

        State.matrixCascade[matrixIndex].bias = [bx, by];
        State.matrixCascade[matrixIndex].isInverse = State.currentEditorIsInverse;

        App.renderMatrixCascade();
        App.fitViewToScene();
        App.drawScene();
        App.resetEditor();
    };

    App.deleteMatrix = function (id) {
        State.matrixCascade = State.matrixCascade.filter(item => item.id !== id);
        App.renderMatrixCascade();
        App.fitViewToScene();
        App.drawScene();
        if (State.editingMatrixId === id) {
            App.resetEditor();
        }
    };

    App.duplicateMatrix = function (id) {
        const matrixToDuplicate = State.matrixCascade.find(item => item.id === id);
        if (!matrixToDuplicate) {
            return;
        }

        State.matrixCascade.push({
            id: MathCore.generateUniqueId(),
            values: JSON.parse(JSON.stringify(matrixToDuplicate.values)),
            bias: matrixToDuplicate.bias ? [...matrixToDuplicate.bias] : [0, 0],
            isInverse: matrixToDuplicate.isInverse,
            enabled: matrixToDuplicate.enabled
        });

        App.renderMatrixCascade();
        App.fitViewToScene();
        App.drawScene();
        App.showMessage("Weight matrix duplicated!", "info");
    };

    App.computeAndDisplayInverse = function () {
        const potentialInverse = MathCore.calculateInverse(State.currentEditorMatrixOriginalValues);

        if (potentialInverse) {
            State.currentEditorIsInverse = !State.currentEditorIsInverse;
            App.updateEditorInputsFromState();
            App.showMessage(State.currentEditorIsInverse ? "Inverse computed and displayed." : "Displaying original matrix.", "info");
        } else {
            App.showMessage("Cannot compute inverse: Matrix is singular (determinant is zero or near zero).", "error");
        }

        App.drawScene();
    };
})(window);
