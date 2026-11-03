// Enables Copy link on static X post cards (src/lib/x-post.mjs). Without
// JavaScript or the Clipboard API the button stays hidden and the card's other
// links still work.
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
