'use strict';

window.TreasuryWallets = {
  bind(select, onChange) {
    const announced = new Map();
    let selected = null;
    let manuallySelected = false;
    let choices = [];

    function render() {
      choices = [...announced.values()];
      if (!choices.length && typeof window.ethereum?.request === 'function') {
        choices.push({ id: 'injected', name: 'Browser wallet', provider: window.ethereum });
      }
      const previous = choices.find(item => item.provider === selected);
      const preferred = choices.find(item => item.rdns === 'io.metamask');
      const next = (manuallySelected && previous) || preferred || previous || choices[0];
      select.replaceChildren(...choices.map(item => new Option(item.name, item.id)));
      if (!next) select.add(new Option('No browser wallet detected', ''));
      select.value = next?.id || '';
      select.disabled = choices.length < 2;
      const provider = next?.provider || null;
      if (provider !== selected) {
        selected = provider;
        onChange(provider);
      }
    }

    select.addEventListener('change', () => {
      const choice = choices.find(item => item.id === select.value);
      if (!choice) return;
      manuallySelected = true;
      if (choice.provider === selected) return;
      selected = choice.provider;
      onChange(selected);
    });
    window.addEventListener('eip6963:announceProvider', event => {
      const { info, provider } = event.detail || {};
      if (typeof provider?.request !== 'function' || typeof info?.name !== 'string' ||
          !info.name.trim() || typeof info.uuid !== 'string' || !info.uuid || announced.has(info.uuid)) return;
      if ([...announced.values()].some(item => item.provider === provider)) return;
      announced.set(info.uuid, { id: info.uuid, name: info.name.slice(0, 80), rdns: info.rdns, provider });
      render();
    });
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    window.addEventListener('ethereum#initialized', render);
    render();
    return { getProvider() {
      if (!announced.size && (window.ethereum || null) !== selected) render();
      return selected;
    } };
  }
};
