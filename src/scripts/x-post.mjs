// First-party enhancements for static X post cards (src/lib/x-post.mjs).
// Post.astro inlines this only on Writing pages that contain a card.
// Without JavaScript the cards keep their UTC time and hide Copy link.

// Show each post time in the reader's own time zone, in X's style:
// "6:47 PM PDT · Oct 7, 2026". The server renders the same length in UTC,
// so the swap stays on one line and does not shift layout.
const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
for (const time of document.querySelectorAll('.x-post time[data-x-post-time]')) {
  const date = new Date(time.dateTime);
  if (!Number.isNaN(date.getTime())) time.textContent = `${clock.format(date)} · ${day.format(date)}`;
}

// Copy link needs the Clipboard API, so the button stays hidden without it.
if (navigator.clipboard?.writeText) {
  for (const button of document.querySelectorAll('[data-x-post-copy]')) {
    const label = button.querySelector('.x-post-copy-label');
    let reset;
    button.hidden = false;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.xPostCopy);
        label.textContent = 'Link copied';
      } catch {
        label.textContent = 'Copy failed';
      }
      clearTimeout(reset);
      reset = setTimeout(() => { label.textContent = 'Copy link'; }, 2500);
    });
  }
}
