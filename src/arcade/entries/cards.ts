import '../ui/arcade.css';
import '../ui/lobby.css';
import { startCards } from '../lobby/CardsApp';

startCards(document.getElementById('stage')!).catch(e => { console.error(e); document.getElementById('stage')!.insertAdjacentHTML('beforeend', `<div class="arc-loading"><div class="arc-loading-title">CONFIG_INVALID</div><div class="arc-loading-msg">${String(e)}</div></div>`); });
