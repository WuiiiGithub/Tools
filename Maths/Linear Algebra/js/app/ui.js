(function (global) {
    'use strict';

    const Visuo = global.Visuo = global.Visuo || {};
    const App = Visuo.App = Visuo.App || {};
    const { DOM, State, Config, Math: MathCore } = Visuo;
    let toastTimer = null;

    App.showToast = function (message, type = 'info', duration = 2600) {
        if (!DOM.appToast || !DOM.appToastText) {
            return;
        }

        if (toastTimer) {
            clearTimeout(toastTimer);
            toastTimer = null;
        }

        DOM.appToastText.textContent = message;
        DOM.appToastText.classList.remove(
            'border-emerald-200', 'text-emerald-800', 'shadow-emerald-900/10',
            'border-slate-200', 'text-slate-700', 'shadow-slate-900/10',
            'border-red-200', 'text-red-700', 'shadow-red-900/10'
        );

        if (type === 'success') {
            DOM.appToastText.classList.add('border-emerald-200', 'text-emerald-800', 'shadow-emerald-900/10');
        } else if (type === 'error') {
            DOM.appToastText.classList.add('border-red-200', 'text-red-700', 'shadow-red-900/10');
        } else {
            DOM.appToastText.classList.add('border-slate-200', 'text-slate-700', 'shadow-slate-900/10');
        }

        DOM.appToast.classList.remove('hidden');
        toastTimer = setTimeout(() => {
            DOM.appToast.classList.add('hidden');
            toastTimer = null;
        }, duration);
    };

    App.showMessage = function (message, type = 'info') {
        DOM.messageBoxText.textContent = message;
        DOM.messageBox.classList.remove(
            'hidden',
            'bg-red-50', 'border-red-500', 'text-red-700',
            'bg-blue-50', 'border-blue-500', 'text-blue-700'
        );
        DOM.messageBox.classList.add('flex');

        if (type === 'error') {
            DOM.messageBox.classList.add('bg-red-50', 'border-red-500', 'text-red-700');
        } else {
            DOM.messageBox.classList.add('bg-blue-50', 'border-blue-500', 'text-blue-700');
        }

        DOM.messageBoxCloseBtn.onclick = App.hideMessage;
    };

    App.hideMessage = function () {
        DOM.messageBox.classList.add('hidden');
        DOM.messageBox.classList.remove('flex');
    };

    App.showVectorInfoBox = function (html, left, top) {
        DOM.vectorInfoBox.innerHTML = html;
        DOM.vectorInfoBox.style.left = `${left}px`;
        DOM.vectorInfoBox.style.top = `${top}px`;
        DOM.vectorInfoBox.classList.remove('hidden');
        DOM.vectorInfoBox.classList.add('flex');
    };

    App.hideVectorInfoBox = function () {
        DOM.vectorInfoBox.classList.add('hidden');
        DOM.vectorInfoBox.classList.remove('flex');
    };

    App.getPerspectiveCoordinates = function (vectorInXY) {
        if (State.perspectiveMode === 'original') {
            return { basis: 'X, Y', coordinates: vectorInXY };
        }

        const preTransformed = App.invertPointThroughCascade(vectorInXY);
        if (!preTransformed) {
            return { basis: 'X1, X2', coordinates: null };
        }

        return {
            basis: 'X1, X2',
            coordinates: preTransformed
        };
    };

    App.buildVectorInfoMarkup = function (label, colorClass, vectorInXY, cumulativeMatrix) {
        const { basis, coordinates } = App.getPerspectiveCoordinates(vectorInXY, cumulativeMatrix);
        const coordinatesLine = coordinates
            ? `<span class="font-bold ${colorClass}">(${basis}) = (${coordinates[0].toFixed(2)}, ${coordinates[1].toFixed(2)})</span>`
            : `<span class="font-bold text-gray-500">(${basis}) unavailable (singular transform)</span>`;

        return `<span class="font-semibold text-gray-700">Vector ${label}</span>${coordinatesLine}`;
    };

    App.buildPointInfoMarkup = function (item) {
        const formatCoordinate = value => {
            if (!Number.isFinite(value)) {
                return '—';
            }
            if (Math.abs(value) >= 1e6 || (Math.abs(value) > 0 && Math.abs(value) < 1e-4)) {
                return value.toExponential(3);
            }
            return String(Number(value.toFixed(4)));
        };
        const transformed = App.transformPointThroughCascade(item.point);
        const classLine = item.label
            ? `<span class="text-xs font-medium text-slate-500">Class: ${item.label}</span>`
            : '';

        return [
            '<span class="font-semibold text-gray-700">Dataset point</span>',
            classLine,
            `<span class="font-bold text-blue-600">Blue (X, Y) = (${formatCoordinate(item.point[0])}, ${formatCoordinate(item.point[1])})</span>`,
            `<span class="font-bold text-red-600">Red (X1, X2) = (${formatCoordinate(transformed[0])}, ${formatCoordinate(transformed[1])})</span>`
        ].filter(Boolean).join('');
    };

    App.applyPerspectiveButtonStyle = function () {
        if (State.perspectiveMode === 'transformed') {
            DOM.perspectiveToggleBtn.classList.remove(...Config.PERSPECTIVE_BLUE_CLASSES);
            DOM.perspectiveToggleBtn.classList.add(...Config.PERSPECTIVE_RED_CLASSES);
            DOM.perspectiveToggleBtn.title = 'Current View: Transformed X1 Basis';
        } else {
            DOM.perspectiveToggleBtn.classList.remove(...Config.PERSPECTIVE_RED_CLASSES);
            DOM.perspectiveToggleBtn.classList.add(...Config.PERSPECTIVE_BLUE_CLASSES);
            DOM.perspectiveToggleBtn.title = 'Current View: Original XY Basis';
        }
    };

    App.setControlsToggleState = function (open) {
        DOM.controlsMenuIcon.classList.toggle('hidden', open);
        DOM.controlsCloseIcon.classList.toggle('hidden', !open);
        DOM.toggleControlsBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        DOM.toggleControlsBtn.setAttribute('aria-label', open ? 'Close controls' : 'Open controls');
    };

    App.openControlsDrawer = function () {
        if (DOM.mobileMediaQuery.matches) {
            return;
        }

        State.lastFocusedElement = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
            ? document.activeElement
            : DOM.toggleControlsBtn;
        DOM.appShell.inert = true;
        DOM.appShell.setAttribute('aria-hidden', 'true');
        DOM.controlsDrawer.inert = false;
        DOM.controlsDrawer.setAttribute('aria-hidden', 'false');
        DOM.controlsDrawer.classList.remove('opacity-0', 'pointer-events-none');
        DOM.controlsDrawer.classList.add('opacity-100');
        DOM.controlsPanel.classList.remove('-translate-x-full');
        DOM.controlsPanel.classList.add('translate-x-0');
        App.setControlsToggleState(true);
        DOM.controlsBody.scrollTop = 0;
        DOM.closeControlsBtn.focus();
    };

    App.closeControlsDrawer = function () {
        DOM.controlsDrawer.setAttribute('aria-hidden', 'true');
        DOM.controlsDrawer.inert = true;
        DOM.controlsDrawer.classList.remove('opacity-100');
        DOM.controlsDrawer.classList.add('opacity-0', 'pointer-events-none');
        DOM.controlsPanel.classList.remove('translate-x-0');
        DOM.controlsPanel.classList.add('-translate-x-full');
        App.setControlsToggleState(false);
        const restricted = DOM.mobileMediaQuery.matches;
        DOM.appShell.inert = restricted;
        DOM.appShell.setAttribute('aria-hidden', restricted ? 'true' : 'false');
        const focusTarget = State.lastFocusedElement instanceof HTMLElement ? State.lastFocusedElement : DOM.toggleControlsBtn;
        focusTarget.focus();
    };

    App.toggleControlsDrawer = function () {
        if (DOM.controlsDrawer.inert) {
            App.openControlsDrawer();
        } else {
            App.closeControlsDrawer();
        }
    };

    App.setSettingsTab = function (tabName) {
        const nextTab = tabName || 'view';
        State.settingsTab = nextTab;

        DOM.settingsTabButtons.forEach(button => {
            const active = button.dataset.settingsTab === nextTab;
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
            button.classList.toggle('bg-slate-900', active);
            button.classList.toggle('text-white', active);
            button.classList.toggle('shadow-sm', active);
            button.classList.toggle('shadow-slate-900/20', active);
            button.classList.toggle('text-slate-600', !active);
            button.classList.toggle('hover:bg-slate-100', !active);
            button.classList.toggle('hover:text-slate-900', !active);

            const caption = button.querySelector('span.min-w-0 > span:last-child');
            if (caption) {
                caption.classList.toggle('text-white/60', active);
                caption.classList.toggle('text-slate-400', !active);
            }
        });

        DOM.settingsTabPanes.forEach(pane => {
            pane.classList.toggle('hidden', pane.dataset.settingsPane !== nextTab);
        });
    };

    App.openSettingsModal = function () {
        if (!DOM.settingsModal) {
            return;
        }

        DOM.settingsModal.classList.remove('hidden');
        DOM.settingsToggleBtn.setAttribute('aria-expanded', 'true');
        App.setSettingsTab(State.settingsTab || 'view');
        if (DOM.closeSettingsBtn) {
            DOM.closeSettingsBtn.focus();
        }
    };

    App.closeSettingsModal = function () {
        if (!DOM.settingsModal) {
            return;
        }

        DOM.settingsModal.classList.add('hidden');
        DOM.settingsToggleBtn.setAttribute('aria-expanded', 'false');
        DOM.settingsToggleBtn.focus();
    };

    App.toggleSettingsModal = function () {
        if (!DOM.settingsModal) {
            return;
        }

        if (DOM.settingsModal.classList.contains('hidden')) {
            App.openSettingsModal();
        } else {
            App.closeSettingsModal();
        }
    };

    App.syncMobileRestriction = function () {
        const restricted = DOM.mobileMediaQuery.matches;
        if (restricted) {
            App.closeControlsDrawer();
        }
        const isAppHidden = restricted || !DOM.controlsDrawer.inert;
        DOM.appShell.inert = isAppHidden;
        DOM.appShell.setAttribute('aria-hidden', isAppHidden ? 'true' : 'false');
        DOM.mobileNotice.setAttribute('aria-hidden', restricted ? 'false' : 'true');
    };
})(window);
