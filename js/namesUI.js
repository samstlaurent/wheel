import {
    resumeAudio,
    playSound
} from './recorder.js';

export function initNamesUI({
    names,
    includedNames,
    onNamesChanged,
    onSelectedNameChanged,
    buttonPressSound
}) {
    let selectedIcon = null;
    let selectedName = null;

    const savedSelectedName = localStorage.getItem("selectedName");
    if (savedSelectedName) {
        selectedName = savedSelectedName;
        onSelectedNameChanged(selectedName);
    }

    const list = document.getElementById("nameList");
    list.innerHTML = "";

    [...names].sort((a, b) => a.localeCompare(b)).forEach((n) => {

        const icon = document.createElement("img");
        icon.src = (n === selectedName)
            ? "images/selectorIconEnabled.png"
            : "images/selectorIconDisabled.png";

        if (n === selectedName) {
            selectedIcon = icon;
        }

        icon.alt = "";
        icon.className = "selectorIcon";
        icon.style.height = "24px";

        const iconContainer = document.createElement("div");
        iconContainer.className = "iconContainer";
        iconContainer.style.width = "100%";
        iconContainer.style.display = "flex";
        iconContainer.style.justifyContent = "center";
        iconContainer.style.cursor = "pointer";
        iconContainer.style.marginBottom = "4px";
        iconContainer.appendChild(icon);

        iconContainer.onclick = () => {
            if (window.busy) return;

            resumeAudio();
            playSound(buttonPressSound, 0.5);

            if (selectedName === n) {
                icon.src = "images/selectorIconDisabled.png";
                selectedIcon = null;
                selectedName = null;
                localStorage.removeItem("selectedName");
            } else {
                if (selectedIcon)
                    selectedIcon.src = "images/selectorIconDisabled.png";

                icon.src = "images/selectorIconEnabled.png";
                selectedIcon = icon;
                selectedName = n;
                localStorage.setItem("selectedName", selectedName);
            }

            onSelectedNameChanged(selectedName);
        };

        const item = document.createElement("span");
        item.className = "nameItem";
        item.textContent = n;

        item.onclick = () => {
            if (window.busy) return;

            resumeAudio();
            playSound(buttonPressSound, 0.5);

            const idx = includedNames.indexOf(n);

            if (idx !== -1) {
                if (includedNames.length > 1) {
                    includedNames.splice(idx, 1);
                    item.classList.add("excluded");
                }
            } else {
                includedNames.push(n);
                item.classList.remove("excluded");
            }

            onNamesChanged();
        };

        const wrapper = document.createElement("div");
        wrapper.className = "nameWrapper";
        wrapper.dataset.name = n;
        wrapper.style.display = "inline-flex";
        wrapper.style.flexDirection = "column";
        wrapper.style.alignItems = "center";
        wrapper.style.margin = "4px";

        wrapper.appendChild(iconContainer);
        wrapper.appendChild(item);

        const badge = document.createElement("div");
        badge.className = "streakBadge";
        badge.style.display = "none";
        wrapper.appendChild(badge);

        list.appendChild(wrapper);
    });
}
