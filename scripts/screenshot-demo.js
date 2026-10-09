const rail = [...document.querySelectorAll('.gbp-rail .icon-button')].find((b) => b.getAttribute('aria-label')?.startsWith('Backgrounds'));
rail && rail.click();
await new Promise((r) => setTimeout(r, 500));
const row = [...document.querySelectorAll('.gbp-asset')].find((b) => b.textContent.includes('Winter'));
row && row.click();
await new Promise((r) => setTimeout(r, 3000));
{ const toast = document.querySelector('.gbp-toast'); if (toast) toast.style.visibility = 'hidden'; }
return [document.title, [...document.querySelectorAll('.map-tab span')].map((e) => e.textContent)];
