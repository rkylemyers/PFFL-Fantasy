// Interactive SVG Football Field Renderer & Multi-Play Stack Engine
class FootballField {
  constructor(svgId) {
    this.svg = document.getElementById(svgId);
    this.width = 1200;
    this.height = 533;
    this.fieldYards = 120; // 100 yards + 2 x 10yd end zones
    this.yardWidth = this.width / this.fieldYards;
    this.leftTeamName = "MENTALCOW";
    this.rightTeamName = "WARHORSE";
    this.initField();
  }

  setTeamNames(leftName, rightName) {
    this.leftTeamName = (leftName || "HOME").toUpperCase();
    this.rightTeamName = (rightName || "AWAY").toUpperCase();
    this.initField();
  }

  initField() {
    if (!this.svg) return;
    this.svg.innerHTML = ''; // Clear

    // 1. Grass Field Base
    const grass = this.createSVGElement('rect', {
      x: 0, y: 0, width: this.width, height: this.height, fill: '#163816'
    });
    this.svg.appendChild(grass);

    // 2. Alternating 5-Yard Grass Stripes
    for (let i = 10; i < 110; i += 5) {
      if ((i / 5) % 2 === 0) {
        const stripe = this.createSVGElement('rect', {
          x: i * this.yardWidth,
          y: 0,
          width: 5 * this.yardWidth,
          height: this.height,
          fill: 'rgba(255, 255, 255, 0.03)'
        });
        this.svg.appendChild(stripe);
      }
    }

    // 3. End Zones (10 Yds each)
    const leftEndzone = this.createSVGElement('rect', {
      x: 0, y: 0, width: 10 * this.yardWidth, height: this.height, fill: '#7b1113'
    });
    const rightEndzone = this.createSVGElement('rect', {
      x: 110 * this.yardWidth, y: 0, width: 10 * this.yardWidth, height: this.height, fill: '#143059'
    });
    this.svg.appendChild(leftEndzone);
    this.svg.appendChild(rightEndzone);

    // End Zone Text Labels (Dynamic Team Names - Extra Large & Bold)
    const ezText1 = this.createSVGText(this.leftTeamName.substring(0, 12), 5 * this.yardWidth, this.height / 2, {
      fill: '#ffffff', 'font-size': '44px', 'font-weight': '900', 'text-anchor': 'middle', 'font-family': 'Orbitron', transform: `rotate(-90 50 ${this.height/2})`
    });
    const ezText2 = this.createSVGText(this.rightTeamName.substring(0, 12), 115 * this.yardWidth, this.height / 2, {
      fill: '#ffffff', 'font-size': '44px', 'font-weight': '900', 'text-anchor': 'middle', 'font-family': 'Orbitron', transform: `rotate(90 1150 ${this.height/2})`
    });
    this.svg.appendChild(ezText1);
    this.svg.appendChild(ezText2);

    // 4. White Boundary Lines & Yard Markings
    const boundary = this.createSVGElement('rect', {
      x: 10 * this.yardWidth, y: 0, width: 100 * this.yardWidth, height: this.height,
      fill: 'none', stroke: '#ffffff', 'stroke-width': '4'
    });
    this.svg.appendChild(boundary);

    // 5. 10-Yard Major Line Markers & Numbers (Extra Large High-Visibility Numbers)
    for (let y = 10; y <= 110; y += 10) {
      const lineX = y * this.yardWidth;
      const line = this.createSVGElement('line', {
        x1: lineX, y1: 0, x2: lineX, y2: this.height,
        stroke: 'rgba(255, 255, 255, 0.75)', 'stroke-width': '2'
      });
      this.svg.appendChild(line);

      // Numbers (10, 20, 30, 40, 50, 40, 30, 20, 10)
      if (y > 10 && y < 110) {
        let fieldNum = y - 10;
        if (fieldNum > 50) fieldNum = 100 - fieldNum;

        const numBottom = this.createSVGText(fieldNum.toString(), lineX, this.height - 22, {
          fill: 'rgba(255, 255, 255, 0.95)', 'font-size': '30px', 'font-weight': '900', 'text-anchor': 'middle', 'font-family': 'Orbitron'
        });
        const numTop = this.createSVGText(fieldNum.toString(), lineX, 42, {
          fill: 'rgba(255, 255, 255, 0.95)', 'font-size': '30px', 'font-weight': '900', 'text-anchor': 'middle', 'font-family': 'Orbitron', transform: `rotate(180 ${lineX} 42)`
        });
        this.svg.appendChild(numBottom);
        this.svg.appendChild(numTop);
      }
    }

    // Play Overlay Layer Group
    this.playLayer = this.createSVGElement('g', { id: 'play-layer' });
    this.svg.appendChild(this.playLayer);
  }

