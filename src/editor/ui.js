// Editor UI - category buttons and item selector
import { editorState } from './state.js';
import { CATEGORIES } from './catalog.js';

let selectorContainer = null;
let categoryBar = null;
let itemsRow = null;
let itemsContainer = null;

// Currently open category (null if closed)
let openCategory = null;
// Selected index within the current category
let selectedItemIndex = 0;

// Create the selector bar HTML
export function createSelectorUI() {
    // Create main container
    selectorContainer = document.createElement('div');
    selectorContainer.id = 'editor-selector';
    selectorContainer.innerHTML = `
        <div class="items-row" style="display: none;">
            <div class="selector-arrow selector-left">&lt;</div>
            <div class="selector-items"></div>
            <div class="selector-arrow selector-right">&gt;</div>
        </div>
        <div class="category-bar">
            <button class="category-btn" data-category="textures">Ground Texture</button>
            <button class="category-btn" data-category="buildings">Buildings</button>
            <button class="category-btn" data-category="plants">Plants</button>
        </div>
    `;
    document.body.appendChild(selectorContainer);

    itemsRow = selectorContainer.querySelector('.items-row');
    itemsContainer = selectorContainer.querySelector('.selector-items');
    categoryBar = selectorContainer.querySelector('.category-bar');

    // Category button handlers
    categoryBar.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const category = btn.dataset.category;
            toggleCategory(category);
        });
    });

    // Arrow click handlers
    selectorContainer.querySelector('.selector-left').addEventListener('click', (e) => {
        e.stopPropagation();
        selectPrevious();
    });
    selectorContainer.querySelector('.selector-right').addEventListener('click', (e) => {
        e.stopPropagation();
        selectNext();
    });

    // Prevent pointer lock when clicking selector
    selectorContainer.addEventListener('mousedown', (e) => e.stopPropagation());
    selectorContainer.addEventListener('click', (e) => e.stopPropagation());

    return selectorContainer;
}

// Toggle category open/closed
function toggleCategory(categoryKey) {
    if (openCategory === categoryKey) {
        // Close the menu
        openCategory = null;
        itemsRow.style.display = 'none';
        updateCategoryButtons();
    } else {
        // Open this category
        openCategory = categoryKey;
        selectedItemIndex = 0;
        itemsRow.style.display = 'flex';
        renderItems();
        updateCategoryButtons();
    }
}

// Update category button active states
function updateCategoryButtons() {
    categoryBar.querySelectorAll('.category-btn').forEach(btn => {
        const isActive = btn.dataset.category === openCategory;
        btn.classList.toggle('active', isActive);
    });
}

// Render visible items around the selected index
function renderItems() {
    if (!itemsContainer || !openCategory) return;

    const category = CATEGORIES[openCategory];
    if (!category) return;

    itemsContainer.innerHTML = '';

    // Show 7 items centered on selection
    const visibleCount = 7;
    const halfVisible = Math.floor(visibleCount / 2);
    const items = category.items;
    const startIdx = selectedItemIndex - halfVisible;

    for (let i = 0; i < visibleCount; i++) {
        let idx = startIdx + i;
        // Wrap around
        if (idx < 0) idx = items.length + idx;
        if (idx >= items.length) idx = idx % items.length;

        const item = items[idx];
        const div = document.createElement('div');
        div.className = 'selector-item';
        if (idx === selectedItemIndex) {
            div.classList.add('selected');
        }

        if (item.type === 'texture') {
            // Color swatch for textures
            div.innerHTML = `
                <div class="item-swatch" style="background-color: #${item.color.toString(16).padStart(6, '0')}"></div>
                <div class="item-name">${item.name}</div>
            `;
        } else {
            // Asset with icon image
            const shortName = item.id.replace(/_/g, ' ').replace(/([A-Za-z]+)(\d+)$/, '$1 $2');
            div.innerHTML = `
                <img class="item-icon-img" src="${item.icon}" alt="${item.name}" onerror="this.style.display='none'">
                <div class="item-name">${shortName}</div>
            `;
        }

        div.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedItemIndex = idx;
            // Update editorState to reference this item
            updateEditorSelection();
            renderItems();
        });

        itemsContainer.appendChild(div);
    }
}

// Update the editorState with current selection
function updateEditorSelection() {
    if (!openCategory) return;
    const category = CATEGORIES[openCategory];
    if (!category) return;

    // Store the selected item info in editorState
    const item = category.items[selectedItemIndex];
    editorState.selectedCategory = openCategory;
    editorState.selectedItem = item;
}

// Select next item
export function selectNext() {
    if (!openCategory) return;
    const items = CATEGORIES[openCategory]?.items;
    if (!items) return;

    selectedItemIndex = (selectedItemIndex + 1) % items.length;
    updateEditorSelection();
    renderItems();
}

// Select previous item
export function selectPrevious() {
    if (!openCategory) return;
    const items = CATEGORIES[openCategory]?.items;
    if (!items) return;

    selectedItemIndex = (selectedItemIndex - 1 + items.length) % items.length;
    updateEditorSelection();
    renderItems();
}

// Show/hide selector
export function showSelector(show) {
    if (selectorContainer) {
        selectorContainer.style.display = show ? 'flex' : 'none';
    }
}

// Get currently selected item
export function getSelectedItem() {
    if (!openCategory) return null;
    const category = CATEGORIES[openCategory];
    if (!category) return null;
    return category.items[selectedItemIndex];
}

// Update display (call after selection changes)
export function updateSelectorUI() {
    renderItems();
}
