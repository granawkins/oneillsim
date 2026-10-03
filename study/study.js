(() => {
  const article = document.getElementById('study-article');
  const readerStatus = document.getElementById('reader-status');
  if (!article) return;

  let layout;
  let segmentById;
  let readingOrder;
  let referenceTargets;
  const chapterOf = (segment) => [...layout.chapters].reverse().find(ch => segment.pdf_page >= ch.page)?.number || 0;
  function readable(segment) {
    const page = Number(segment.pdf_page);
    if (page < 8 || (page >= 12 && page <= 17)) return false;

    const text = String(segment.text || '').trim();
    if (/^Page intentionally left blank$/i.test(text)) return false;
    if (segment.type === 'text' && (/^[\d ivxlc]+$/i.test(text) || /^[r\s~,.|_—–-]+$/.test(text))) return false;
    return true;
  }
  let visibleIds = new Set();

  const renderedAnchors = new Set();
  function addAnchor(parent, id) {
    if (!id || renderedAnchors.has(id)) return;
    renderedAnchors.add(id);
    const anchor = document.createElement('span');
    anchor.className = 'study-anchor';
    anchor.id = id;
    anchor.tabIndex = -1;
    parent.append(anchor);
  }

  function makeHeading(segment) {
    const spec = layout.headings[segment.id];
    const level = spec?.level || 2;
    const heading = document.createElement(`h${level}`);
    heading.className = 'study-heading';
    heading.id = segment.id;
    heading.textContent = spec?.title || segment.text;
    return heading;
  }

  function appendLinkedText(parent, text, segment) {
    const pattern = /\b(?:refs?\.?|references?)\s*(\d+(?:\s*(?:,|and|[-–])\s*\d+)*)(?:,\s*(?:ch\.?|chapter)\s*(\d+))?/gi;
    let previous = 0;
    for (const match of text.matchAll(pattern)) {
      const chapter = Number(match[2]) || chapterOf(segment);
      const numberOffset = match[0].indexOf(match[1]);
      parent.append(document.createTextNode(text.slice(previous, match.index + numberOffset)));
      let last = 0;
      for (const number of match[1].matchAll(/\d+/g)) {
        parent.append(document.createTextNode(match[1].slice(last, number.index)));
        const id = `ref-${chapter}-${Number(number[0])}`;
        if (referenceTargets.has(id)) {
          const link = document.createElement('a');
          link.href = `#${id}`;
          link.className = 'reference-link';
          link.textContent = number[0];
          link.setAttribute('aria-label', `Chapter ${chapter}, reference ${Number(number[0])}`);
          parent.append(link);
        } else parent.append(document.createTextNode(number[0]));
        last = number.index + number[0].length;
      }
      parent.append(document.createTextNode(match[1].slice(last) + match[0].slice(numberOffset + match[1].length)));
      previous = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(previous)));
  }

  const renderedPages = new Set();
  function pageAnchor(parent, segment) {
    if (renderedPages.has(segment.pdf_page)) return;
    renderedPages.add(segment.pdf_page);
    addAnchor(parent, `pdf-${String(segment.pdf_page).padStart(3, '0')}`);
  }

  function makeTextGroup(group) {
    const first = group[0];
    const paragraph = document.createElement('p');
    paragraph.className = first.line ? 'study-paragraph study-line' : 'study-paragraph';
    paragraph.id = first.id;
    for (const [index, segment] of group.entries()) {
      pageAnchor(paragraph, segment);
      if (segment.anchor && (segment.anchor !== 'appendix-b' || segment.pdf_page === 130)) addAnchor(paragraph, segment.anchor);
      const sentence = document.createElement('span');
      sentence.className = 'study-sentence';
      sentence.id = index === 0 ? `${segment.id}-text` : segment.id;
      appendLinkedText(sentence, segment.text, segment);
      paragraph.append(sentence);
      if (index < group.length - 1) paragraph.append(document.createTextNode(segment.join_without_space ? '' : ' '));
    }
    return paragraph;
  }

  function makeReferences(group) {
    const details = document.createElement('details');
    details.className = 'chapter-references';
    details.id = `references-${group.chapter}`;
    const summary = document.createElement('summary');
    summary.textContent = 'References';
    details.append(summary);
    addAnchor(details, group.first);
    const list = document.createElement('ol');
    for (const entry of group.entries) {
      const item = document.createElement('li');
      item.id = `ref-${group.chapter}-${entry.number}`;
      item.value = entry.number;
      for (const id of entry.segments) {
        const segment = segmentById.get(id);
        const text = document.createElement('span');
        text.id = id;
        text.textContent = segment.text.replace(/^~*(?:\d+\.\s*~*\s*)/, '');
        item.append(text, document.createTextNode(' '));
        pageAnchor(item, segment);
      }
      list.append(item);
    }
    details.append(list);
    return details;
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
    appendLinkedText(description, segment.caption || '', segment);
    caption.append(description);
    if (segment.table_introduction) {
      const introduction = document.createElement('p');
      introduction.className = 'study-paragraph';
      appendLinkedText(introduction, segment.table_introduction, segment);
      figure.append(introduction);
    }
    figure.append(caption);
    // A source table may contain separate panels with different column headings.
    for (const block of (segment.table_markdown || '').split(/\n\s*\n/).filter(Boolean)) {
      const table = document.createElement('table');
      table.className = 'report-table';
      const rows = parseMarkdownRows(block);
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
        fallback.textContent = block;
        figure.append(fallback);
      }
      const scroll = document.createElement('div');
      scroll.className = 'table-scroll';
      scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region');
      scroll.setAttribute('aria-label', `Table: ${segment.caption || 'report data'}`);
      scroll.append(table);
      figure.append(scroll);
    }
    let sourceNotes;
    if (segment.id === 'sp413-s02393') {
      sourceNotes = document.createElement('details');
      sourceNotes.className = 'table-sources';
      const summary = document.createElement('summary');
      summary.textContent = 'Sources';
      sourceNotes.append(summary);
      figure.append(sourceNotes);
    }
    for (const note of segment.table_notes || []) {
      const paragraph = document.createElement('p');
      paragraph.className = 'table-note';
      appendLinkedText(paragraph, note, segment);
      (sourceNotes || figure).append(paragraph);
    }
    for (const uncertainty of segment.table_uncertainties || []) {
      const paragraph = document.createElement('p');
      paragraph.className = 'table-uncertainty';
      paragraph.textContent = `Transcription note: ${typeof uncertainty === 'string' ? uncertainty : JSON.stringify(uncertainty)}`;
      figure.append(paragraph);
    }
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
    const dimensions = layout.images[segment.id];
    if (dimensions) { image.width = dimensions.width; image.height = dimensions.height; }
    if (dimensions?.float) { figure.classList.add('wrap-figure'); figure.style.setProperty('--figure-width', `${dimensions.width}px`); }
    image.alt = segment.description || segment.text || '';
    image.loading = 'lazy';
    image.decoding = 'async';
    figure.append(image);
    const caption = document.createElement('figcaption');
    const captionSegments = (layout.captions?.[segment.id] || []).map(id => segmentById.get(id));
    if (segment.caption || captionSegments.length) {
      const sourceCaption = document.createElement('p');
      sourceCaption.className = 'figure-source-caption';
      sourceCaption.textContent = segment.caption || captionSegments.map(s => s.text).join(' ');
      captionSegments.forEach(s => addAnchor(sourceCaption, s.id));
      caption.append(sourceCaption);
    }
    if (segment.caption || captionSegments.length) figure.append(caption);
    return figure;
  }

  function renderOutline() {
    const nav = document.getElementById('chapter-navigation');
    nav.replaceChildren();
    for (const chapter of layout.chapters) {
      const disclosure = document.createElement('details');
      disclosure.className = 'outline-chapter';
      disclosure.dataset.chapter = chapter.number;
      const summary = document.createElement('summary');
      const link = document.createElement('a');
      link.href = `#${chapter.id}`;
      link.textContent = `Chapter ${chapter.number} — ${chapter.title}`;
      summary.append(link);
      disclosure.append(summary);
      const list = document.createElement('ol');
      let sublist;
      for (const [id, spec] of Object.entries(layout.headings).sort(([a], [b]) => readingOrder.get(a) - readingOrder.get(b))) {
        if (spec.chapter !== chapter.number || spec.level === 2 || !readable(segmentById.get(id))) continue;
        const item = document.createElement('li');
        const child = document.createElement('a');
        child.href = `#${id}`;
        child.textContent = spec.title;
        item.append(child);
        if (spec.level === 3 || !sublist) {
          list.append(item);
          sublist = document.createElement('ol');
          item.append(sublist);
        } else sublist.append(item);
      }
      disclosure.append(list);
      nav.append(disclosure);
    }
  }

  function continues(previous, next) {
    if ((layout.joins || []).some(([a, b]) => previous.id === a && next.id === b)) return true;
    if (/^[a-z]{1,2}\.$/.test(previous.text) && next.type === 'text') return true;
    if (previous.type !== 'text' || next.type !== 'text' || previous.line || next.line) return false;
    if (layout.headings[next.id] || chapterOf(previous) !== chapterOf(next)) return false;
    if (previous.paragraph_id && previous.paragraph_id === next.paragraph_id) return true;
    // Join only unfinished prose, never finished sentences, lists, equations or headings.
    return /[a-z,]$/.test(previous.text.trim()) && /^[a-z]/.test(next.text.trim())
      && previous.text.split(/\s+/).length > 5;
  }

  function renderSegments(segments) {
    segmentById = new Map(segments.map(s => [s.id, s]));
    referenceTargets = new Set(layout.references.flatMap(group => group.entries.map(entry => `ref-${group.chapter}-${entry.number}`)));
    const refMembership = new Map();
    for (const group of layout.references) {
      const start = segmentById.get(group.first).index, end = segmentById.get(group.last).index;
      for (const segment of segments) if (segment.index >= start && segment.index <= end) refMembership.set(segment.id, group);
    }
    const hidden = new Set(layout.hidden);
    const captionIds = new Set(Object.values(layout.captions || {}).flat());
    // Apply reviewed page-local reading-order repairs before joining paragraphs.
    segments = segments.flatMap((segment, index) => {
      const order = layout.order[segment.pdf_page];
      if (!order) return [segment];
      if (index && segments[index - 1].pdf_page === segment.pdf_page) return [];
      return order.map(id => segmentById.get(id));
    });
    readingOrder = new Map(segments.map((segment, index) => [segment.id, index]));
    segments = segments.filter(s => readable(s));
    visibleIds = new Set(segments.filter(s => !hidden.has(s.id)).map(s => s.id));
    const fragment = document.createDocumentFragment();
    for (const [filename, alt, height] of [
      ['sp413-cover.jpg', 'Cover of Space Settlements: A Design Study', 1579],
      ['sp413-frontispiece.jpg', 'Inside-cover star-field illustration from Space Settlements: A Design Study', 1612],
    ]) {
      const figure = document.createElement('figure');
      figure.className = 'study-figure frontispiece';
      const image = document.createElement('img');
      image.src = `images/${filename}`;
      image.alt = alt;
      image.width = 1200;
      image.height = height;
      figure.append(image);
      fragment.append(figure);
    }
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const refs = refMembership.get(segment.id);
      if (refs) {
        if (refs.first === segment.id) fragment.append(makeReferences(refs));
        continue;
      }
      if (hidden.has(segment.id)) { if (!captionIds.has(segment.id)) addAnchor(fragment, segment.id); continue; }
      pageAnchor(fragment, segment);
      if (segment.anchor && !['image','table'].includes(segment.type) && (segment.anchor !== 'appendix-b' || segment.pdf_page === 130)) addAnchor(fragment, segment.anchor);
      if (layout.headings[segment.id] || (segment.type === 'heading' && segment.pdf_page < 18)) {
        fragment.append(makeHeading(segment));
      } else if (segment.type === 'image') {
        fragment.append(makeImage(segment));
      } else if (segment.type === 'table') {
        fragment.append(makeTable(segment));
      } else {
        const group = [segment];
        const images = [];
        while (index + 1 < segments.length) {
          let nextIndex = index + 1;
          const between = [];
          while (['image', 'table'].includes(segments[nextIndex]?.type) || hidden.has(segments[nextIndex]?.id)) between.push(segments[nextIndex++]);
          const next = segments[nextIndex];
          if (!next || refMembership.has(next.id) || hidden.has(next.id) || !continues(group.at(-1), next)) break;
          images.push(...between);
          group.push(next);
          index = nextIndex;
        }
        if (images.length) {
          const flow = document.createElement('div');
          flow.className = 'reading-flow';
          images.forEach(image => {
            if (hidden.has(image.id)) { if (!captionIds.has(image.id)) addAnchor(flow, image.id); }
            else { pageAnchor(flow, image); flow.append(image.type === 'table' ? makeTable(image) : makeImage(image)); }
          });
          flow.append(makeTextGroup(group));
          fragment.append(flow);
        } else fragment.append(makeTextGroup(group));
      }
    }
    article.replaceChildren(fragment);
    renderOutline();
  }

  const readingView = document.getElementById('reading-view');
  const searchForm = document.getElementById('study-search-form');
  const searchInput = document.getElementById('study-search');
  const searchStatus = document.getElementById('search-status');
  const searchResults = document.getElementById('search-results');
  const resultList = document.getElementById('result-list');
  const cachedResults = new Map();
  let debounce;
  let pendingInput = false;
  let request;
  let revision = 0;
  let readerPosition = 0;
  let restoring = true;
  const outlineScroll = document.getElementById('outline-scroll');
  history.scrollRestoration = 'manual';

  function setSearchView(query) {
    readingView.hidden = Boolean(query);
    searchResults.hidden = !query;
    outlineScroll.hidden = Boolean(query);
  }

  function savePosition() {
    history.replaceState({ ...history.state, scrollY: window.scrollY, outlineY: outlineScroll.scrollTop,
      openOutline: [...document.querySelectorAll('.outline-chapter[open]')].map(el => el.dataset.chapter),
      openReferences: [...document.querySelectorAll('.chapter-references[open]')].map(el => el.id),
    }, '', location.href);
  }

  function pushLocation(url, saveScroll = true) {
    if (url.href === location.href) return;
    if (saveScroll) savePosition();
    history.pushState({ scrollY: 0 }, '', url);
  }

  function scrollToLocation(position) {
    restoring = true;
    requestAnimationFrame(() => {
      if (Number.isFinite(position)) {
        window.scrollTo(0, position);
      } else {
        let id;
        try { id = decodeURIComponent(location.hash.slice(1)); } catch { restoring = false; return; }
        const target = document.getElementById(id);
        if (target) {
          let ancestor = target.parentElement;
          while (ancestor) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
          const segment = segmentById.get(id);
          const chapter = segment ? chapterOf(segment) : Number(id.match(/^ref-(\d+)-/)?.[1]);
          const outline = document.querySelector(`.outline-chapter[data-chapter="${chapter}"]`);
          if (outline) outline.open = true;
          target.scrollIntoView({ block: 'start' });
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
          const reference = target.closest('li[id^="ref-"]');
          if (reference) {
            reference.classList.remove('reference-flash');
            void reference.offsetWidth;
            reference.classList.add('reference-flash');
          }
        }
      }
      requestAnimationFrame(() => { restoring = false; savePosition(); });
    });
  }

  function queryWords(query) {
    return [...new Set((query.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(word => word.length > 1))];
  }

  function appendHighlighted(parent, text, query) {
    const words = queryWords(query).sort((a, b) => b.length - a.length);
    if (!words.length) { parent.textContent = text; return; }
    // Words contain only letters and digits, so none can introduce regex syntax or HTML.
    const pattern = new RegExp(words.join('|'), 'giu');
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(end, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      parent.append(mark);
      end = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(end)));
  }

  function resultPreview(segment, query) {
    const preview = document.createElement('div');
    preview.className = `result-preview result-preview-${segment.type}`;
    if (segment.type === 'image' && segment.image_path) {
      const image = document.createElement('img');
      image.src = segment.image_path;
      image.alt = segment.caption || segment.description || '';
      image.loading = 'lazy';
      const dimensions = layout.images[segment.id];
      if (dimensions) { image.width = dimensions.width; image.height = dimensions.height; }
      preview.append(image);
    } else if (segment.type === 'table' && segment.table_markdown) {
      for (const block of segment.table_markdown.split(/\n\s*\n/).filter(Boolean)) {
        const rows = parseMarkdownRows(block);
        if (rows.length < 3) continue;
        const table = document.createElement('table');
        table.className = 'report-table';
        const head = document.createElement('thead');
        const header = document.createElement('tr');
        for (const value of rows[0]) {
          const cell = document.createElement('th');
          cell.scope = 'col';
          cell.textContent = value;
          header.append(cell);
        }
        head.append(header);
        table.append(head);
        const body = document.createElement('tbody');
        const words = queryWords(query);
        const matches = rows.slice(2).filter(row => words.some(word => row.join(' ').toLocaleLowerCase().includes(word)));
        for (const row of (matches.length ? matches : rows.slice(2)).slice(0, 6)) {
          const tr = document.createElement('tr');
          for (const value of row) {
            const cell = document.createElement('td');
            appendHighlighted(cell, value, query);
            tr.append(cell);
          }
          body.append(tr);
        }
        table.append(body);
        const scroll = document.createElement('div');
        scroll.className = 'result-table-scroll';
        scroll.append(table);
        preview.append(scroll);
      }
      const matchingNotes = (segment.table_notes || []).filter(note =>
        queryWords(query).some(word => note.toLocaleLowerCase().includes(word))).slice(0, 2);
      for (const note of matchingNotes) {
        const paragraph = document.createElement('p');
        paragraph.className = 'result-table-note';
        appendHighlighted(paragraph, note, query);
        preview.append(paragraph);
      }
    } else {
      const paragraph = document.createElement('p');
      const text = segment.text || segment.caption || segment.description || '';
      // Long extracted blocks get a window around the matching words, not their metadata.
      const matches = queryWords(query).map(word => text.toLocaleLowerCase().indexOf(word)).filter(index => index >= 0);
      let start = text.length > 800 && matches.length ? Math.max(0, Math.min(...matches) - 180) : 0;
      if (start) start = text.lastIndexOf(' ', start) + 1;
      let end = Math.min(text.length, start + 800);
      if (end < text.length) end = text.lastIndexOf(' ', end);
      appendHighlighted(paragraph, `${start ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`, query);
      preview.append(paragraph);
    }
    return preview;
  }

  function showResults(results, query, semanticAvailable) {
    resultList.replaceChildren();
    for (const result of results) {
      // The manifest has corrected full content, image paths, and tables omitted by the compact API.
      const segment = segmentById.get(result.id) || result;
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.className = 'search-result-link';
      const destination = new URL(location.href);
      destination.searchParams.delete('q');
      destination.hash = result.id;
      link.href = destination.href;
      const label = document.createElement('div');
      label.className = 'result-context';
      label.textContent = segment.type === 'table' || segment.type === 'image'
        ? segment.caption || (segment.type === 'table' ? 'Table excerpt' : 'Figure')
        : (segment.heading_context || '').split(' / ').slice(-1)[0];
      link.append(label, resultPreview(segment, query));
      if (segment.type === 'table') {
        const hint = document.createElement('div');
        hint.className = 'result-context result-more';
        hint.textContent = 'Open full table';
        link.append(hint);
      }
      link.addEventListener('click', (event) => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        clearTimeout(debounce);
        pushLocation(destination);
        applyLocation();
      });
      item.append(link);
      resultList.append(item);
    }
    searchStatus.textContent = semanticAvailable
      ? (results.length ? '' : 'No results found.')
      : (results.length ? 'Showing keyword matches. Related-word search is currently unavailable.'
        : 'No keyword matches. Related-word search is currently unavailable.');
    searchStatus.hidden = !searchStatus.textContent;
  }

  async function search(query, position) {
    const currentRevision = ++revision;
    request?.abort();
    request = new AbortController();
    const { signal } = request;
    resultList.replaceChildren();
    searchStatus.hidden = false;
    searchStatus.textContent = 'Searching…';
    try {
      await studyReady;
      if (currentRevision !== revision) return;
      let cached = cachedResults.get(query);
      if (!cached) {
        const response = await fetch(new URL('../api/study/search', document.baseURI), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, modes: ['bm25', 'semantic'], limit: 12 }),
          signal,
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Search failed');
        const seen = new Set();
        const results = [...(payload.bm25 || []), ...(payload.semantic || [])].filter((result) => {
          if (!visibleIds.has(result.id) || seen.has(result.id)) return false;
          seen.add(result.id);
          return true;
        });
        cached = { results, semanticAvailable: payload.semantic_available === true };
        cachedResults.set(query, cached);
      }
      if (currentRevision !== revision) return;
      showResults(cached.results, query, cached.semanticAvailable);
      if (Number.isFinite(position)) scrollToLocation(position);
    } catch (error) {
      if (currentRevision !== revision || error.name === 'AbortError') return;
      searchStatus.textContent = 'Search is unavailable. Please try again.';
    }
  }

  async function applyLocation(position, savedState) {
    restoring = true;
    clearTimeout(debounce);
    pendingInput = false;
    request?.abort();
    ++revision;
    const query = new URL(location.href).searchParams.get('q')?.trim() || '';
    searchInput.value = query;
    setSearchView(query);
    if (query) {
      search(query, position);
    } else {
      try { await studyReady; } catch { return; }
      // A later input or history action can supersede the pending document load.
      if (searchInput.value.trim()) return;
      if (savedState) {
        document.querySelectorAll('.outline-chapter').forEach(el => { el.open = (savedState.openOutline || []).includes(el.dataset.chapter); });
        document.querySelectorAll('.chapter-references').forEach(el => { el.open = (savedState.openReferences || []).includes(el.id); });
        outlineScroll.scrollTop = savedState.outlineY || 0;
      }
      scrollToLocation(position);
    }
  }

  function commitSearch() {
    clearTimeout(debounce);
    const query = searchInput.value.trim();
    const url = new URL(location.href);
    if (query) url.searchParams.set('q', query);
    else url.searchParams.delete('q');
    pushLocation(url, !pendingInput);
    applyLocation(query ? 0 : readerPosition);
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (!pendingInput) savePosition();
    pendingInput = true;
    if (!readingView.hidden && query) {
      readerPosition = window.scrollY;
    }
    ++revision;
    request?.abort();
    clearTimeout(debounce);
    restoring = true;
    setSearchView(query);
    resultList.replaceChildren();
    searchStatus.hidden = false;
    searchStatus.textContent = query ? 'Searching…' : '';
    debounce = setTimeout(commitSearch, 350);
  });
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    commitSearch();
  });
  window.addEventListener('popstate', (event) => applyLocation(event.state?.scrollY, event.state));
  let scrollFrame;
  function trackPosition() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => { if (!restoring && !pendingInput) savePosition(); });
  }
  window.addEventListener('scroll', trackPosition, { passive: true });
  outlineScroll.addEventListener('scroll', trackPosition, { passive: true });
  article.addEventListener('toggle', trackPosition, true);
  document.getElementById('chapter-navigation').addEventListener('toggle', trackPosition, true);
  article.addEventListener('click', (event) => {
    const link = event.target.closest('a.reference-link');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pushLocation(new URL(link.href));
    applyLocation();
  });
  document.getElementById('chapter-navigation').addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    pushLocation(new URL(link.href));
    applyLocation();
  });

  async function loadStudy() {
    try {
      const [response, layoutResponse] = await Promise.all(['segments.json', 'reader-layout.json'].map(file => fetch(new URL(file, document.baseURI), { cache: 'no-store' })));
      if (!layoutResponse.ok) throw new Error('Reader layout is unavailable');
      layout = await layoutResponse.json();
      if (!response.ok) throw new Error(`Segment data returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.segments)) throw new Error('Segment data is incomplete');
      renderSegments(payload.segments);
      readerStatus.hidden = true;
    } catch (error) {
      readerStatus.textContent = 'The study could not be loaded. Please refresh the page.';
      console.error('Study reader failed to load:', error.message);
      throw error;
    }
  }
  const studyReady = loadStudy();
  applyLocation(history.state?.scrollY, history.state);
})();