  initTooltip() {
    let tooltip = document.getElementById('field-play-tooltip');
    if (!tooltip) {
      const wrapper = document.querySelector('.football-field-wrapper');
      if (wrapper) {
        tooltip = document.createElement('div');
        tooltip.id = 'field-play-tooltip';
        tooltip.className = 'field-play-tooltip';
        wrapper.appendChild(tooltip);
      }
    }
  }

  showTooltip(evt, data) {
    let tooltip = document.getElementById('field-play-tooltip');
    if (!tooltip) {
      this.initTooltip();
      tooltip = document.getElementById('field-play-tooltip');
    }
    if (!tooltip) return;

    tooltip.innerHTML = `
      <div class="tooltip-header">
        <span class="tooltip-player-name">${data.playerName}</span>
        <span class="tooltip-pts-badge ${data.isPos ? 'pos' : 'neg'}">${data.pts} PTS</span>
      </div>
      <div class="tooltip-desc">🏈 ${data.desc}</div>
      <div class="tooltip-meta">
        <span>${data.indexLabel}</span>
        <span>•</span>
        <span>GAIN: ${data.yards} YDS</span>
        <span>•</span>
        <span>START: ${data.startYard} YD LINE</span>
      </div>
    `;

    tooltip.classList.add('visible');
    this.positionTooltip(evt);
  }

