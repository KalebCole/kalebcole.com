const prose = document.querySelector('.article-page .prose');
const dialog = document.querySelector('.media-dialog');

if (prose && dialog && typeof dialog.showModal === 'function') {
  const asset = dialog.querySelector('.media-dialog-asset');
  const closeButton = dialog.querySelector('.media-dialog-close');
  let sourceVideo;
  let expandedVideo;

  function openMedia(media) {
    asset.replaceChildren();
    sourceVideo = undefined;
    expandedVideo = undefined;

    if (media instanceof HTMLVideoElement) {
      sourceVideo = media;
      media.pause();
      const copy = media.cloneNode(true);
      expandedVideo = copy;
      copy.controls = true;
      copy.preload = 'metadata';
      copy.addEventListener('loadedmetadata', () => {
        copy.currentTime = media.currentTime;
      }, { once: true });
      asset.append(copy);
    } else {
      const image = new Image();
      image.src = media.currentSrc || media.src;
      image.alt = media.alt;
      image.width = media.naturalWidth || media.width;
      image.height = media.naturalHeight || media.height;
      asset.append(image);
    }

    dialog.showModal();
    closeButton.focus();
  }

  for (const image of prose.querySelectorAll('img')) {
    const media = image.parentElement?.tagName === 'PICTURE' ? image.parentElement : image;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-expand-image';
    button.setAttribute('aria-label', image.alt ? `Expand image: ${image.alt}` : 'Expand image');
    media.replaceWith(button);
    button.append(media);
    button.addEventListener('click', () => openMedia(image));
  }

  for (const video of prose.querySelectorAll('video')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'media-expand-video-wrapper';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-expand-video-button';
    button.setAttribute('aria-label', 'Expand video');
    video.replaceWith(wrapper);
    wrapper.append(video, button);
    video.controls = false;
    button.addEventListener('click', () => openMedia(video));
  }

  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (expandedVideo && sourceVideo) {
      expandedVideo.pause();
      sourceVideo.currentTime = expandedVideo.currentTime;
    }
    asset.replaceChildren();
  });
}
