/** Entry point: the game by default, the engine sandbox with `?sandbox`. */
const sandbox = new URLSearchParams(location.search).has('sandbox');

if (!sandbox) document.body.classList.add('game');

// The Flows build (vite --mode flows) reads the sprites from CDF; other builds never load this code.
const assetsReady = import.meta.env.VITE_ASSET_SOURCE === 'cdf' ? import('../flows').then((m) => m.connectFlows()) : Promise.resolve();

const run = assetsReady.then(() => sandbox
  ? import('./sandbox').then((m) => {
      document.getElementById('loading')?.remove();
      return m.startSandbox();
    })
  : import('./play').then((m) => m.startGame(document.getElementById('app')!)));

run.catch((err) => {
  console.error(err);
  document.getElementById('loading')?.remove();
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">${String(err)}</pre>`);
});
