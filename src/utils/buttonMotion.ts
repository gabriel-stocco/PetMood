/**
 * App-wide hover/press animations for every clickable element, using the Web Animations API.
 *
 * - Hover (mouse only): small lift + grow, scaled down for wide elements so cards don't jump.
 * - Press (pointer or Enter/Space): quick squeeze, then a springy release.
 * - Click: a ripple drawn in a fixed overlay clipped to the element's shape, so React-managed
 *   button markup is never modified.
 *
 * Animations use `composite: 'add'`, so they stack on top of any transform the element already
 * has (e.g. centering translates). Disabled elements, `[data-no-motion]` subtrees and users with
 * "reduce motion" enabled are skipped.
 */

const TARGET_SELECTOR = 'button, a[href], [role="button"], input[type="submit"], input[type="button"]';
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

interface Pose {
  y: number;
  s: number;
}

interface MotionState {
  anim: Animation | null;
  from: Pose;
  to: Pose;
  hovered: boolean;
  pressed: boolean;
}

const REST: Pose = { y: 0, s: 1 };
const states = new WeakMap<Element, MotionState>();

function findTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  const el = node.closest<HTMLElement>(TARGET_SELECTOR);
  if (!el || el.closest('[data-no-motion]')) return null;
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return null;
  return el;
}

function stateOf(el: Element): MotionState {
  let state = states.get(el);
  if (!state) {
    state = { anim: null, from: REST, to: REST, hovered: false, pressed: false };
    states.set(el, state);
  }
  return state;
}

/** Current on-screen pose, interpolated from the running animation's eased progress. */
function currentPose(state: MotionState): Pose {
  const progress = state.anim?.effect?.getComputedTiming().progress;
  const t = typeof progress === 'number' ? progress : state.anim ? 1 : 0;
  return {
    y: state.from.y + (state.to.y - state.from.y) * t,
    s: state.from.s + (state.to.s - state.from.s) * t,
  };
}

function transformOf(pose: Pose): string {
  return `translateY(${pose.y.toFixed(2)}px) scale(${pose.s.toFixed(4)})`;
}

function animateTo(el: HTMLElement, to: Pose, duration: number, easing: string): void {
  const state = stateOf(el);
  const from = currentPose(state);
  const previous = state.anim;
  const anim = el.animate([{ transform: transformOf(from) }, { transform: transformOf(to) }], {
    duration,
    easing,
    fill: 'forwards',
    composite: 'add',
  });
  previous?.cancel();
  state.anim = anim;
  state.from = from;
  state.to = to;
  if (to.y === 0 && to.s === 1) {
    // Back at rest: drop the filled animation so it doesn't linger on the element.
    anim.onfinish = () => {
      if (state.anim === anim) {
        anim.cancel();
        state.anim = null;
        state.from = REST;
        state.to = REST;
      }
    };
  }
}

/** Hover/press amounts shrink for big elements: ~4px of growth at most. */
function hoverPose(el: HTMLElement): Pose {
  const size = Math.max(el.offsetWidth, el.offsetHeight, 1);
  return { y: size > 160 ? -1 : -1.5, s: 1 + Math.min(0.04, 4 / size) };
}

function pressPose(el: HTMLElement): Pose {
  const size = Math.max(el.offsetWidth, el.offsetHeight, 1);
  return { y: 0, s: 1 - Math.min(0.06, 8 / size) };
}

function settle(el: HTMLElement): void {
  const state = stateOf(el);
  if (state.pressed) return;
  if (state.hovered) animateTo(el, hoverPose(el), 420, SPRING);
  else animateTo(el, REST, 380, SPRING);
}

function press(el: HTMLElement): void {
  const state = stateOf(el);
  state.pressed = true;
  animateTo(el, pressPose(el), 110, 'cubic-bezier(0.2, 0, 0.4, 1)');
}

function release(el: HTMLElement): void {
  const state = states.get(el);
  if (!state?.pressed) return;
  state.pressed = false;
  settle(el);
}

function ripple(el: HTMLElement, clientX?: number, clientY?: number): void {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const style = getComputedStyle(el);

  const clip = document.createElement('div');
  clip.setAttribute('aria-hidden', 'true');
  Object.assign(clip.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: style.borderRadius,
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: '2147483647',
  });

  const x = (clientX ?? rect.left + rect.width / 2) - rect.left;
  const y = (clientY ?? rect.top + rect.height / 2) - rect.top;
  const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
  const dot = document.createElement('span');
  Object.assign(dot.style, {
    position: 'absolute',
    left: `${x - radius}px`,
    top: `${y - radius}px`,
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
    borderRadius: '50%',
    background: style.color || 'currentColor',
  });

  clip.appendChild(dot);
  document.body.appendChild(clip);
  dot
    .animate(
      [
        { transform: 'scale(0)', opacity: 0.28 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      { duration: 560, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)', fill: 'forwards' }
    )
    .finished.catch(() => undefined)
    .finally(() => clip.remove());
}

let installed = false;

export function installButtonMotion(): void {
  if (installed || typeof window === 'undefined' || typeof Element.prototype.animate !== 'function') return;
  installed = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const enabled = () => !reduceMotion.matches;

  document.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse' || !enabled()) return;
    const el = findTarget(event.target);
    if (!el) return;
    const state = stateOf(el);
    if (state.hovered) return;
    state.hovered = true;
    settle(el);
  });

  document.addEventListener('pointerout', (event) => {
    const el = findTarget(event.target);
    if (!el) return;
    if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
    const state = states.get(el);
    if (!state?.hovered) return;
    state.hovered = false;
    state.pressed = false;
    settle(el);
  });

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !enabled()) return;
    const el = findTarget(event.target);
    if (!el) return;
    press(el);
    ripple(el, event.clientX, event.clientY);

    const done = () => {
      window.removeEventListener('pointerup', done, true);
      window.removeEventListener('pointercancel', done, true);
      release(el);
    };
    window.addEventListener('pointerup', done, true);
    window.addEventListener('pointercancel', done, true);
  });

  document.addEventListener('keydown', (event) => {
    if (event.repeat || (event.key !== 'Enter' && event.key !== ' ') || !enabled()) return;
    const el = findTarget(event.target);
    if (!el || el !== document.activeElement) return;
    press(el);
    ripple(el);
  });

  document.addEventListener('keyup', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const el = findTarget(event.target);
    if (el) release(el);
  });

  // Element lost focus mid-press (e.g. a screen change): don't leave it squeezed.
  document.addEventListener(
    'blur',
    (event) => {
      const el = findTarget(event.target);
      if (el) release(el);
    },
    true
  );
}
