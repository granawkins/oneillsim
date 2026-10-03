"use client";
import { useEffect, useRef } from 'react';
import { mountStudyReader } from '../../study/study.js';

export default function StudyReader() {
  const root = useRef(null);
  useEffect(() => mountStudyReader(root.current), []);
  return <div ref={root} className="study-page" id="top">
    <header className="study-header"><h1>Space Settlements: A Design Study</h1></header>
    <main className="study-layout">
      <aside className="study-sidebar" aria-label="Report navigation">
        <form id="study-search-form" role="search">
          <input id="study-search" name="q" type="search" aria-label="Search the study" placeholder="Search the study" autoComplete="off" maxLength={400}/>
          <button type="submit">Search</button>
        </form>
        <div id="outline-scroll" className="outline-scroll">
          <nav id="chapter-navigation" aria-label="Chapters"/>
          <a className="source-link" href="https://ntrs.nasa.gov/api/citations/19770014162/downloads/19770014162.pdf" target="_blank" rel="noopener">Original document at NASA ↗</a>
        </div>
      </aside>
      <div className="study-content">
        <section id="search-results" className="search-results" aria-label="Search results" hidden>
          <p id="search-status" role="status"/><ol id="result-list"/>
        </section>
        <div id="reading-view">
          <p id="reader-status" role="status">Loading…</p>
          <article id="study-article" aria-label="Space Settlements: A Design Study"/>
          <noscript>This reader needs JavaScript to display the study.</noscript>
        </div>
      </div>
    </main>
  </div>;
}
