// Editor UI - asset/texture selector bar
import { editorState } from './state.js';
import { CATALOG } from './catalog.js';

let selectorBar = null;
let itemsContainer = null;

// Create the selector bar HTML
export function createSelectorUI() {
    // Create container
    selectorBar = document.createElement('div');
    selectorBar.id = 'editor-selector';
    selectorBar.innerHTML = `
        <div class="selector-arrow selector-left">&lt;</div>
        <div class="selector-items"></div>
        <div class="selector-arrow selector-right">&gt;</div>
    `;
    document.body.appendChild(selectorBar);

    itemsContainer = selectorBar.querySelector('.selector-items');

    // Populate items
    renderItems();

    // Arrow click handlers
    selectorBar.querySelector('.selector-left').addEventListener('click', (e) => {
        e.stopPropagation();
        selectPrevious();
    });
    selectorBar.querySelector('.selector-right').addEventListener('click', (e) => {
        e.stopPropagation();
        selectNext();
    });

    // Prevent pointer lock when clicking selector
    selectorBar.addEventListener('mousedown', (e) => e.stopPropagation());
    selectorBar.addEventListener('click', (e) => e.stopPropagation());

    return selectorBar;
}

// Get icon for asset category
function getCategoryIcon(category) {
    const icons = {
        'Trees': '\u{1F333}',      // Deciduous tree
        'Autumn': '\u{1F342}',     // Fallen leaf
        'Rocks': '\u{1FAA8}',      // Rock
        'Plants': '\u{1F33F}',     // Herb
        'Crops': '\u{1F33E}',      // Wheat
        'Other': '\u{1F332}'       // Evergreen tree
    };
    return icons[category] || '\u{1F4E6}'; // Package as default
}

// Render visible items around the selected index
function renderItems() {
    if (!itemsContainer) return;

    itemsContainer.innerHTML = '';

    // Show 7 items centered on selection
    const visibleCount = 7;
    const halfVisible = Math.floor(visibleCount / 2);
    const startIdx = editorState.selectedIndex - halfVisible;

    for (let i = 0; i < visibleCount; i++) {
        let idx = startIdx + i;
        // Wrap around
        if (idx < 0) idx = CATALOG.length + idx;
        if (idx >= CATALOG.length) idx = idx - CATALOG.length;

        const item = CATALOG[idx];
        const div = document.createElement('div');
        div.className = 'selector-item';
        if (idx === editorState.selectedIndex) {
            div.classList.add('selected');
        }

        if (item.type === 'texture') {
            // Color swatch for textures
            div.innerHTML = `
                <div class="item-swatch" style="background-color: #${item.color.toString(16).padStart(6, '0')}"></div>
                <div class="item-name">${item.name}</div>
            `;
        } else {
            // Asset with category icon
            const icon = getCategoryIcon(item.category);
            // Shorten name: remove underscores, show variant number
            const shortName = item.id.replace(/_/g, ' ').replace(/([A-Za-z]+)(\d+)$/, '$1 $2');
            div.innerHTML = `
                <div class="item-icon">${icon}</div>
                <div class="item-name">${shortName}</div>
            `;
        }

        div.addEventListener('click', (e) => {
            e.stopPropagation();
            editorState.selectedIndex = idx;
            renderItems();
        });

        itemsContainer.appendChild(div);
    }
}

// Select next item
export function selectNext() {
    editorState.selectedIndex = (editorState.selectedIndex + 1) % CATALOG.length;
    renderItems();
}

// Select previous item
export function selectPrevious() {
    editorState.selectedIndex = (editorState.selectedIndex - 1 + CATALOG.length) % CATALOG.length;
    renderItems();
}

// Show/hide selector
export function showSelector(show) {
    if (selectorBar) {
        selectorBar.style.display = show ? 'flex' : 'none';
    }
}

// Get currently selected item
export function getSelectedItem() {
    return CATALOG[editorState.selectedIndex];
}

// Update display (call after selection changes)
export function updateSelectorUI() {
    renderItems();
}
