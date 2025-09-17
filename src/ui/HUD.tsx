import React from 'react';
import './hud.css';

type PlayerInfo = {
  uid: string;
  nick: string;
  hp: number;
};

type HUDProps = {
  players: PlayerInfo[];
};

const MAX_HP = 100;

function normalizeHp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(value, MAX_HP));
}

const HUD: React.FC<HUDProps> = ({ players }) => {
  if (!players || players.length === 0) {
    return null;
  }
  return (
    <div className="hud-root">
      {players.map((player) => {
        const hp = normalizeHp(player.hp);
        const percent = (hp / MAX_HP) * 100;
        return (
          <div className="hud-player" key={player.uid}>
            <span className="hud-nick">{player.nick}</span>
            <div className="hud-bar">
              <div className="hud-bar-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default HUD;
