// HUD: the DOM layer. sync() runs every frame but only touches the DOM when a
// value actually changed. The buy menu, scoreboard, banners, channel bar and
// overlays are all plain DOM over the canvas; the crosshair gap mirrors the live
// weapon spread so the player sees what the simulation will do.
import { WEAPONS, NADES, ARMOR_PRICE, spreadFor } from './weapons.js';
import { TEAM_NAME, BUY_TIME, PLANT_TIME, DEFUSE_TIME, aliveOf } from './state.js';

export const BUY_ITEMS = [
  { key: '1', item: 'smg', label: 'Kestrel SMG', price: WEAPONS.smg.price },
  { key: '2', item: 'rifle', label: 'VK-7 Carbine', price: WEAPONS.rifle.price },
  { key: '3', item: 'marksman', label: 'Longshot DMR', price: WEAPONS.marksman.price },
  { key: '4', item: 'armor', label: 'Kevlar Vest', price: ARMOR_PRICE },
  { key: '5', item: 'he', label: 'HE Charge', price: NADES.he.price },
  { key: '6', item: 'smoke', label: 'Veil Smoke', price: NADES.smoke.price },
  { key: '7', item: 'flash', label: 'Starburst Flash', price: NADES.flash.price },
];

function $(id) {
  return document.getElementById(id);
}

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function createHud(hooks) {
  const el = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    vignette: $('damage-vignette'),
    flash: $('flash-overlay'),
    health: $('health-num'),
    healthBar: $('health-bar-fill'),
    armor: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    weapon: $('weapon-name'),
    reload: $('reload-note'),
    money: $('money'),
    timer: $('timer'),
    round: $('round-num'),
    scoreVg: $('score-vg'),
    scoreWd: $('score-wd'),
    aliveVg: $('alive-vg'),
    aliveWd: $('alive-wd'),
    bomb: $('bomb-status'),
    nades: $('nade-row'),
    feed: $('feed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    channel: $('channel'),
    channelFill: $('channel-fill'),
    channelLabel: $('channel-label'),
    hint: $('hint'),
    buy: $('buy-menu'),
    buyRows: $('buy-rows'),
    buyNote: $('buy-note'),
    scoreboard: $('scoreboard'),
    scoreRows: $('score-rows'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play'),
    deadNote: $('dead-note'),
  };
  const last = {};
  let hitAt = -99;
  let hitKill = false;
  let hintUntil = 0;
  let hintText = '';
  let feedKey = '';

  function set(key, node, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  function setVisible(key, node, visible) {
    if (last[key] === visible) return;
    last[key] = visible;
    node.hidden = !visible;
  }

  for (const item of BUY_ITEMS) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'buy-row';
    row.dataset.item = item.item;
    row.innerHTML = `<kbd>${item.key}</kbd><span class="buy-label">${item.label}</span><span class="buy-price">$${item.price}</span>`;
    row.addEventListener('click', () => hooks.onBuy(item.item));
    el.buyRows.appendChild(row);
  }
  $('buy-close').addEventListener('click', () => hooks.onCloseBuy());

  const hud = {
    buyOpen: false,
    overlayKind: 'start',

    showOverlay(kind, data) {
      hud.overlayKind = kind;
      if (kind === 'start') {
        el.overlayTitle.textContent = 'SANDLINE PROTOCOL';
        el.overlayCopy.textContent = 'A round-based tactical shooter in the Helios Yard solar farm. Plant the surge charge or wipe the Wardens — first to 5 rounds takes the match.';
        el.playBtn.textContent = 'Click to play';
      } else if (kind === 'paused') {
        el.overlayTitle.textContent = 'Paused';
        el.overlayCopy.textContent = 'The round waits for no one. Click to jump back in.';
        el.playBtn.textContent = 'Resume';
      } else if (kind === 'end') {
        const won = data && data.winner === data.playerTeam;
        el.overlayTitle.textContent = data && !data.winner ? 'Match drawn' : won ? 'Match won' : 'Match lost';
        el.overlayCopy.textContent = data ? data.summary : '';
        el.playBtn.textContent = 'Play again';
      }
      el.overlay.hidden = false;
    },

    hideOverlay() {
      el.overlay.hidden = true;
    },

    openBuy() {
      hud.buyOpen = true;
      el.buy.hidden = false;
    },

    closeBuy() {
      hud.buyOpen = false;
      el.buy.hidden = true;
    },

    flashHint(text, dur) {
      hintText = text;
      hintUntil = performance.now() / 1000 + (dur ?? 2.5);
    },

    sync(state, input) {
      const p = state.player;
      const time = state.time;
      for (const event of state.events) {
        if (event.kind === 'hitmark') {
          hitAt = time;
          hitKill = event.kill;
        }
      }
      const markerHold = state.shotMode ? 4000 : 0.09;
      const markerOn = time - hitAt < markerHold;
      setVisible('marker', el.hitmarker, markerOn);
      el.hitmarker.classList.toggle('kill', hitKill && markerOn);

      const spread = p.alive
        ? spreadFor(WEAPONS[p.weapon], p.moving, p.crouched, !p.onGround, p.bloom)
        : 0;
      const gap = Math.round(3 + Math.min(0.12, spread) * 190);
      if (last.gap !== gap) {
        last.gap = gap;
        el.crosshair.style.setProperty('--sp', `${gap}px`);
      }

      const hurt = Math.max(0, 1 - (time - p.hurtAt) * 1.6);
      const lowHp = p.alive ? Math.max(0, (40 - p.hp) / 40) * 0.35 : 0;
      const vig = Math.min(0.7, hurt * 0.5 + lowHp);
      if (last.vig !== vig) {
        last.vig = vig;
        el.vignette.style.opacity = vig.toFixed(2);
      }
      const flashOp = Math.min(1, Math.max(0, p.flash));
      if (last.flash !== flashOp) {
        last.flash = flashOp;
        el.flash.style.opacity = flashOp.toFixed(2);
      }

      set('hp', el.health, String(Math.max(0, Math.ceil(p.hp))));
      set('armor', el.armor, String(Math.ceil(p.armor)));
      const hpPct = Math.max(0, p.hp);
      if (last.hpPct !== hpPct) {
        last.hpPct = hpPct;
        el.healthBar.style.width = `${hpPct}%`;
      }
      set('mag', el.ammoMag, String(p.mag));
      set('reserve', el.ammoReserve, `/ ${p.reserve}`);
      set('weapon', el.weapon, WEAPONS[p.weapon].name);
      setVisible('reload', el.reload, p.reloading > 0);
      set('money', el.money, `$${p.money}`);
      set('round', el.round, `Round ${state.round.n}/9`);
      set('svg', el.scoreVg, String(state.round.wins.VG));
      set('swd', el.scoreWd, String(state.round.wins.WD));
      set('avg', el.aliveVg, String(aliveOf(state, 'VG')));
      set('awd', el.aliveWd, String(aliveOf(state, 'WD')));

      let timerText;
      let timerHot = false;
      if (state.round.phase === 'buy') {
        timerText = `BUY ${fmtTime(state.round.timer)}`;
      } else if (state.round.phase === 'planted') {
        timerText = `FUSE ${fmtTime(state.bomb.fuse)}`;
        timerHot = true;
      } else if (state.round.phase === 'ended') {
        timerText = '—';
      } else {
        timerText = fmtTime(state.round.timer);
        timerHot = state.round.timer < 15;
      }
      set('timer', el.timer, timerText);
      el.timer.classList.toggle('hot', timerHot);

      let bombText = 'Charge: —';
      if (state.bomb.state === 'held') bombText = state.bomb.holder === 'player' ? 'Charge: YOU CARRY IT' : 'Charge: teammate carries it';
      else if (state.bomb.state === 'dropped') bombText = 'Charge: DROPPED';
      else if (state.bomb.state === 'planted') bombText = `Charge: PLANTED @ ${state.bomb.site}`;
      set('bomb', el.bomb, bombText);
      el.bomb.classList.toggle('hot', state.bomb.state === 'planted');

      const nadeText = ['he', 'smoke', 'flash']
        .map((t) => `${p.nadeSel === t ? '▸' : '·'} ${NADES[t].name.split(' ')[0]} ×${p.nades[t]}`)
        .join('  ');
      set('nades', el.nades, `G throw — ${nadeText}`);

      const key = state.feed.length > 0 ? `${state.feed.length}:${state.feed[0].text}` : 'empty';
      if (key !== feedKey) {
        feedKey = key;
        el.feed.innerHTML = '';
        for (const entry of state.feed) {
          const div = document.createElement('div');
          div.className = 'feed-entry';
          div.textContent = entry.text;
          el.feed.appendChild(div);
        }
      }

      const banner = state.banner;
      const bannerOn = banner && time - banner.t < banner.dur;
      setVisible('banner', el.banner, !!bannerOn);
      if (bannerOn) {
        set('btitle', el.bannerTitle, banner.text);
        set('bsub', el.bannerSub, banner.sub);
      }

      const channel = p.channel;
      setVisible('channel', el.channel, !!channel);
      if (channel) {
        const need = channel.kind === 'plant' ? PLANT_TIME : DEFUSE_TIME;
        const pct = Math.min(100, (channel.t / need) * 100);
        if (last.chanPct !== Math.round(pct)) {
          last.chanPct = Math.round(pct);
          el.channelFill.style.width = `${pct}%`;
        }
        set('chanLabel', el.channelLabel, channel.kind === 'plant' ? 'Planting surge charge…' : 'Defusing surge charge…');
      }

      let hint = '';
      if (performance.now() / 1000 < hintUntil) {
        hint = hintText;
      } else if (state.round.phase === 'buy') {
        hint = 'Press B to buy — round starts soon';
      } else if (p.alive && state.bomb.holder === 'player' && state.bomb.state === 'held'
        && (inSite(p.pos, { x: 20, z: -16, r: 6 }) || inSite(p.pos, { x: 20, z: 16, r: 6 }))) {
        hint = 'Hold E to plant the surge charge';
      } else if (p.alive && state.bomb.state === 'planted' && p.team === 'WD') {
        hint = 'Get to the charge and hold E to defuse';
      }
      set('hint', el.hint, hint);
      setVisible('hint', el.hint, hint !== '');

      setVisible('dead', el.deadNote, !p.alive && !state.over && state.round.phase !== 'ended');

      // Buy menu affordability, refreshed while open.
      if (hud.buyOpen) {
        const rows = el.buyRows.children;
        for (let i = 0; i < rows.length; i += 1) {
          const row = rows[i];
          const item = BUY_ITEMS[i];
          const afford = p.money >= item.price && state.round.phase === 'buy';
          if (row.disabled === afford) row.disabled = !afford;
        }
        set('buyNote', el.buyNote, state.round.phase === 'buy'
          ? `Balance $${p.money} — keys 1–7 or click. B closes.`
          : 'Buying is closed until the next round.');
      }

      // Scoreboard while Tab is held, or on the end overlay.
      const showBoard = input.state.keys.has('Tab') || hud.overlayKind === 'end';
      setVisible('board', el.scoreboard, showBoard);
      if (showBoard) {
        const rows = [state.player, ...state.bots]
          .slice()
          .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
          .map((c) => `<div class="score-row ${c.team === 'VG' ? 'vg' : 'wd'}${c.isPlayer ? ' me' : ''}">`
            + `<span>${c.name}${c.alive ? '' : ' ✝'}</span>`
            + `<span>${TEAM_NAME[c.team]}</span><span>${c.kills}</span><span>${c.deaths}</span><span>$${c.money}</span></div>`)
          .join('');
        if (last.board !== rows) {
          last.board = rows;
          el.scoreRows.innerHTML = rows;
        }
      }
    },
  };
  return hud;
}

function inSite(pos, site) {
  const dx = pos.x - site.x;
  const dz = pos.z - site.z;
  return dx * dx + dz * dz < site.r * site.r;
}
