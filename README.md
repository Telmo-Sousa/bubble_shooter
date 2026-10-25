# Bubble Shooter

Browser survival shooter (plain HTML/CSS/JS, no build step, no dependencies). Host the folder as static files; open `index.html` or serve it. Optional sound files go in `audio/` (`shoot.wav`, `hit.wav`, `powerUp.wav`, `gameOver.wav`); the game runs silently if they are missing.

*(Your original README was not provided, so this one is new. Merge it with yours.)*

## Controls
| | Desktop | Touch |
|---|---|---|
| Move | WASD / arrow keys | Left thumb (floating joystick) |
| Aim | Mouse | Right thumb (floating joystick) |
| Shoot | Click or hold | Hold the right stick (auto-fire) |
| Reload | R | Reload button |
| Pause | P / Esc | Pause button (top right) |

The game also pauses when the tab or window loses focus.

## Features
- Fixed 240 Hz physics step with accumulator; rendering runs separately on `requestAnimationFrame`.
- Ammo: 12-round magazine, 48 reserve (max 96), 1.1 s reload, auto-reload when empty, manual reload.
- Drops: Ammo (A), Fast (F), Multi-shot (M), Shield (O, absorbs one hit), Bonus (+50 score). Each has a letter, so none rely on colour alone. 12 s lifetime, blink before expiry, max 4 on screen, higher ammo-drop chance when ammo is low. Timed effects refresh rather than stack.
- Hit flash, muzzle flash, impact particles, pickup text, best score (localStorage), Sound / Effects / Theme toggles in the Start and Pause menus (saved). Effects default to reduced when the OS requests reduced motion.
- Responsive canvas (DPR capped at 2). Resizing or rotating keeps the run and rescales positions.

## Requirements

- Supported Browser: A modern web browser with support for HTML5 and Canvas API (e.g., Google Chrome, Mozilla Firefox, Microsoft Edge, Safari).
- JavaScript Enabled: Ensure that JavaScript is enabled in the browser settings.
- Internet Connection: The game files must be hosted on a web server or run on a local server for full functionality.

## Installation

```bash
git clone https://github.com/Telmo-Sousa/bubble_shooter.git
```

```bash
cd bubble_shooter
```

```bash
open index.html
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
