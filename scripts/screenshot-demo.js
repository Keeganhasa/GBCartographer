const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const rail = [...document.querySelectorAll('.app-rail button')].find((b) => b.getAttribute('aria-label')?.startsWith('Backgrounds'));
if (rail && rail.getAttribute('aria-pressed') !== 'true') { rail.click(); await wait(500); }
const card = [...document.querySelectorAll('.app-cards [title]')].find((b) => b.textContent.includes('Winter'));
card && card.click();
await wait(3000);
{ const toast = document.querySelector('.app-toast'); if (toast) toast.style.visibility = 'hidden'; }
return [document.title, [...document.querySelectorAll('.app-tab > span')].map((e) => e.textContent)];
