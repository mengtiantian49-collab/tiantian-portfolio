const orbit = document.querySelector('.orbit');
const projects = [...orbit.querySelectorAll('.project')];
const controls = document.querySelector('.orbit-nav');
const reader = document.querySelector('.reader');
const readerPages = reader.querySelector('.reader-pages');
const readerTitle = reader.querySelector('#reader-title');
const pdfLink = reader.querySelector('#open-pdf');
const closeButton = reader.querySelector('.reader-close');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const autoplay = document.querySelector('#autoplay');
const slides = new Map();
const length = projects.length;
const slideDuration = 620;
let center = 0;
let cleanupTimer;
let playing = !reducedMotion.matches;
let pointerOver = false;
let inView = false;
let activeProject;
let entrance;

function position(card, slot) {
  const distance = Math.abs(slot);
  card.style.setProperty('--x', `calc(${slot} * var(--step))`);
  card.style.setProperty('--y', `calc(${distance === 0 ? 0 : distance * 1.35 - .35} * var(--drop))`);
  card.style.setProperty('--tilt', `${slot * 6}deg`);
  card.style.setProperty('--size', String(Math.max(.54, 1 - distance * .18)));
  card.style.setProperty('--layer', String(Math.max(0, 3 - distance)));
  card.style.setProperty('--visibility', distance > 2 ? '0' : '1');
  card.toggleAttribute('data-edge', distance > 2);

  // Outer previews can be clipped and can duplicate the same project.
  const secondary = distance > 1;
  card.tabIndex = secondary ? -1 : 0;
  if (secondary) card.setAttribute('aria-hidden', 'true');
  else card.removeAttribute('aria-hidden');
}

function createSlide(index, slot) {
  const projectIndex = ((index % length) + length) % length;
  const card = projects[projectIndex].cloneNode(true);
  card.dataset.project = projectIndex;
  const cover = document.createElement('img');
  cover.className = 'project-cover';
  cover.src = new URL('page-01.jpg', card.href).href;
  cover.alt = '';
  cover.draggable = false;
  card.querySelector('.file-icon').replaceWith(cover);
  position(card, slot);
  slides.set(index, card);
  // Keep tab order consistent with the visible row.
  const nextCard = slides.get(index + 1);
  orbit.insertBefore(card, nextCard ?? null);
}

function trimSlides() {
  for (const [index, card] of slides) {
    if (Math.abs(index - center) <= 2 || card === activeProject && reader.open) continue;
    if (card === document.activeElement) slides.get(center)?.focus({ preventScroll: true });
    card.remove();
    slides.delete(index);
  }
}

function advance(direction) {
  if (reader.open) return;
  clearTimeout(cleanupTimer);
  const incoming = center + 3 * direction;
  if (!slides.has(incoming)) {
    createSlide(incoming, 3 * direction);
    // Commit the offstage position before moving the new cover into view.
    slides.get(incoming).getBoundingClientRect();
  }
  center += direction;
  const focused = [...slides].find(([, card]) => card === document.activeElement);
  if (focused && Math.abs(focused[0] - center) > 1) {
    const current = slides.get(center);
    position(current, 0);
    current.focus({ preventScroll: true });
  }
  for (const [index, card] of slides) position(card, index - center);
  cleanupTimer = setTimeout(trimSlides, reducedMotion.matches ? 0 : slideDuration);
}

function updatePlayback() {
  autoplay.textContent = playing ? 'Pause' : 'Play';
}

function openReader(project) {
  activeProject = project;
  const card = project.getBoundingClientRect();
  const title = project.querySelector('h3').textContent;
  const folder = new URL('.', project.href);
  const pages = document.createDocumentFragment();
  const total = Number(project.dataset.pages);

  for (let page = 1; page <= total; page++) {
    const image = document.createElement('img');
    image.src = new URL(`page-${String(page).padStart(2, '0')}.jpg`, folder).href;
    image.alt = `${title}, page ${page} of ${total}`;
    image.loading = page === 1 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.width = Number(project.dataset.pageWidth);
    image.height = Number(project.dataset.pageHeight);
    image.addEventListener('error', () => {
      const message = document.createElement('p');
      message.className = 'reader-page-error';
      message.textContent = `Page ${page} could not load. Use Open PDF to read the document.`;
      image.replaceWith(message);
    }, { once: true });
    pages.append(image);
  }

  readerTitle.textContent = title;
  pdfLink.href = project.href;
  readerPages.replaceChildren(pages);
  reader.showModal();
  readerPages.scrollTop = 0;
  if (reducedMotion.matches) return;

  const panel = reader.getBoundingClientRect();
  const x = (card.x + card.width / 2 - panel.x - panel.width / 2) * .24;
  const y = (card.y + card.height / 2 - panel.y - panel.height / 2) * .24;
  entrance = reader.animate([
    { opacity: 0, transform: `translate(${x}px,${y}px) scale(.9)` },
    { opacity: 1, transform: 'none' }
  ], { duration: 350, easing: 'cubic-bezier(.22,.78,.24,1)' });
}

async function closeReader() {
  if (reader.hasAttribute('data-closing')) return;
  reader.setAttribute('data-closing', '');
  entrance?.cancel();
  if (!reducedMotion.matches) {
    await reader.animate([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(10px) scale(.97)' }
    ], { duration: 190, easing: 'ease-in', fill: 'forwards' }).finished;
  }
  reader.close();
}

if (typeof reader.showModal === 'function') {
  projects.forEach(project => project.setAttribute('aria-haspopup', 'dialog'));
  orbit.addEventListener('click', event => {
    const project = event.target.closest('.project');
    if (!project || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openReader(project);
  });
  closeButton.addEventListener('click', closeReader);
  reader.addEventListener('cancel', event => {
    event.preventDefault();
    closeReader();
  });
  reader.addEventListener('click', event => {
    if (event.target !== reader) return;
    const rect = reader.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) closeReader();
  });
  reader.addEventListener('close', () => {
    reader.getAnimations().forEach(animation => animation.cancel());
    reader.removeAttribute('data-closing');
    readerPages.replaceChildren();
    activeProject?.focus({ preventScroll: true });
  });
}

orbit.replaceChildren();
orbit.dataset.ready = '';
for (let index = -2; index <= 2; index++) createSlide(index, index);
controls.hidden = false;
updatePlayback();

document.querySelector('#previous').addEventListener('click', () => advance(-1));
document.querySelector('#next').addEventListener('click', () => advance(1));
autoplay.addEventListener('click', () => {
  playing = !playing;
  updatePlayback();
});
orbit.addEventListener('pointerenter', event => { pointerOver = event.pointerType === 'mouse'; });
orbit.addEventListener('pointerleave', () => { pointerOver = false; });
orbit.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  advance(event.key === 'ArrowRight' ? 1 : -1);
});

new IntersectionObserver(([entry]) => {
  inView = entry.intersectionRatio >= .35;
}, { threshold: .35 }).observe(orbit);

reducedMotion.addEventListener('change', event => {
  if (event.matches) {
    playing = false;
    updatePlayback();
  }
});

setInterval(() => {
  if (playing && inView && !pointerOver && !document.hidden &&
      !orbit.contains(document.activeElement) && !reader.open) advance(1);
}, 4200);