  positionTooltip(evt) {
    const tooltip = document.getElementById('field-play-tooltip');
    const wrapper = document.querySelector('.football-field-wrapper');
    if (!tooltip || !wrapper) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    let left = evt.clientX - wrapperRect.left + 15;
    let top = evt.clientY - wrapperRect.top - 80;

    const tooltipWidth = tooltip.offsetWidth || 280;
    const tooltipHeight = tooltip.offsetHeight || 90;

    if (left + tooltipWidth > wrapperRect.width - 15) {
      left = evt.clientX - wrapperRect.left - tooltipWidth - 15;
    }
    if (left < 10) left = 10;
    if (top < 10) top = evt.clientY - wrapperRect.top + 20;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  hideTooltip() {
    const tooltip = document.getElementById('field-play-tooltip');
    if (tooltip) {
      tooltip.classList.remove('visible');
    }
  }

  // Render Last 5 Plays Stacked View
  // isRightToLeft: true for opponent team (moving right to left: 100 -> 0)
  renderPlayerLast5Plays(plays, isRightToLeft = false, playerMeta = null) {
    if (!this.playLayer) return;
    this.playLayer.innerHTML = ''; // Clear previous

    if (!plays || plays.length === 0) return;
    this.initTooltip();

    // Take up to 5 plays (most recent is index 0)
    const playList = plays.slice(0, 5);

    // Baseline Y positioning: Most recent play (index 0) is at the bottom (Y ~ 420), older plays stacked above it
    const baseY = 420;
    const ySpacing = 65; // Spacing between stacked play lines

    playList.forEach((play, index) => {
      const shrinkFactor = 1 - (index * 0.15); // Scale down 100% -> 85% -> 70% -> 55% -> 40%
      const playY = baseY - (index * ySpacing);
      const isPos = play.isPos !== false && !(play.pts && play.pts.startsWith('-'));
      const isTD = play.isTD || (play.desc && play.desc.includes("TOUCHDOWN"));
      const isBigPlay = play.isBigPlay || (play.desc && play.desc.includes("BIG PLAY")) || play.yards >= 20;

      // Color scheme based on play result (Touchdown = Gold, Big Play = Amber/Orange, Normal = Green/Red)
      let strokeColor = isPos ? '#00e676' : '#ff5252';
      let fillColor = isPos ? 'rgba(0, 230, 118, 0.25)' : 'rgba(255, 82, 82, 0.25)';

      if (isTD) {
        strokeColor = '#ffd600'; // Golden Touchdown
        fillColor = 'rgba(255, 214, 0, 0.40)';
      } else if (isBigPlay) {
        strokeColor = '#ff9100'; // Amber/Orange Big Play
        fillColor = 'rgba(255, 145, 0, 0.35)';
      }

      let startX, endX;
      if (!isRightToLeft) {
        // Left-to-Right progression (My Team: Mentalcow driving towards Warhorse End Zone)
        // 0 = My Goal Line (100 px), 100 = Opponent Goal Line (1100 px)
        startX = (10 + Math.min(100, Math.max(0, play.startYard))) * this.yardWidth;
        endX = (10 + Math.min(100, Math.max(0, play.startYard + play.yards))) * this.yardWidth;
      } else {
        // Right-to-Left progression (Opponent Team: Warhorse driving towards Mentalcow End Zone)
        // play.startYard is position relative to Mentalcow's Goal Line (0 = Mentalcow Goal Line, 100 = Warhorse Goal Line)
        startX = (10 + Math.min(100, Math.max(0, play.startYard))) * this.yardWidth;
        endX = (10 + Math.max(0, play.startYard - play.yards)) * this.yardWidth;
      }

      const boxMinX = Math.min(startX, endX);
      const boxWidth = Math.abs(endX - startX);
      const rectHeight = 36 * shrinkFactor;

      const playGroup = this.createSVGElement('g', {
        class: 'field-play-group',
        style: 'cursor: pointer;'
      });

      // 1. Invisible Hit Box (ensures easy hover targeting over large area)
      const hitBox = this.createSVGElement('rect', {
        x: Math.max(0, boxMinX - 15),
        y: playY - (rectHeight / 2) - 15,
        width: Math.max(boxWidth + 30, 60),
        height: rectHeight + 30,
        fill: 'transparent',
        class: 'play-hit-box'
      });
      playGroup.appendChild(hitBox);

      // 2. Play Yardage Highlight Patch Box
      const playRect = this.createSVGElement('rect', {
        x: boxMinX,
        y: playY - (rectHeight / 2),
        width: Math.max(boxWidth, 12),
        height: rectHeight,
        fill: fillColor,
        stroke: strokeColor,
        'stroke-width': (isTD || isBigPlay ? 3 : 2 * shrinkFactor).toString(),
        rx: '4',
        class: 'play-rect'
      });
      playGroup.appendChild(playRect);

      // 3. Play Trajectory Line
      const pathLine = this.createSVGElement('line', {
        x1: startX, y1: playY, x2: endX, y2: playY,
        stroke: strokeColor, 'stroke-width': (isTD || isBigPlay ? 7 : 5 * shrinkFactor).toString(),
        class: 'play-line'
      });
      playGroup.appendChild(pathLine);

      // 4. Play Spot End Circle (with Touchdown Star/Double Ring if TD)
      const spotCircle = this.createSVGElement('circle', {
        cx: endX, cy: playY, r: (isTD ? 15 : 12) * shrinkFactor,
        fill: strokeColor, stroke: '#ffffff', 'stroke-width': '2.5',
        class: 'play-circle'
      });
      playGroup.appendChild(spotCircle);

      if (isTD) {
        const tdRing = this.createSVGElement('circle', {
          cx: endX, cy: playY, r: 20 * shrinkFactor,
          fill: 'none', stroke: '#ffd600', 'stroke-width': '2',
          'stroke-dasharray': '3,3', class: 'td-ring'
        });
        playGroup.appendChild(tdRing);
      }

      // 5. Dark High-Contrast Background Pill & Extra Large Label Text
      let labelText = "";
      if (isTD) {
        labelText = `🚨 TOUCHDOWN! ${play.pts} PTS`;
      } else if (isBigPlay) {
        labelText = `🚨 BIG PLAY (+${play.yards} YDS)! ${play.pts} PTS`;
      } else {
        labelText = index === 0 ? `🔥 RECENT PLAY: ${play.pts} PTS` : `PLAY -${index}: ${play.pts} PTS`;
      }

      const fontSize = index === 0 ? 20 : Math.max(15, Math.round(18 * shrinkFactor));
      const centerX = (startX + endX) / 2;
      const textY = playY - (rectHeight / 2) - 10;

      const approxTextWidth = labelText.length * (fontSize * 0.64) + 18;
      const pillBg = this.createSVGElement('rect', {
        x: centerX - (approxTextWidth / 2),
        y: textY - fontSize + 2,
        width: approxTextWidth,
        height: fontSize + 8,
        fill: 'rgba(5, 10, 20, 0.95)',
        stroke: strokeColor,
        'stroke-width': '2',
        rx: '6',
        class: 'label-pill-bg'
      });
      playGroup.appendChild(pillBg);

      const playText = this.createSVGText(labelText, centerX, textY + 2, {
        fill: isTD ? '#ffd600' : (isBigPlay ? '#ff9100' : (isPos ? '#00e676' : '#ff5252')),
        'font-size': `${fontSize}px`,
        'font-weight': '900',
        'text-anchor': 'middle',
        'font-family': 'Orbitron',
        class: 'play-text'
      });
      playGroup.appendChild(playText);

      // Mouse Hover Events for Detailed Floating Popover & Header Summary Update
      const playerName = (playerMeta && playerMeta.name) || play.playerName || 'Player';
      const playDesc = play.desc || play.detailedPlayDesc || `${playerName} play for ${play.yards} yards`;

      playGroup.addEventListener('mouseenter', (evt) => {
        playRect.setAttribute('fill', isPos ? 'rgba(0, 230, 118, 0.45)' : 'rgba(255, 82, 82, 0.45)');
        playRect.setAttribute('stroke-width', (4 * shrinkFactor).toString());
        pathLine.setAttribute('stroke-width', (8 * shrinkFactor).toString());

        const summaryElem = document.getElementById('current-play-summary');
        if (summaryElem) {
          summaryElem.innerHTML = `<strong style="color: var(--accent-cyan);">${playerName}:</strong> ${playDesc} <span style="color: ${strokeColor}; font-weight: 800;">(${play.pts} pts)</span>`;
        }

        this.showTooltip(evt, {
          playerName: playerName,
          pts: play.pts,
          isPos: isPos,
          indexLabel: index === 0 ? 'MOST RECENT PLAY' : `PLAY -${index}`,
          desc: playDesc,
          startYard: play.startYard,
          yards: play.yards
        });
      });

      playGroup.addEventListener('mousemove', (evt) => {
        this.positionTooltip(evt);
      });

      playGroup.addEventListener('mouseleave', () => {
        playRect.setAttribute('fill', fillColor);
        playRect.setAttribute('stroke-width', (2 * shrinkFactor).toString());
        pathLine.setAttribute('stroke-width', (5 * shrinkFactor).toString());
        this.hideTooltip();
      });

      this.playLayer.appendChild(playGroup);
    });
  }

  clearPlay() {
    if (this.playLayer) this.playLayer.innerHTML = '';
    this.hideTooltip();
  }

  createSVGElement(tag, attrs) {
    const elem = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (let key in attrs) {
      elem.setAttribute(key, attrs[key]);
    }
    return elem;
  }

  createSVGText(str, x, y, attrs) {
    const text = this.createSVGElement('text', { x: x, y: y, ...attrs });
    text.textContent = str;
    return text;
  }
}

window.FootballField = FootballField;
