(() => {
  const article = document.getElementById('study-article');
  const readerStatus = document.getElementById('reader-status');
  if (!article) return;

  const sourcePageUrl = (page) => `https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf#page=${page}`;
  const pageLabel = (segment) => {
    const pdfPage = Number(segment.pdf_page);
    const printedPage = Number(segment.printed_page);
    return Number.isInteger(printedPage) && printedPage > 0
      ? `PDF p. ${pdfPage} · printed p. ${printedPage}`
      : `PDF p. ${pdfPage}`;
  };

  function citationLink(segment) {
    const link = document.createElement('a');
    link.className = 'page-citation';
    link.href = segment.source_url || sourcePageUrl(segment.pdf_page);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = pageLabel(segment);
    link.setAttribute('aria-label', `Open original NASA scan, ${pageLabel(segment)}`);
    return link;
  }

  function addAnchor(parent, id) {
    if (!id) return;
    const anchor = document.createElement('span');
    anchor.className = 'study-anchor';
    anchor.id = id;
    anchor.tabIndex = -1;
    parent.append(anchor);
  }

  function makeHeading(segment) {
    const level = Math.max(1, Math.min(6, Number(segment.level) || 3));
    const tag = level <= 2 ? 'h2' : (level <= 4 ? 'h3' : 'h4');
    const heading = document.createElement(tag);
    heading.className = `study-heading source-level-${level}`;
    heading.id = segment.id;
    heading.textContent = segment.text;
    return heading;
  }

  function makeTextGroup(group) {
    const first = group[0];
    const paragraph = document.createElement('p');
    paragraph.className = first.line ? 'study-paragraph study-line' : 'study-paragraph';
    paragraph.id = first.id;
    for (const [index, segment] of group.entries()) {
      if (segment.anchor) addAnchor(paragraph, segment.anchor);
      const sentence = document.createElement('span');
      sentence.className = 'study-sentence';
      sentence.id = index === 0 ? `${segment.id}-text` : segment.id;
      sentence.textContent = segment.text;
      paragraph.append(sentence);
      if (index < group.length - 1) paragraph.append(document.createTextNode(' '));
    }
    paragraph.append(document.createTextNode(' '), citationLink(group[group.length - 1]));
    return paragraph;
  }

  function parseMarkdownRows(markdown) {
    const lines = String(markdown || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return lines.map((line) => {
      let value = line;
      if (value.startsWith('|')) value = value.slice(1);
      if (value.endsWith('|')) value = value.slice(0, -1);
      const cells = [];
      let cell = '';
      for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (char === '\\' && value[index + 1] === '|') {
          cell += '|';
          index += 1;
        } else if (char === '|') {
          cells.push(cell.trim());
          cell = '';
        } else {
          cell += char;
        }
      }
      cells.push(cell.trim());
      return cells;
    }).filter((row) => row.some(Boolean));
  }

  function makeTable(segment) {
    const figure = document.createElement('figure');
    figure.className = 'study-table-figure';
    figure.id = segment.id;
    const caption = document.createElement('figcaption');
    const description = document.createElement('p');
    description.className = 'table-description';
    description.textContent = segment.description || segment.text || 'Report data table';
    caption.append(description);
    if (segment.caption) {
      const sourceCaption = document.createElement('p');
      sourceCaption.className = 'table-source-caption';
      sourceCaption.textContent = segment.caption;
      caption.append(sourceCaption);
    }
    const table = document.createElement('table');
    table.className = 'report-table';
    const rows = parseMarkdownRows(segment.table_markdown);
    if (rows.length) {
      const header = document.createElement('thead');
      const headerRow = document.createElement('tr');
      for (const value of rows[0]) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.textContent = value;
        headerRow.append(cell);
      }
      header.append(headerRow);
      table.append(header);
      const body = document.createElement('tbody');
      for (const row of rows.slice(2)) {
        const tableRow = document.createElement('tr');
        for (let column = 0; column < rows[0].length; column += 1) {
          const cell = document.createElement('td');
          cell.textContent = row[column] || '';
          tableRow.append(cell);
        }
        body.append(tableRow);
      }
      table.append(body);
    } else {
      const fallback = document.createElement('pre');
      fallback.className = 'table-fallback';
      fallback.textContent = segment.table_markdown || '';
      figure.append(fallback);
    }
    const scroll = document.createElement('div');
    scroll.className = 'table-scroll';
    scroll.tabIndex = 0;
    scroll.setAttribute('role', 'region');
    scroll.setAttribute('aria-label', `Table: ${segment.description || segment.text || 'report data'}`);
    scroll.append(table);
    figure.append(caption, scroll, citationLink(segment));
    if (segment.anchor) addAnchor(figure, segment.anchor);
    return figure;
  }

  function makeImage(segment) {
    const figure = document.createElement('figure');
    figure.className = 'study-figure';
    figure.id = segment.id;
    if (segment.anchor) addAnchor(figure, segment.anchor);
    const image = document.createElement('img');
    image.src = segment.image_path;
    image.alt = segment.description || segment.text || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.append(image);
    const caption = document.createElement('figcaption');
    if (segment.caption) {
      const sourceCaption = document.createElement('p');
      sourceCaption.className = 'figure-source-caption';
      sourceCaption.textContent = segment.caption;
      caption.append(sourceCaption);
    }
    const description = document.createElement('p');
    description.className = 'figure-description';
    description.textContent = segment.description || segment.text || '';
    caption.append(description, citationLink(segment));
    figure.append(caption);
    return figure;
  }

  function renderSegments(segments) {
    const fragment = document.createDocumentFragment();
    let currentPage = null;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment || !segment.id || !Number.isInteger(Number(segment.pdf_page))) continue;
      const pageNumber = Number(segment.pdf_page);
      if (pageNumber !== currentPage) {
        currentPage = pageNumber;
        const pageAnchor = document.createElement('span');
        pageAnchor.id = `pdf-${String(pageNumber).padStart(3, '0')}`;
        pageAnchor.className = 'pdf-page-anchor';
        pageAnchor.dataset.pdfPage = String(pageNumber);
        pageAnchor.setAttribute('aria-hidden', 'true');
        fragment.append(pageAnchor);
      }
      if (segment.anchor && segment.type !== 'image' && segment.type !== 'table') addAnchor(fragment, segment.anchor);
      if (segment.type === 'heading') {
        fragment.append(makeHeading(segment), citationLink(segment));
      } else if (segment.type === 'image') {
        fragment.append(makeImage(segment));
      } else if (segment.type === 'table') {
        fragment.append(makeTable(segment));
      } else if (segment.type === 'text') {
        const paragraphId = segment.paragraph_id || segment.id;
        const group = [segment];
        while (index + 1 < segments.length) {
          const next = segments[index + 1];
          if (next.type !== 'text' || Number(next.pdf_page) !== pageNumber
            || (next.paragraph_id || next.id) !== paragraphId || Boolean(next.line) !== Boolean(segment.line)) break;
          group.push(next);
          index += 1;
        }
        fragment.append(makeTextGroup(group));
      }
    }
    article.replaceChildren(fragment);
  }

  const chapterMenuButton = document.getElementById('chapter-menu-toggle');
  const chapterMenuBackdrop = document.getElementById('chapter-menu-backdrop');
  const chapterNavigation = document.getElementById('chapter-navigation');
  function setChapterMenuOpen(open) {
    if (!chapterMenuButton) return;
    chapterMenuButton.setAttribute('aria-expanded', String(open));
    chapterMenuButton.setAttribute('aria-label', open ? 'Close chapter menu' : 'Open chapter menu');
    document.body.classList.toggle('chapter-menu-open', open);
    if (chapterMenuBackdrop) chapterMenuBackdrop.hidden = !open;
  }
  chapterMenuButton?.addEventListener('click', () => {
    setChapterMenuOpen(chapterMenuButton.getAttribute('aria-expanded') !== 'true');
  });
  chapterMenuBackdrop?.addEventListener('click', () => setChapterMenuOpen(false));
  chapterNavigation?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setChapterMenuOpen(false));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setChapterMenuOpen(false);
  });

  const searchForm = document.getElementById('study-search-form');
  const searchInput = document.getElementById('study-search');
  const searchStatus = document.getElementById('search-status');
  const searchResults = document.getElementById('search-results');
  const resultGroups = {
    bm25: document.getElementById('bm25-results'),
    semantic: document.getElementById('semantic-results'),
  };
  const resultSections = {
    bm25: document.getElementById('bm25-results')?.closest('.search-result-group'),
    semantic: document.getElementById('semantic-results')?.closest('.search-result-group'),
  };

  function renderSearchResults(list, results, label) {
    if (!list) return;
    list.replaceChildren();
    if (!results.length) {
      const empty = document.createElement('li');
      empty.className = 'empty-search-result';
      empty.textContent = `No ${label} matches.`;
      list.append(empty);
      return;
    }
    for (const result of results) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-result-link';
      const title = document.createElement('strong');
      title.textContent = result.heading_context || result.caption || result.description || result.text || 'Report segment';
      const excerpt = document.createElement('span');
      excerpt.textContent = result.text || result.caption || result.description || 'Report content';
      const citation = document.createElement('small');
      citation.textContent = pageLabel(result);
      button.append(title, excerpt, citation);
      button.addEventListener('click', () => {
        const target = document.getElementById(result.id) || document.getElementById(`pdf-${String(result.pdf_page).padStart(3, '0')}`);
        if (target) {
          history.replaceState(null, '', `#${target.id}`);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.focus?.({ preventScroll: true });
        }
      });
      item.append(button);
      list.append(item);
    }
  }

  searchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = (searchInput?.value || '').trim();
    const modes = [];
    if (document.getElementById('search-bm25')?.checked) modes.push('bm25');
    if (document.getElementById('search-semantic')?.checked) modes.push('semantic');
    if (!query) {
      if (searchStatus) searchStatus.textContent = 'Enter a search term.';
      searchInput?.focus();
      return;
    }
    if (!modes.length) {
      if (searchStatus) searchStatus.textContent = 'Choose at least one search method.';
      return;
    }
    if (searchStatus) searchStatus.textContent = 'Searching…';
    if (searchResults) searchResults.hidden = false;
    for (const mode of ['bm25', 'semantic']) {
      if (resultSections[mode]) resultSections[mode].hidden = !modes.includes(mode);
    }
    try {
      const response = await fetch(new URL('../api/study/search', document.baseURI), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, modes, limit: 8 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Search failed (${response.status})`);
      if (modes.includes('bm25')) renderSearchResults(resultGroups.bm25, payload.bm25 || [], 'keyword');
      if (modes.includes('semantic')) renderSearchResults(resultGroups.semantic, payload.semantic || [], 'semantic');
      if (searchStatus) {
        searchStatus.textContent = modes.includes('semantic') && payload.semantic_available === false
          ? 'Keyword results are ready; semantic search is temporarily unavailable.'
          : `${(payload.bm25 || []).length + (payload.semantic || []).length} results shown.`;
      }
    } catch {
      if (searchStatus) searchStatus.textContent = 'Search is unavailable right now. Please try again.';
      for (const mode of modes) renderSearchResults(resultGroups[mode], [], mode);
    }
  });

  document.getElementById('search-results-close')?.addEventListener('click', () => {
    if (searchResults) searchResults.hidden = true;
    searchInput?.focus();
  });

  async function loadStudy() {
    try {
      const response = await fetch(new URL('./segments.json', document.baseURI), { cache: 'no-store' });
      if (!response.ok) throw new Error(`Segment data returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.segments)) throw new Error('Segment data is incomplete');
      renderSegments(payload.segments);
      const count = payload.segments.length.toLocaleString();
      if (readerStatus) readerStatus.textContent = `Loaded ${count} cited report segments from ${payload.metadata?.pdf_pages || 'the source'} PDF pages.`;
      if (window.location.hash) {
        requestAnimationFrame(() => document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView());
      }
    } catch (error) {
      if (readerStatus) readerStatus.textContent = 'The report could not be loaded. Refresh the page or open the NASA source record.';
      console.error('Study reader failed to load:', error.message);
    }
  }

  loadStudy();
})();
