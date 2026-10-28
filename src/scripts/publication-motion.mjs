import { isHomeLayoutSettling, onHomeLayoutSettled } from './home-breakpoint-motion.mjs';

export const PUBLICATION_MOTION_DURATION = 430;
export const PUBLICATION_MOTION_STAGGER = 55;
export const PUBLICATION_MOTION_EASING = 'cubic-bezier(.2, .8, .2, 1)';
export const PUBLICATION_MOTION_MOBILE_BREAKPOINT = 760;
export const PUBLICATION_MOTION_MEDIA = `(max-width: ${PUBLICATION_MOTION_MOBILE_BREAKPOINT}px)`;

export function buildPublicationKeyframes(index, narrowScreen) {
  const translate = narrowScreen
    ? '0 34px'
    : index % 2 === 0 ? '-34px 0' : '34px 0';

  return [
    { opacity: 0, filter: 'blur(2px)', translate },
    { opacity: 1, filter: 'blur(0)', translate: '0 0' },
  ];
}

export function publicationMotionDelay(index) {
  return Math.min(index * PUBLICATION_MOTION_STAGGER, PUBLICATION_MOTION_STAGGER);
}

export function initProjectPointerMotion(root = document, browserWindow = window, reducedMotion) {
  if (!root || typeof root.querySelectorAll !== 'function' || typeof browserWindow?.matchMedia !== 'function') return () => {};

  const motionPreference = reducedMotion ?? browserWindow.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionPreference.matches) return () => {};

  const rows = Array.from(root.querySelectorAll('.project-index-row')).filter((row) => (
    typeof row?.addEventListener === 'function'
    && typeof row?.removeEventListener === 'function'
    && typeof row?.style?.setProperty === 'function'
    && typeof row?.getBoundingClientRect === 'function'
  ));
  const listeners = [];
  const clamp = (value) => Math.max(-1, Math.min(1, value));

  for (const row of rows) {
    const reset = () => {
      row.style.setProperty('--motion-x', '0');
      row.style.setProperty('--motion-y', '0');
    };
    const track = (event) => {
      if (event.pointerType !== 'mouse') return;
      const { left, top, width, height } = row.getBoundingClientRect();
      const x = width ? clamp(((event.clientX - left) / width - .5) * 2) : 0;
      const y = height ? clamp(((event.clientY - top) / height - .5) * 2) : 0;
      row.style.setProperty('--motion-x', String(x));
      row.style.setProperty('--motion-y', String(y));
    };
    row.addEventListener('pointermove', track, { passive: true });
    row.addEventListener('pointerleave', reset, { passive: true });
    listeners.push([row, track, reset]);
  }

  return () => {
    for (const [row, track, reset] of listeners) {
      row.removeEventListener('pointermove', track);
      row.removeEventListener('pointerleave', reset);
    }
  };
}

export function initPublicationMotion(root = document, browserWindow = window) {
  if (
    !root
    || typeof root.querySelectorAll !== 'function'
    || typeof browserWindow?.matchMedia !== 'function'
    || typeof browserWindow?.IntersectionObserver !== 'function'
  ) return () => {};

  const reducedMotion = browserWindow.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches) return () => {};

  const beats = Array.from(root.querySelectorAll('[data-motion-beat]'));
  if (beats.some((element) => typeof element?.animate !== 'function')) return () => {};

  const cleanupPointerMotion = initProjectPointerMotion(root, browserWindow, reducedMotion);
  const narrowScreen = browserWindow.matchMedia(PUBLICATION_MOTION_MEDIA);
  const viewportHeight = browserWindow.innerHeight;
  const targets = beats.filter((element) => (
    element.getBoundingClientRect().top >= viewportHeight
  ));
  const targetIndexes = new Map(beats.map((target, index) => [target, index]));
  const animatedTargets = new Set();
  const animations = new Set();
  const deferredEntries = new Map();
  let disposed = false;
  let unsubscribeLayoutSettle = () => {};

  let observer;
  const runEntries = (entries) => {
    for (const entry of entries) {
      const { target } = entry;
      if (disposed || !entry.isIntersecting || !targetIndexes.has(target) || animatedTargets.has(target)) continue;
      if (isHomeLayoutSettling(target)) {
        deferredEntries.set(target, entry);
        unsubscribeLayoutSettle();
        const unsubscribe = onHomeLayoutSettled(() => {
          unsubscribe();
          if (unsubscribeLayoutSettle === unsubscribe) unsubscribeLayoutSettle = () => {};
          const entriesToRetry = [...deferredEntries.values()];
          deferredEntries.clear();
          runEntries(entriesToRetry);
        });
        unsubscribeLayoutSettle = unsubscribe;
        continue;
      }

      let animation;
      try {
        animation = target.animate(
          buildPublicationKeyframes(targetIndexes.get(target), narrowScreen.matches),
          {
            duration: PUBLICATION_MOTION_DURATION,
            easing: PUBLICATION_MOTION_EASING,
            delay: publicationMotionDelay(targetIndexes.get(target)),
            fill: 'both',
          },
        );
      } catch {
        continue;
      }

      animatedTargets.add(target);
      observer.unobserve(target);
      if (animation && typeof animation.cancel === 'function') animations.add(animation);
    }
  };
  observer = new browserWindow.IntersectionObserver(runEntries);

  for (const target of targets) observer.observe(target);

  return () => {
    disposed = true;
    deferredEntries.clear();
    unsubscribeLayoutSettle();
    cleanupPointerMotion();
    observer.disconnect();
    for (const animation of animations) animation.cancel();
    animations.clear();
  };
}
