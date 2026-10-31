import { createCrowd } from './crowd.js';
import { parseCount, formatCount, formatZoom, meetingTime } from './numbers.js';

const $ = (selector) => document.querySelector(selector);
const input = $('#people-input');
const canvas = $('#crowd');
const dialog = $('#about-dialog');
const tooltip = $('#person-tooltip');
const error = $('#input-error');
let currentCount = 1000;
let toastTimer;

const crowd = createCrowd(canvas, {
  onViewChange(state) {
    $('#zoom-label').textContent = formatZoom(state.zoom);
    $('#zoom-label').title = `${Math.round(state.zoom * 100).toLocaleString('en-US')}% of the fitted view`;
    $('#density-note').hidden = !state.density || state.count === 0;
    $('#zoom-out').disabled = state.isFit || state.count === 0;
    $('#zoom-in').disabled = state.count === 0;
    $('#fit-button').disabled = state.count === 0;
  },
  onInspect(info) {
    tooltip.hidden = !info;
    if (!info) return;
    tooltip.textContent = `Person ${formatCount(info.index)}`;
    const maxX = canvas.clientWidth - tooltip.offsetWidth - 10;
    tooltip.style.left = `${Math.max(10, Math.min(info.x + 15, maxX))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(info.y - 34, canvas.clientHeight - 35))}px`;
  }
});

function setCount(count, updateURL = true) {
  currentCount = count;
  const formatted = formatCount(count);
  input.value = formatted;
  input.removeAttribute('aria-invalid');
  error.textContent = '';
  $('#count-heading').textContent = formatted;
  $('#people-label').textContent = count === 1 ? 'person' : 'people';
  $('#result-status').textContent = `${formatted} ${count === 1 ? 'person' : 'people'} in the crowd.`;
  $('#empty-state').hidden = count !== 0;
  $('#perspective-text').replaceChildren();
  if (count === 0) $('#perspective-text').textContent = 'An empty crowd. A fresh start. Add a number and see who shows up.';
  else {
    const strong = document.createElement('strong');
    strong.textContent = `${meetingTime(count)}.`;
    $('#perspective-text').append('If you met one person every second, meeting this crowd would take ', strong);
  }
  canvas.setAttribute('aria-label', `An exact grid of ${formatted} ${count === 1 ? 'person' : 'people'}. Use plus and minus to zoom, zero to fit, or drag to explore.`);
  document.querySelectorAll('[data-count]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.count) === count)));
  crowd.setCount(count);
  if (updateURL) {
    const url = new URL(location.href);
    url.searchParams.set('n', String(count));
    try { history.replaceState(null, '', url); } catch { /* Sandboxed previews may restrict history. */ }
  }
}

$('#number-form').addEventListener('submit', event => {
  event.preventDefault();
  try { setCount(parseCount(input.value)); }
  catch (problem) {
    error.textContent = problem.message;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
});
input.addEventListener('input', () => { error.textContent = ''; input.removeAttribute('aria-invalid'); });
document.querySelectorAll('[data-count]').forEach(button => button.addEventListener('click', () => setCount(Number(button.dataset.count))));
$('#zoom-in').addEventListener('click', () => crowd.zoomIn());
$('#zoom-out').addEventListener('click', () => crowd.zoomOut());
$('#fit-button').addEventListener('click', () => crowd.fit());
$('#see-person').addEventListener('click', () => { crowd.focusPerson(); canvas.focus({preventScroll:true}); });
canvas.addEventListener('keydown', event => {
  if (['+', '=', '-', '_', '0', 'Home'].includes(event.key)) {
    event.preventDefault();
    if (['+', '='].includes(event.key)) crowd.zoomIn();
    else if (['-', '_'].includes(event.key)) crowd.zoomOut();
    else crowd.fit();
  }
});
function showAbout() { dialog.showModal(); }
$('#about-button').addEventListener('click', showAbout);
$('#how-button').addEventListener('click', showAbout);
$('#close-dialog').addEventListener('click', () => dialog.close());
$('#dialog-done').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
$('#share-button').addEventListener('click', async () => {
  const url = new URL(location.href);
  url.searchParams.set('n', String(currentCount));
  try {
    await navigator.clipboard.writeText(url.href);
    toast('Link copied. A little perspective to pass on.');
  } catch {
    input.focus();
    toast('Copy the page address to share this crowd.');
  }
});

let initialCount = 1000;
const query = new URL(location.href).searchParams.get('n');
if (query !== null) {
  try { initialCount = parseCount(query); }
  catch { toast('That link had an invalid count. Here are 1,000 people instead.'); }
}
setCount(initialCount, false);
