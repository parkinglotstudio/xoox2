import '../ui/arcade.css';
import '../ui/complete.css';
import '../ui/ux03.css';
import '../ui/ux04.css';
import { startGame } from '../app/GameApp';
import type { ProfileId } from '../config/ConfigStore';
startGame(document.getElementById('stage')!,document.body.dataset.profile as ProfileId);
