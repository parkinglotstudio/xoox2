import '../ui/arcade.css';
import '../ui/lobby.css';
import { startLobby } from '../lobby/LobbyApp';

startLobby(document.getElementById('stage')!).catch(e => { console.error(e); document.getElementById('stage')!.insertAdjacentHTML('beforeend', `<div class="arc-loading"><div class="arc-loading-title">ASSET_MISSING</div><div class="arc-loading-msg">${String(e)}</div></div>`); });

import '../ui/complete.css';
import '../ui/ux03.css';
import '../ui/ux04.css';
